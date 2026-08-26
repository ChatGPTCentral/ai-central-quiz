import { createClient } from '@supabase/supabase-js'
import {
  filteredSubmissionsAll,
  parseFilters,
  LAUNCH_ISO,
  MIRROR_START_ISO,
  LAUNCH_LABEL,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import {
  classifyLedger,
  loadLedgerAndCharges,
  bucketKey,
  bucketEnd,
  type Entry,
  type TrialPoint,
  type Gran,
} from '@/lib/trial-entries'
import DashboardArea from './DashboardArea.client'
import LedgerHealth from '@/components/admin/LedgerHealth'
import UxHealth from '@/components/admin/UxHealth'
import XraySection from '@/components/admin/XraySection'
import type { UxSignal } from '@/lib/ux-watch'
import type { CheckResult } from '@/lib/ledger-invariants'
import { type BentoRow, type FunnelEventCounts, type PlacementStat, type SeriesPoint, type Series } from './DashboardBento.client'

export const dynamic = 'force-dynamic'
export const revalidate = 30

// bucketKey / bucketEnd moved to lib/trial-entries.ts: the drill endpoint has
// to bucket exactly the way this page does, and a copied date function is a
// disagreement waiting to happen.
const GRANS: Gran[] = ['day', 'week', 'month']

type EventBuckets = Record<Gran, Record<string, { views: number; starts: number; checkout: number }>>

/** One cohort cell of the per-person funnel. jLanded is people whose first
 *  landing view fell in this bucket; jLandStarted is how many of THOSE went on
 *  to start, whenever that happened. Rates from these cannot exceed 100%. */
type JourneyCell = { jLanded: number; jThenStarted: number; jThenCompleted: number; jThenClicked: number; jDirect: number; jDirectQuiz: number; jDirectResult: number; bThenCompleted: number; bThenClicked: number; cThenClicked: number }

/** Placement counts as they come off the events read, before the sales join.
 *  `clickerIds` are the submissions that clicked this button, which is what
 *  turns "gets clicked" into "gets paid" once the CRM rows are in hand. */
type RawPlacement = { placement: string; views: number; clicks: number; clickerIds: string[] }

// Funnel + placement events, all in the ONE launch window (since Jul 5), bucketed
// by day / week / month so the progression charts can toggle granularity.
async function loadEventStats(): Promise<{ firstEventAt: string | null; funnel: FunnelEventCounts; placements: RawPlacement[]; eventBuckets: EventBuckets; journeyBuckets: Record<Gran, Record<string, JourneyCell>>; completionSids: Set<string>; journeyOfSid: Map<string, { door: 'a' | 'b' | 'c'; landTs?: number }> }> {
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

// The matrix's money rows, read from trial_ledger — THE single source of
// truth (see /admin/revenue). This function used to classify raw charges
// itself, which meant the same rules lived in two places and drifted; now the
// database owns the rules and this only decides which CLOCK each row sits on.
//
// 'net'          quiz earned the trial from someone who had never paid. Quiz clock.
// 'quizExisting' quiz earned the trial from an existing customer. Quiz clock.
// 'notQuiz'      never took the quiz, or took it after paying. Charge clock.
// 'annual'       the conversion that trial produced, on ITS TRIAL'S clock, so
//                a week column answers "what did that week's trials become".
// 'other'        every remaining dollar in the account: legacy subscriptions,
//                old annual prices, duplicate subscriptions. Charge clock.
// Conversion money is split by WHO earned the trial behind it, because "what
// did the quiz produce" has to include the renewals its trials went on to pay.
// Two real kinds rather than a shadow tag, so ALL REVENUE stays a plain sum of
// its parts and nothing can be double-counted.
//
// The classification itself lives in lib/trial-entries.ts because
// /api/admin/drill replays it to answer "which rows made this cell". A
// drill-down that re-queried would be a second implementation of the same
// rules, which is how every number in this project that disagreed with itself
// got that way.

async function revenueCharges(): Promise<{
  entries: Entry[]
  mirrored: number
  /** $54.74 bundles ($4.99 trial + $49.75 lifetime) inside the numbers. */
  lifetimeSplits: number
  /** Conversions whose trial cohort predates the visible window. Attributed to
   *  their real (off-screen) cohort and disclosed, never shown under a recent
   *  week that could not have produced them. */
  preWindowAnnuals: number
  /** Emails of quiz-earned trials from EXISTING customers, for the north star. */
  quizExistingEmails: Set<string>
  /** Emails of NET-NEW trial buyers. The ledger decides this rather than a
   *  second computation over submissions: the two agreed at 71 each today, but
   *  they agreed by coincidence of two code paths, and every number in this
   *  project that was computed twice eventually disagreed. */
  netNewEmails: Set<string>
  /** People holding more than one paid trial. Owner's rule 2 and 5: they all
   *  count, so this is a fact about the customer base, not a deduction. */
  quizRepeatTrials: number
  /** Every trial with the clock it sits on, whether its renewal date has
   *  passed, and whether it converted. The Trial→annual row is built from
   *  THIS, not from a lifetime-value threshold on submissions — that older
   *  path called a Jun-29 cohort 0% while the ledger showed it converting,
   *  which is exactly the two-sources problem this rebuild exists to kill. */
  trialPoints: TrialPoint[]
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  const empty = { entries: [], mirrored: 0, lifetimeSplits: 0, quizRepeatTrials: 0, preWindowAnnuals: 0, quizExistingEmails: new Set<string>(), netNewEmails: new Set<string>(), trialPoints: [] }
  if (!url || !key) return empty
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })

  const { ledger, charges } = await loadLedgerAndCharges(c)

  // ONE classification pass, shared with /api/admin/drill so the drawer that
  // opens a cell lists the very entries that were summed into it.
  const { entries, trialPoints, lifetimeSplits, preWindowAnnuals, quizExistingEmails, netNewEmails } =
    classifyLedger(ledger, charges, MIRROR_START_ISO)

  // People holding more than one paid trial. This used to be the count of
  // trials the ledger threw away as duplicates; nothing is thrown away now
  // (owner's rules 1, 2 and 5), so it is simply how many people bought twice.
  const perPerson = new Map<string, number>()
  for (const t of ledger) {
    if (t.trial_refunded) continue
    perPerson.set(t.person_key, (perPerson.get(t.person_key) || 0) + 1)
  }
  const quizRepeatTrials = Array.from(perPerson.values()).filter(n => n > 1).length

  return { entries, mirrored: charges.length, lifetimeSplits, quizRepeatTrials, preWindowAnnuals, quizExistingEmails, netNewEmails, trialPoints }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const sp = new URLSearchParams(searchParams as Record<string, string>)
  const filters: DashboardFilters = parseFilters(sp)
  if (!filters.sample) filters.sample = 'launch'
  const sample = filters.sample

  let error: string | null = null
  let allRows: Awaited<ReturnType<typeof filteredSubmissionsAll>> = []
  let events = { firstEventAt: null as string | null, funnel: { landing: 0, started: 0, checkout: 0, jLanded: 0, jThenStarted: 0, jThenCompleted: 0, jThenClicked: 0, jDirect: 0, jDirectQuiz: 0, jDirectResult: 0, bThenCompleted: 0, bThenClicked: 0, cThenClicked: 0 }, placements: [] as RawPlacement[], eventBuckets: { day: {}, week: {}, month: {} } as EventBuckets, journeyBuckets: { day: {}, week: {}, month: {} } as Record<Gran, Record<string, JourneyCell>>, completionSids: new Set<string>(), journeyOfSid: new Map<string, { door: 'a' | 'b' | 'c'; landTs?: number }>() }
  try {
    ;[allRows, events] = await Promise.all([filteredSubmissionsAll(filters), loadEventStats()])
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const isUncertain = (v?: string | null) => !v || v.toLowerCase() === 'uncertain'
  const cleanUtm = (s?: string) => (s || '').trim() || null

  // LOAD ORDER IS LOAD-BEARING: the row projection below reads
  // rev.quizExistingEmails inside a .map callback that runs synchronously, so
  // `rev` must already be initialised. When this sat BELOW the projection the
  // dashboard threw a temporal-dead-zone ReferenceError in production
  // (2026-08-10, digest 1002650819) — and tsc could not see it, because a
  // const referenced through a closure looks legitimate to the type checker.
  //
  // The matrix's five revenue rows AND the "Not from the quiz" count, all from
  // ONE classification pass over REAL charges in the stripe_charges mirror.
  //
  // The count used to come from a separate submissions-based query while the
  // revenue came from the mirror, and on 2026-08-10 the two visibly disagreed
  // (3 people vs 5 charges in one week): the submissions path could not see
  // Stripe-only buyers or re-trialing old customers, and it counted people at
  // their FIRST-EVER charge while the mirror counts trials. One pass, one
  // truth: the count row is now exactly the notQuiz first-trial entries, so
  // count × $4.99 equals the revenue row by construction.
  const rev = await revenueCharges()
  const notQuizTrialEntries = rev.entries.filter(e => e.kind === 'notQuiz')
  const quizExistingEntries = rev.entries.filter(e => e.kind === 'quizExisting')


  // One projection per person.
  //
  // Net-new keys on quiz_completed_at, which is write-once and trigger-
  // enforced. It used to key on created_at, which means "first seen in the CRM
  // by any route" and is only set by the quiz on INSERT. So a reader who was
  // already a Stripe customer kept their old date, and paying 15 months BEFORE
  // taking the quiz still read as net-new because the charge was one second
  // after the stale created_at. Four such rows were inflating this number.
  const rows: BentoRow[] = allRows.map(r => {
    const quizAt = r.quizCompletedAt
    // THE LEDGER DECIDES. This used to recompute net-new from
    // stripe_first_charge_at vs quiz_completed_at, a second implementation of
    // a rule the ledger already owns. Same answer today, but "computed twice"
    // is how every drift in this project started.
    const emailKey = r.email?.trim().toLowerCase() || null
    const netNew = !!(emailKey && rev.netNewEmails.has(emailKey))
    // THE NORTH STAR, per the owner 2026-08-10: trials the QUIZ produced,
    // whether the buyer was new to us or already a customer. Category B comes
    // from the charge-level pass (a real $4.99 trial after their quiz), never
    // from "they had some charge later", which a monthly renewal would fake.
    const quizTrial = netNew || (!!emailKey && rev.quizExistingEmails.has(emailKey))
    const sexRaw = r.sexAiEstimate
    return {
      stage: r.stage || 'unknown',
      age: isUncertain(r.ageBracket || r.ageAiEstimate) ? null : (r.ageBracket || r.ageAiEstimate)!,
      sex: isUncertain(sexRaw) ? null : sexRaw!.charAt(0).toUpperCase() + sexRaw!.slice(1).toLowerCase(),
      country: r.country || null,
      industry: r.companyIndustry || null,
      role: r.jobTitleStandardized || r.seniority || r.jobLevel || null,
      size: r.companySize || null,
      utmQuiz: cleanUtm(r.utmSource),
      utmNewsletter: cleanUtm(r.utmSourceBeehiiv),
      ltv: r.lifetimeValueUsd || 0,
      netNew,
      quizTrial,
    }
  })

  // "Which CTA gets clicked" becomes "which CTA gets PAID".
  // A click rate on its own has already misled us once: the click-quality
  // guardrail found the arm with MORE clicks selling LESS. So the placement
  // table now carries the only number that settles it, how many of the people
  // who clicked that button went on to pay, and what they were worth.
  const paidById = new Map<string, { netNew: boolean; ltv: number }>()
  for (let i = 0; i < allRows.length; i++) {
    const id = allRows[i]?.id
    if (id) paidById.set(String(id), { netNew: rows[i].netNew, ltv: rows[i].ltv })
  }
  const placements: PlacementStat[] = events.placements.map(p => {
    let sales = 0
    let revenue = 0
    for (const id of p.clickerIds ?? []) {
      const hit = paidById.get(id)
      if (hit?.netNew) { sales++; revenue += hit.ltv }
    }
    return { placement: p.placement, views: p.views, clicks: p.clicks, sales, revenue }
  })

  // ── Weekly/daily/monthly progression series (since launch) ──
  // Completions + net-new bucket on the same quiz_completed_at as the KPIs, so
  // a person lands in the week they actually took the quiz rather than the week
  // they first appeared in the CRM. Event counts come from the one events read.
  // Built for all three granularities so each chart can toggle day/week/month.
  const nowIso = new Date().toISOString()
  const buildSeries = (gran: Gran): SeriesPoint[] => {
    const launchBucket = bucketKey(`${LAUNCH_ISO}T00:00:00Z`, gran)
    const nowBucket = bucketKey(nowIso, gran)
    // A trial bills the annual one month later, so a trial younger than that
    // has not FAILED to convert, it simply is not due. Counting it against the
    // rate would drag every recent period to zero and make the number useless.
    const DUE_AFTER_MS = 32 * 24 * 60 * 60 * 1000
    const nowMs = Date.now()

    // CLEAN counters: completions and paid restricted to days that actually
    // had client tracking. A month like Jul 2026 contains untracked days
    // (tracking began 9 Jul), and mixing them in produced step rates whose
    // numerator and denominator described different windows — a real
    // completion divided by views that were never recorded. Rates use these.
    const clean = new Map<string, { completed: number; netNew: number }>()
    const subs = new Map<string, { completed: number; completedSeen: number; viaASame: number; viaAOther: number; viaB: number; viaCOnly: number; netNew: number; revenue: number; mature: number; billedAnnual: number }>()
    for (const r of allRows) {
      // Same anchor as the KPIs above, so a person lands in the week they took
      // the quiz and the charts cannot disagree with the numbers beside them.
      // This is also why a LATE converter restates history rather than landing
      // in the week they happened to pay: the cohort owns the sale.
      const quizAt = r.quizCompletedAt
      if (!quizAt) continue
      const b = bucketKey(quizAt, gran)
      if (!b || b < launchBucket) continue
      const e = subs.get(b) || { completed: 0, completedSeen: 0, viaASame: 0, viaAOther: 0, viaB: 0, viaCOnly: 0, netNew: 0, revenue: 0, mature: 0, billedAnnual: 0 }
      e.completed++
      // Register-clocked camera coverage: this SUBMISSION either has a
      // completion event (result_view or server quiz_submit) or it does not.
      // Same bucket as the register row it describes, so seen + off-camera
      // always sums to completed, exactly, per column.
      if (events.completionSids.has(r.id)) e.completedSeen++
      // The register row's on-page decomposition: which door this person's
      // stitched journey walked through, bucketed HERE, on the register
      // clock, so the four parts plus the off-camera remainder sum to
      // `completed` exactly in every column. viaAOther = landed in a
      // DIFFERENT column than they completed, the clock-skew case that makes
      // door rows not sum into register columns.
      const jc = events.journeyOfSid.get(r.id)
      if (jc?.door === 'a') {
        if (jc.landTs !== undefined && bucketKey(new Date(jc.landTs).toISOString(), gran) === b) e.viaASame++
        else e.viaAOther++
      } else if (jc?.door === 'b') e.viaB++
      else if (jc?.door === 'c') e.viaCOnly++
      const chargeMs = r.stripeFirstChargeAt ? new Date(r.stripeFirstChargeAt).getTime() : null
      if (chargeMs !== null && chargeMs > new Date(quizAt).getTime()) {
        e.netNew++
        const ltv = r.lifetimeValueUsd || 0
        e.revenue += ltv
        // Anything above the $4.99 trial means the annual actually billed.
        if (nowMs - chargeMs >= DUE_AFTER_MS) {
          e.mature++
          if (ltv > 20) e.billedAnnual++
        }
      }
      subs.set(b, e)
      if (events.firstEventAt && quizAt.slice(0, 10) >= events.firstEventAt) {
        const cl = clean.get(b) || { completed: 0, netNew: 0 }
        cl.completed++
        if (chargeMs !== null && chargeMs > new Date(quizAt).getTime()) cl.netNew++
        clean.set(b, cl)
      }
    }
    // The trials the quiz cannot claim, in the same buckets as everything
    // else, so a good week for the quiz can be told apart from a good week
    // for Stripe. Same classified entries as the revenue row, one per person.
    const otherByBucket = new Map<string, number>()
    for (const e of notQuizTrialEntries) {
      const b = bucketKey(e.at, gran)
      if (!b || b < launchBucket) continue
      otherByBucket.set(b, (otherByBucket.get(b) || 0) + 1)
    }
    const quizExistingByBucket = new Map<string, number>()
    for (const e of quizExistingEntries) {
      const b = bucketKey(e.at, gran)
      if (!b || b < launchBucket) continue
      quizExistingByBucket.set(b, (quizExistingByBucket.get(b) || 0) + 1)
    }

    // The revenue split, each entry already carrying its own clock (see
    // revenueCharges). Kind names match the SeriesPoint field suffixes.
    // Trial→annual, from the ledger, on the same clock as the money.
    const maturity = new Map<string, { due: number; conv: number }>()
    // Net-new per bucket, from the ledger like its two siblings, so the three
    // parts of ALL TRIALS come from one place and always sum to it.
    const netNewByBucket = new Map<string, number>()
    for (const t of rev.trialPoints) {
      const b = bucketKey(t.at, gran)
      if (!b || b < launchBucket) continue
      if (t.attribution === 'quiz_net_new') netNewByBucket.set(b, (netNewByBucket.get(b) || 0) + 1)
      if (!t.due) continue
      const m = maturity.get(b) || { due: 0, conv: 0 }
      m.due++
      if (t.converted) m.conv++
      maturity.set(b, m)
    }

    const revByBucket = new Map<string, { net: number; quizExisting: number; notQuiz: number; annualQuiz: number; annualNotQuiz: number; other: number }>()
    // What the conversion money is actually MADE OF, per bucket. A conversion
    // can be a $59.75 annual or the $49.75 half of a lifetime bundle, so the
    // hover must state the real mix instead of dividing the total by an
    // assumed price — which produced "1 × $59.75 = $49.75", a sentence that
    // is false on its face (owner, 2026-08-11).
    const annualParts = new Map<string, Map<number, number>>()
    for (const e of rev.entries) {
      const b = bucketKey(e.at, gran)
      if (!b || b < launchBucket) continue
      const r = revByBucket.get(b) || { net: 0, quizExisting: 0, notQuiz: 0, annualQuiz: 0, annualNotQuiz: 0, other: 0 }
      r[e.kind] += e.usd
      revByBucket.set(b, r)
      if (e.kind === 'annualQuiz' || e.kind === 'annualNotQuiz') {
        const m = annualParts.get(b) || new Map<number, number>()
        const cents = Math.round(e.usd * 100)
        m.set(cents, (m.get(cents) || 0) + 1)
        annualParts.set(b, m)
      }
    }

    const evb = events.eventBuckets[gran]
    const jvb = events.journeyBuckets[gran]
    const keys = Array.from(new Set([...Array.from(subs.keys()), ...Object.keys(evb), ...Object.keys(jvb), ...Array.from(otherByBucket.keys()), ...Array.from(quizExistingByBucket.keys()), ...Array.from(revByBucket.keys())]))
      .filter(k => k >= launchBucket).sort()
    const cap = gran === 'day' ? 21 : gran === 'week' ? 12 : 12
    return keys.slice(-cap).map(bucket => ({
      bucket,
      // Did client instrumentation cover this bucket? 'none' = it did not
      // exist yet (render "–", never 0), 'partial' = it started mid-bucket so
      // views/starts/clicks are real but understated.
      eventsCovered: !events.firstEventAt
        ? 'none' as const
        : bucketEnd(bucket, gran) <= events.firstEventAt
          ? 'none' as const
          : bucket < events.firstEventAt && gran !== 'day'
            ? 'partial' as const
            : 'full' as const,
      views: evb[bucket]?.views || 0,
      starts: evb[bucket]?.starts || 0,
      completed: subs.get(bucket)?.completed || 0, // submissions — consistent with the 489 funnel total
      completedSeen: subs.get(bucket)?.completedSeen || 0,
      completedViaASame: subs.get(bucket)?.viaASame || 0,
      completedViaAOther: subs.get(bucket)?.viaAOther || 0,
      completedViaB: subs.get(bucket)?.viaB || 0,
      completedViaCOnly: subs.get(bucket)?.viaCOnly || 0,
      checkout: evb[bucket]?.checkout || 0,
      jLanded: jvb[bucket]?.jLanded || 0,
      jThenStarted: jvb[bucket]?.jThenStarted || 0,
      jThenCompleted: jvb[bucket]?.jThenCompleted || 0,
      jThenClicked: jvb[bucket]?.jThenClicked || 0,
      jDirect: jvb[bucket]?.jDirect || 0,
      jDirectQuiz: jvb[bucket]?.jDirectQuiz || 0,
      jDirectResult: jvb[bucket]?.jDirectResult || 0,
      bThenCompleted: jvb[bucket]?.bThenCompleted || 0,
      bThenClicked: jvb[bucket]?.bThenClicked || 0,
      cThenClicked: jvb[bucket]?.cThenClicked || 0,
      netNew: netNewByBucket.get(bucket) || 0,     // from the ledger, quiz clock
      otherPaid: otherByBucket.get(bucket) || 0,   // first charges the quiz cannot claim
      quizExistingPaid: quizExistingByBucket.get(bucket) || 0,
      revenue: subs.get(bucket)?.revenue || 0,
      revenueNet: revByBucket.get(bucket)?.net || 0,
      revenueQuizExisting: revByBucket.get(bucket)?.quizExisting || 0,
      revenueNotQuiz: revByBucket.get(bucket)?.notQuiz || 0,
      revenueAnnualQuiz: revByBucket.get(bucket)?.annualQuiz || 0,
      revenueAnnualNotQuiz: revByBucket.get(bucket)?.annualNotQuiz || 0,
      annualParts: Array.from(annualParts.get(bucket)?.entries() ?? []).sort((a, b) => b[0] - a[0]),
      revenueOther: revByBucket.get(bucket)?.other || 0,
      matureTrials: maturity.get(bucket)?.due || 0,
      billedAnnual: maturity.get(bucket)?.conv || 0,
      cleanCompleted: clean.get(bucket)?.completed || 0,
      cleanNetNew: clean.get(bucket)?.netNew || 0,
      partial: bucket === nowBucket,
    }))
  }
  const series: Series = { day: buildSeries('day'), week: buildSeries('week'), month: buildSeries('month') }

  const exportParams = new URLSearchParams(searchParams as Record<string, string>)
  exportParams.delete('offset')
  exportParams.set('sample', sample)
  const exportHref = `/api/admin/export.csv?${exportParams.toString()}`

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const rangeLabel = sample === 'launch' ? `${LAUNCH_LABEL} - ${today}` : 'all data'

  // The ledger's own verdict on itself, from the last Stripe sync. Silent when
  // it passes; a red block above everything when it does not, because a wrong
  // number acted on is worse than no number.
  let health: { checks: CheckResult[] | null; ranAt: string | null } = { checks: null, ranAt: null }
  let uxHealth: { signals: UxSignal[] | null; ranAt: string | null } = { signals: null, ranAt: null }
  try {
    const hUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const hKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
    if (hUrl && hKey) {
      const hc = createClient(hUrl, hKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
      })
      const [led, ux] = await Promise.all([
        hc.from('ledger_checks').select('ran_at, results').order('ran_at', { ascending: false }).limit(1).maybeSingle(),
        hc.from('ux_checks').select('ran_at, signals').order('ran_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      health = { checks: (led.data?.results ?? null) as CheckResult[] | null, ranAt: (led.data?.ran_at ?? null) as string | null }
      uxHealth = { signals: (ux.data?.signals ?? null) as UxSignal[] | null, ranAt: (ux.data?.ran_at ?? null) as string | null }
    }
  } catch { /* health is a nice-to-have; it must never take the page down */ }

  return (
    <>
    <div style={{ padding: '0 20px' }}>
      <UxHealth signals={uxHealth.signals} ranAt={uxHealth.ranAt} />
      <LedgerHealth checks={health.checks} ranAt={health.ranAt} />
    </div>
    <XraySection />
    <DashboardArea
      rows={rows}
      sample={sample}
      funnelEvents={events.funnel}
      placements={placements}
      otherPaid={notQuizTrialEntries.length}
      quizExistingPaid={quizExistingEntries.length}
      lifetimeSplits={rev.lifetimeSplits}
      quizRepeatTrials={rev.quizRepeatTrials}
      preWindowAnnuals={rev.preWindowAnnuals}
      series={series}
      exportHref={exportHref}
      launchLabel={LAUNCH_LABEL}
      rangeLabel={rangeLabel}
      searchParamsStr={sp.toString()}
      error={error}
    />
    </>
  )
}
