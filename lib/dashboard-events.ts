// Funnel + placement events, ONE read shared by every page that needs them.
//
// Moved out of app/admin/dashboard/page.tsx (owner, 2026-08-29, asking for
// /admin/insights to carry the funnel visualization and the CTA table): the
// insights page needs the exact same placements a second copy of this
// 250-line stitching algorithm would have been a second implementation of
// the same rule, which is the one thing this codebase keeps learning not to
// do (see bucketKey/bucketEnd's own move to lib/trial-entries.ts for the
// same reason). One function, every caller.

import { createClient } from '@supabase/supabase-js'
import { bucketKey, type Gran } from '@/lib/trial-entries'
import { LAUNCH_ISO } from '@/lib/dashboard-queries'
import type { FunnelEventCounts } from '@/app/admin/dashboard/DashboardBento.client'

const GRANS: Gran[] = ['day', 'week', 'month']

export type EventBuckets = Record<Gran, Record<string, { views: number; starts: number; checkout: number }>>

/** One cohort cell of the per-person funnel. jLanded is people whose first
 *  landing view fell in this bucket; jLandStarted is how many of THOSE went on
 *  to start, whenever that happened. Rates from these cannot exceed 100%. */
export type JourneyCell = { jLanded: number; jThenStarted: number; jThenCompleted: number; jThenClicked: number; jDirect: number; jDirectQuiz: number; jDirectResult: number; bThenCompleted: number; bThenClicked: number; cThenClicked: number }

/** Placement counts as they come off the events read, before the sales join.
 *  `clickerIds` are the submissions that clicked this button, which is what
 *  turns "gets clicked" into "gets paid" once the CRM rows are in hand. */
export type RawPlacement = { placement: string; views: number; clicks: number; clickerIds: string[] }

