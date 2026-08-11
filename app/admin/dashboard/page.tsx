import { createClient } from '@supabase/supabase-js'
import {
  filteredSubmissionsAll,
  parseFilters,
  LAUNCH_ISO,
  MIRROR_START_ISO,
  LAUNCH_LABEL,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import DashboardArea from './DashboardArea.client'
import { type BentoRow, type FunnelEventCounts, type PlacementStat, type SeriesPoint, type Series } from './DashboardBento.client'

export const dynamic = 'force-dynamic'
export const revalidate = 30

type Gran = 'day' | 'week' | 'month'
const GRANS: Gran[] = ['day', 'week', 'month']

// Bucket an ISO timestamp for a given granularity → a sortable key.
//   day → YYYY-MM-DD · week → Monday YYYY-MM-DD · month → YYYY-MM
function bucketKey(iso: string, gran: Gran): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  if (gran === 'month') return d.toISOString().slice(0, 7)
  if (gran === 'week') { const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10) }
  return d.toISOString().slice(0, 10)
}

/** The day AFTER a bucket's last day, as YYYY-MM-DD — the bucket's exclusive
 *  end. Used to decide whether instrumentation existed for that period. */
function bucketEnd(bucket: string, gran: Gran): string {
  if (gran === 'month') {
    const [y, m] = bucket.split('-').map(Number)
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  }
  const d = new Date(`${bucket}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (gran === 'week' ? 7 : 1))
  return d.toISOString().slice(0, 10)
}

type EventBuckets = Record<Gran, Record<string, { views: number; starts: number; checkout: number }>>

/** Placement counts as they come off the events read, before the sales join.
 *  `clickerIds` are the submissions that clicked this button, which is what
 *  turns "gets clicked" into "gets paid" once the CRM rows are in hand. */
type RawPlacement = { placement: string; views: number; clicks: number; clickerIds: string[] }

// Funnel + placement events, all in the ONE launch window (since Jul 5), bucketed
// by day / week / month so the progression charts can toggle granularity.
async function loadEventStats(): Promise<{ firstEventAt: string | null; funnel: FunnelEventCounts; placements: RawPlacement[]; eventBuckets: EventBuckets }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  const emptyBuckets: EventBuckets = { day: {}, week: {}, month: {} }
  const empty = { firstEventAt: null, funnel: { landing: 0, started: 0, checkout: 0 }, placements: [] as RawPlacement[], eventBuckets: emptyBuckets }
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
    funnel: { landing: uniq.landing.size, started: uniq.started.size, checkout: uniq.checkout.size },
    placements: Array.from(pl.entries())
      .map(([placement, s]) => ({ placement, views: s.views.size, clicks: s.clicks.size, clickerIds: Array.from(s.buyers) }))
      .sort((a, b) => b.views - a.views || b.clicks - a.clicks),
    eventBuckets,
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
type RevKind = 'net' | 'quizExisting' | 'notQuiz' | 'annual' | 'other'

type LedgerRow = {
  charge_id: string; trial_at: string; trial_cents: number; trial_refunded: boolean
  lifetime_bundle: boolean; attribution: string; quiz_completed_at: string | null
  converted_at: string | null; converted_cents: number | null; converted_charge_id: string | null
}

async function revenueCharges(): Promise<{
  entries: { at: string; kind: RevKind; usd: number }[]
  mirrored: number
  /** $54.74 bundles ($4.99 trial + $49.75 lifetime) inside the numbers. */
  lifetimeSplits: number
  /** Conversions whose trial cohort predates the visible window. Attributed to
   *  their real (off-screen) cohort and disclosed, never shown under a recent
   *  week that could not have produced them. */
  preWindowAnnuals: number
  /** Emails of quiz-earned trials from EXISTING customers, for the north star. */
  quizExistingEmails: Set<string>
  /** People who bought a trial more than once (duplicate subscriptions). */
  quizRepeatTrials: number
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  const empty = { entries: [], mirrored: 0, lifetimeSplits: 0, quizRepeatTrials: 0, preWindowAnnuals: 0, quizExistingEmails: new Set<string>() }
  if (!url || !key) return empty
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })

  // 1. The ledger: one row per trial, already classified by the database.
  const ledger: LedgerRow[] = []
  for (let o = 0; o < 20_000; o += 1000) {
    const { data, error } = await c
      .from('trial_ledger')
      .select('charge_id, trial_at, trial_cents, trial_refunded, lifetime_bundle, attribution, quiz_completed_at, converted_at, converted_cents, converted_charge_id')
      .order('trial_at')
      .range(o, o + 999)
    if (error || !data) break
    ledger.push(...(data as LedgerRow[]))
    if (data.length < 1000) break
  }

  // 2. Every charge, to derive "other revenue" as an EXACT residual: the
  //    account total minus the charges the ledger already accounts for.
  const charges: { id: string; amount_cents: number; charged_at: string; refunded: boolean }[] = []
  for (let o = 0; o < 20_000; o += 1000) {
    const { data, error } = await c
      .from('stripe_charges')
      .select('id, amount_cents, charged_at, refunded')
      .gte('charged_at', `${MIRROR_START_ISO}T00:00:00Z`)
      .order('charged_at')
      .range(o, o + 999)
    if (error || !data) break
    charges.push(...(data as typeof charges))
    if (data.length < 1000) break
  }

  const entries: { at: string; kind: RevKind; usd: number }[] = []
  const quizExistingEmails = new Set<string>()
  let lifetimeSplits = 0
  let preWindowAnnuals = 0
  const accounted = new Set<string>()

  for (const t of ledger) {
    if (t.lifetime_bundle) lifetimeSplits++
    // A quiz-earned trial restates to the week the person took the quiz; the
    // cohort owns the sale. Everything else sits where it was charged.
    const quizEarned = t.attribution === 'quiz_net_new' || t.attribution === 'quiz_existing'
    const anchor = quizEarned && t.quiz_completed_at ? t.quiz_completed_at : t.trial_at

    if (!t.trial_refunded) {
      accounted.add(t.charge_id)
      const usd = t.trial_cents / 100
      if (t.attribution === 'quiz_net_new') entries.push({ at: anchor, kind: 'net', usd })
      else if (t.attribution === 'quiz_existing') entries.push({ at: anchor, kind: 'quizExisting', usd })
      else entries.push({ at: t.trial_at, kind: 'notQuiz', usd })
    }

    if (t.converted_at && t.converted_cents) {
      if (t.converted_charge_id) accounted.add(t.converted_charge_id)
      if (t.lifetime_bundle) {
        // A lifetime is NOT an annual. Owner's rule, stated twice: the $4.99
        // half of a $54.74 bundle belongs with the trials, the $49.75 half is
        // Other Revenue. Converted Trials Revenue means $59.75 renewals, full
        // stop. (The ledger still counts this person as CONVERTED, because
        // they did — that is a question about the rate, not about which
        // revenue bucket their money sits in.)
        entries.push({ at: t.trial_at, kind: 'other', usd: 49.75 })
      } else if (anchor < `${MIRROR_START_ISO}T00:00:00Z`) {
        preWindowAnnuals++
      } else {
        entries.push({ at: anchor, kind: 'annual', usd: t.converted_cents / 100 })
      }
    }
  }

  // The residual. Anything the ledger did not account for is real money the
  // three trial buckets cannot claim: legacy subscriptions, old annual prices,
  // duplicate subscriptions.
  for (const ch of charges) {
    if (ch.refunded) continue
    if (accounted.has(ch.id)) continue
    entries.push({ at: ch.charged_at, kind: 'other', usd: ch.amount_cents / 100 })
  }

  const seen = new Map<string, number>()
  for (const t of ledger) {
    if (!t.quiz_completed_at) continue
    seen.set(t.charge_id, (seen.get(t.charge_id) || 0) + 1)
  }
  // Emails for the north star: the ledger already says who is category B.
  const { data: qe } = await c
    .from('trial_ledger')
    .select('person_key')
    .eq('attribution', 'quiz_existing')
    .limit(5000)
  for (const r of (qe ?? []) as { person_key: string }[]) {
    if (r.person_key?.includes('@')) quizExistingEmails.add(r.person_key)
  }

  // Duplicate subscriptions: people the ledger deduplicated away.
  const { count: rawTrials } = await c
    .from('stripe_charges')
    .select('id', { count: 'exact', head: true })
    .in('amount_cents', [399, 499, 5474])
    .eq('refunded', false)
  const quizRepeatTrials = Math.max(0, (rawTrials ?? 0) - ledger.length)

  return { entries, mirrored: charges.length, lifetimeSplits, quizRepeatTrials, preWindowAnnuals, quizExistingEmails }
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
  let events = { firstEventAt: null as string | null, funnel: { landing: 0, started: 0, checkout: 0 }, placements: [] as RawPlacement[], eventBuckets: { day: {}, week: {}, month: {} } as EventBuckets }
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
    const netNew = !!(r.stripeFirstChargeAt && quizAt &&
      new Date(r.stripeFirstChargeAt).getTime() > new Date(quizAt).getTime())
    // THE NORTH STAR, per the owner 2026-08-10: trials the QUIZ produced,
    // whether the buyer was new to us or already a customer. Category B comes
    // from the charge-level pass (a real $4.99 trial after their quiz), never
    // from "they had some charge later", which a monthly renewal would fake.
    const email = r.email?.trim().toLowerCase() || null
    const quizTrial = netNew || (!!email && rev.quizExistingEmails.has(email))
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

    const subs = new Map<string, { completed: number; netNew: number; revenue: number; mature: number; billedAnnual: number }>()
    for (const r of allRows) {
      // Same anchor as the KPIs above, so a person lands in the week they took
      // the quiz and the charts cannot disagree with the numbers beside them.
      // This is also why a LATE converter restates history rather than landing
      // in the week they happened to pay: the cohort owns the sale.
      const quizAt = r.quizCompletedAt
      if (!quizAt) continue
      const b = bucketKey(quizAt, gran)
      if (!b || b < launchBucket) continue
      const e = subs.get(b) || { completed: 0, netNew: 0, revenue: 0, mature: 0, billedAnnual: 0 }
      e.completed++
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
    const revByBucket = new Map<string, { net: number; quizExisting: number; notQuiz: number; annual: number; other: number }>()
    // What the conversion money is actually MADE OF, per bucket. A conversion
    // can be a $59.75 annual or the $49.75 half of a lifetime bundle, so the
    // hover must state the real mix instead of dividing the total by an
    // assumed price — which produced "1 × $59.75 = $49.75", a sentence that
    // is false on its face (owner, 2026-08-11).
    const annualParts = new Map<string, Map<number, number>>()
    for (const e of rev.entries) {
      const b = bucketKey(e.at, gran)
      if (!b || b < launchBucket) continue
      const r = revByBucket.get(b) || { net: 0, quizExisting: 0, notQuiz: 0, annual: 0, other: 0 }
      r[e.kind] += e.usd
      revByBucket.set(b, r)
      if (e.kind === 'annual') {
        const m = annualParts.get(b) || new Map<number, number>()
        const cents = Math.round(e.usd * 100)
        m.set(cents, (m.get(cents) || 0) + 1)
        annualParts.set(b, m)
      }
    }

    const evb = events.eventBuckets[gran]
    const keys = Array.from(new Set([...Array.from(subs.keys()), ...Object.keys(evb), ...Array.from(otherByBucket.keys()), ...Array.from(quizExistingByBucket.keys()), ...Array.from(revByBucket.keys())]))
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
      checkout: evb[bucket]?.checkout || 0,
      netNew: subs.get(bucket)?.netNew || 0,       // paid, bucketed on quiz_completed_at
      otherPaid: otherByBucket.get(bucket) || 0,   // first charges the quiz cannot claim
      quizExistingPaid: quizExistingByBucket.get(bucket) || 0,
      revenue: subs.get(bucket)?.revenue || 0,
      revenueNet: revByBucket.get(bucket)?.net || 0,
      revenueQuizExisting: revByBucket.get(bucket)?.quizExisting || 0,
      revenueNotQuiz: revByBucket.get(bucket)?.notQuiz || 0,
      revenueAnnual: revByBucket.get(bucket)?.annual || 0,
      annualParts: Array.from(annualParts.get(bucket)?.entries() ?? []).sort((a, b) => b[0] - a[0]),
      revenueOther: revByBucket.get(bucket)?.other || 0,
      matureTrials: subs.get(bucket)?.mature || 0,
      billedAnnual: subs.get(bucket)?.billedAnnual || 0,
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

  return (
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
  )
}