// Funnel + placement events, all in the ONE launch window (since Jul 5), bucketed
// by day / week / month so the progression charts can toggle granularity.
export async function loadEventStats(): Promise<{ firstEventAt: string | null; funnel: FunnelEventCounts; placements: RawPlacement[]; eventBuckets: EventBuckets; journeyBuckets: Record<Gran, Record<string, JourneyCell>>; completionSids: Set<string>; journeyOfSid: Map<string, { door: 'a' | 'b' | 'c'; landTs?: number }> }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  const emptyBuckets: EventBuckets = { day: {}, week: {}, month: {} }
  const emptyJourneys: Record<Gran, Record<string, JourneyCell>> = { day: {}, week: {}, month: {} }
  const empty = { firstEventAt: null, funnel: { landing: 0, started: 0, checkout: 0, jLanded: 0, jThenStarted: 0, jThenCompleted: 0, jThenClicked: 0, jDirect: 0, jDirectQuiz: 0, jDirectResult: 0, bThenCompleted: 0, bThenClicked: 0, cThenClicked: 0 }, placements: [] as RawPlacement[], eventBuckets: emptyBuckets, journeyBuckets: emptyJourneys, completionSids: new Set<string>(), journeyOfSid: new Map<string, { door: 'a' | 'b' | 'c'; landTs?: number }>() }
  if (!url || !key) return empty
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
  const uniq = { landing: new Set<string>(), started: new Set<string>(), checkout: new Set<string>() }
  const pl = new Map<string, { views: Set<string>; clicks: Set<string>; buyers: Set<string> }>()
  // Per-granularity unique-actor sets: gran → bucket → {views,starts,checkout}.
  const ev: Record<Gran, Map<string, { views: Set<string>; starts: Set<string>; checkout: Set<string> }>> = { day: new Map(), week: new Map(), month: new Map() }
  const bump = (gran: Gran, bucket: string, kind: 'views' | 'starts' | 'checkout', who: string) => {
    if (!bucket) return
    const m = ev[gran]
    const e = m.get(bucket) || { views: new Set<string>(), starts: new Set<string>(), checkout: new Set<string>() }
    e[kind].add(who); m.set(bucket, e)
  }
  // Hard ceiling raised and made honest. It was 50,000 while the launch window
  // already held 47,459 events on 2026-08-09, so within days this would have
  // started silently DROPPING the newest data: the read is ordered ascending,
  // so a truncated page loses the most recent events, and every funnel count
  // would have quietly frozen. It logs now instead of failing in silence.
  // THE PER-PERSON FUNNEL. One entry per actor, holding the FIRST time they
  // hit each stage. Every step rate is built from this, so a rate means "of
  // the people who did A, how many went on to B", same person, timestamps in
  // order. It replaces dividing one day's distinct quiz_starters by the same
  // day's distinct landing-viewers — two unrelated populations, which is how
  // the matrix printed a 111% step and 20 landings against 20 results
  // (owner, 2026-08-12): a person arriving at /result from an email link was
  // being credited to a landing page they never saw.
  const journeys = new Map<string, { land?: number; start?: number; result?: number; click?: number }>()
  // IDENTITY STITCHING (2026-08-13). Journeys used to be keyed by the anon
  // cookie, which is a DEVICE, not a person: someone who starts the quiz on
  // their phone and finishes from the email link on their laptop was two
  // strangers — the finish landed in door C and the start looked abandoned.
  // Measured cost of that keying: the camera saw 82% of the register when
  // 94% of instrumented-era submissions have their result_view in events,
  // keyed by submission id. So: any two device keys that ever share a
  // submission_id are the same person; their journeys merge, taking the
  // earliest timestamp per stage. Actor tallies below (uniq/bump/pl) stay
  // device-keyed on purpose — they count devices seeing pages, not journeys.
  const sidToKey = new Map<string, string>()
  const aliasOf = new Map<string, string>()
  const resolveKey = (k: string) => { let x = k; while (aliasOf.has(x)) x = aliasOf.get(x)!; return x }
  // Which SUBMISSIONS the camera saw complete (result_view or the server-side
  // quiz_submit row). Register-clocked coverage is computed from this set, so
  // the matrix can show the true register headcount with an exact on-camera /
  // off-camera split per column — same clock, per-submission facts, sums by
  // construction. This is what restores "the completions used to be correct"
  // (owner, 2026-08-13) without giving back the broken blended rates.
  const completionSids = new Set<string>()

  const MAX_EVENTS = 400_000
  const PAGE = 1000
  let truncated = true
  for (let offset = 0; offset < MAX_EVENTS; offset += PAGE) {
    const { data, error } = await c
      .from('funnel_events')
      .select('event, anon_id, session_id, submission_id, props, ts')
      .gte('ts', `${LAUNCH_ISO}T00:00:00Z`)
      .order('ts', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error || !data) break
    for (const r of data as { event: string; anon_id: string | null; session_id: string | null; submission_id: string | null; props: Record<string, unknown> | null; ts: string }[]) {
      // Unique ACTORS (matches count(distinct coalesce(anon_id,session_id))).
      // Skip rows with no identifier so counts aren't inflated to row totals.
      const who = r.anon_id || r.session_id
      if (!who) continue
      if (r.submission_id && (r.event === 'result_view' || r.event === 'quiz_submit')) completionSids.add(r.submission_id)
      // quiz_submit is the SERVER-side completion row, written by the submit
      // endpoint in the same request as the submission itself (2026-08-13).
      // It maps to the completion stage AND marks the start: submitting proves
      // they started, even when every client event was blocked — without the
      // start mark, a fully-blocked completer would file under door C as if
      // they never took the quiz. min() keeps real client timestamps whenever
      // those exist.
      const stage = r.event === 'quiz_view' ? 'land' as const
        : r.event === 'quiz_start' ? 'start' as const
        : r.event === 'result_view' || r.event === 'quiz_submit' ? 'result' as const
        : r.event === 'checkout_click' ? 'click' as const : null
      if (stage) {
        let key = resolveKey(who)
        if (r.submission_id) {
          const owner = sidToKey.get(r.submission_id)
          if (owner === undefined) {
            sidToKey.set(r.submission_id, key)
          } else {
            const root = resolveKey(owner)
            if (root !== key) {
              // Same submission seen from a second device: merge this key's
              // journey into the first one, earliest timestamp per stage wins.
              const a = journeys.get(key)
              if (a) {
                const b = journeys.get(root) || {}
                for (const s of ['land', 'start', 'result', 'click'] as const) {
                  const t = a[s]
                  if (t !== undefined && (b[s] === undefined || t < b[s]!)) b[s] = t
                }
                journeys.set(root, b)
                journeys.delete(key)
              }
              aliasOf.set(key, root)
              key = root
            }
          }
        }
        const t = Date.parse(r.ts)
        const j = journeys.get(key) || {}
        const cur = j[stage]
        if (cur === undefined || t < cur) { j[stage] = t; journeys.set(key, j) }
        if (r.event === 'quiz_submit' && (j.start === undefined || t < j.start)) {
          j.start = t
          journeys.set(key, j)
        }
      }
      const kind = r.event === 'quiz_view' ? 'views' : r.event === 'quiz_start' ? 'starts' : r.event === 'checkout_click' ? 'checkout' : null
      if (kind) { for (const g of GRANS) bump(g, bucketKey(r.ts, g), kind, who) }
      if (r.event === 'quiz_view') uniq.landing.add(who)
      else if (r.event === 'quiz_start') uniq.started.add(who)
      else if (r.event === 'checkout_click') {
        uniq.checkout.add(who)
        const p = typeof r.props?.placement === 'string' ? (r.props.placement as string) : '(unknown)'
        const e = pl.get(p) || { views: new Set<string>(), clicks: new Set<string>(), buyers: new Set<string>() }
        e.clicks.add(who)
        // Keep WHO clicked, so "which button gets clicked" can become "which
        // button gets PAID". 96% of checkout_click rows carry a submission id.
        if (r.submission_id) e.buyers.add(r.submission_id)
        pl.set(p, e)
      } else if (r.event === 'placement_view') {
        const p = typeof r.props?.placement === 'string' ? (r.props.placement as string) : '(unknown)'
        const e = pl.get(p) || { views: new Set<string>(), clicks: new Set<string>(), buyers: new Set<string>() }
        e.views.add(who); pl.set(p, e)
      }
    }
    if (data.length < PAGE) { truncated = false; break }
  }
  if (truncated) console.warn(`[dashboard] event read hit the ${MAX_EVENTS} ceiling — funnel counts are UNDERSTATED and the newest events are missing`)

  // ONE COHORT, ROOTED AT THE LANDING PAGE, so every column multiplies down:
  // jLanded × rate = jThenStarted, which is a SUBSET of jLanded, and so on.
  // The first repair kept the station counts as independent tallies while the
  // rates became cohort shares, so the table said "266 → 56% → 216" — two true
  // numbers from two populations that do not multiply (owner, 2026-08-12).
  // People who enter the quiz WITHOUT the landing page (email links, embeds,
  // shared results) are real and are shown, but as their own row, never mixed
  // into the landing chain.
  const emptyJourneyCell = (): JourneyCell => ({ jLanded: 0, jThenStarted: 0, jThenCompleted: 0, jThenClicked: 0, jDirect: 0, jDirectQuiz: 0, jDirectResult: 0, bThenCompleted: 0, bThenClicked: 0, cThenClicked: 0 })
  const jBuckets: Record<Gran, Map<string, JourneyCell>> = { day: new Map(), week: new Map(), month: new Map() }
  const jTotals = emptyJourneyCell()
  const jAdd = (g: Gran, ts: number, f: (c: JourneyCell) => void) => {
    const b = bucketKey(new Date(ts).toISOString(), g)
    if (!b) return
    const c = jBuckets[g].get(b) || emptyJourneyCell()
    f(c); jBuckets[g].set(b, c)
  }
  for (const j of Array.from(journeys.values())) {
    const landedFirst = j.land !== undefined &&
      (j.start === undefined || j.start >= j.land) &&
      (j.start !== undefined || j.result === undefined || j.result >= j.land)
    if (landedFirst) {
      // The chain: each flag requires the previous one, so each count is a
      // subset of the one before it and the column multiplies exactly.
      const started = j.start !== undefined
      const completed = started && j.result !== undefined && j.result >= j.start!
      const clicked = completed && j.click !== undefined && j.click >= j.result!
      jTotals.jLanded++
      if (started) jTotals.jThenStarted++
      if (completed) jTotals.jThenCompleted++
      if (clicked) jTotals.jThenClicked++
      for (const g of GRANS) jAdd(g, j.land!, c => {
        c.jLanded++
        if (started) c.jThenStarted++
        if (completed) c.jThenCompleted++
        if (clicked) c.jThenClicked++
      })
    } else if (j.start !== undefined || j.result !== undefined) {
      // Entered mid-funnel: quiz or result reached with no landing view first.
      // WHERE they entered matters, because the two doors are different
      // channels: quiz entry is campaign links and the homepage slider embed,
      // result entry is recovery emails and shared passes.
      const atQuiz = j.start !== undefined && (j.result === undefined || j.start <= j.result)
      const at = atQuiz ? j.start! : j.result!
      // Door B and door C get their own multiplying chains, same subset rule
      // as the landing chain: each flag requires the one before it.
      const bCompleted = atQuiz && j.result !== undefined && j.result >= j.start!
      const bClicked = bCompleted && j.click !== undefined && j.click >= j.result!
      const cClicked = !atQuiz && j.click !== undefined && j.click >= j.result!
      jTotals.jDirect++
      if (atQuiz) jTotals.jDirectQuiz++; else jTotals.jDirectResult++
      if (bCompleted) jTotals.bThenCompleted++
      if (bClicked) jTotals.bThenClicked++
      if (cClicked) jTotals.cThenClicked++
      for (const g of GRANS) jAdd(g, at, c => {
        c.jDirect++
        if (atQuiz) c.jDirectQuiz++; else c.jDirectResult++
        if (bCompleted) c.bThenCompleted++
        if (bClicked) c.bThenClicked++
        if (cClicked) c.cThenClicked++
      })
    }
  }
  const journeyBuckets: Record<Gran, Record<string, JourneyCell>> = { day: {}, week: {}, month: {} }
  for (const g of GRANS) for (const [b, c] of Array.from(jBuckets[g])) journeyBuckets[g][b] = c
  // Which door each SUBMISSION's journey walked through — the register row's
  // on-page decomposition ("those numbers are not on the matrix, how am i
  // supposed to know", owner, 2026-08-13). Same journeys map and the same
  // predicates as the door aggregation above, keyed by submission id so
  // buildSeries can bucket the split on the REGISTER clock and the parts sum
  // to the register row exactly, per column, on the page.
  const journeyOfSid = new Map<string, { door: 'a' | 'b' | 'c'; landTs?: number }>()
  for (const [sid, rawKey] of Array.from(sidToKey)) {
    const j = journeys.get(resolveKey(rawKey))
    if (!j) continue
    const landedFirst = j.land !== undefined &&
      (j.start === undefined || j.start >= j.land) &&
      (j.start !== undefined || j.result === undefined || j.result >= j.land)
    if (landedFirst) journeyOfSid.set(sid, { door: 'a', landTs: j.land })
    else if (j.start !== undefined && (j.result === undefined || j.start <= j.result)) journeyOfSid.set(sid, { door: 'b' })
    else if (j.result !== undefined) journeyOfSid.set(sid, { door: 'c' })
  }
  // When client instrumentation actually started. The quiz launched Jul 5 but
  // the first funnel_event is Jul 9, so the first days have NO event data at
  // all. Printing 0 there reads as "nobody visited", which is false and made
  // the launch-week column look broken. Buckets are marked instead.
  let firstEventAt: string | null = null
  for (const g of GRANS) {
    for (const [bucket] of Array.from(ev[g])) {
      if (g === 'day' && (!firstEventAt || bucket < firstEventAt)) firstEventAt = bucket
    }
  }
  const eventBuckets: EventBuckets = { day: {}, week: {}, month: {} }
  for (const g of GRANS) for (const [bucket, s] of Array.from(ev[g])) eventBuckets[g][bucket] = { views: s.views.size, starts: s.starts.size, checkout: s.checkout.size }
  return {
    firstEventAt,
    funnel: { landing: uniq.landing.size, started: uniq.started.size, checkout: uniq.checkout.size, ...jTotals },
    placements: Array.from(pl.entries())
      .map(([placement, s]) => ({ placement, views: s.views.size, clicks: s.clicks.size, clickerIds: Array.from(s.buyers) }))
      .sort((a, b) => b.views - a.views || b.clicks - a.clicks),
    eventBuckets,
    journeyBuckets,
    completionSids,
    journeyOfSid,
  }
}
