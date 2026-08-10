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

/** One classified entry per real Stripe charge since launch, for the matrix
 *  revenue split. `at` already carries the RIGHT clock for its kind:
 *  net $4.99s restate at the person's quiz date (the cohort owns the sale,
 *  same rule as the Net-new paid row), everything else sits at charge date
 *  (those people have no quiz date, and an annual is cash the day it bills). */
// 'net'         — took the quiz, then bought, and had NEVER paid us before.
//                 The north star. Quiz clock.
// 'quizExisting'— took the quiz, then bought the trial, but had paid us at
//                 some earlier point. The quiz earned the trial; it did not
//                 earn a new customer. Quiz clock. Added 2026-08-10 after the
//                 owner reconciled July against his Stripe export: 7 of the 44
//                 trials filed as "not from the quiz" were people who took the
//                 quiz the same day they bought.
// 'notQuiz'     — never took the quiz, or took it only after paying. Charge clock.
type RevKind = 'net' | 'quizExisting' | 'notQuiz' | 'annual' | 'other'

async function revenueCharges(): Promise<{
  entries: { at: string; kind: RevKind; usd: number }[]
  mirrored: number
  /** $54.74 charges split per the owner's pricing history (2026-08-10): that
   *  amount is one payment for $4.99 paid trial + $49.75 LIFETIME option, an
   *  upsell offered instead of the $59.75/year renewal. Counted so the matrix
   *  footnote can say how many such splits are in the numbers. */
  lifetimeSplits: number
  /** Annuals whose trial cohort predates the visible window (trial found only
   *  in the owner's sheet, before MIRROR_START). Attributed to their real
   *  cohort, which is off-screen — so they are excluded from every visible
   *  column and disclosed in the footnote instead of polluting a recent week
   *  that could not possibly have converted yet. */
  preWindowAnnuals: number
  /** Emails of the quiz-earned trials from EXISTING customers (category B).
   *  Part of the north star per the owner's 2026-08-10 definition. */
  quizExistingEmails: Set<string>
  /** Net-new people with MORE than one $4.99 charge (the other direction of
   *  the same people-vs-charges gap). */
  quizRepeatTrials: number
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return { entries: [], mirrored: 0, lifetimeSplits: 0, quizRepeatTrials: 0, preWindowAnnuals: 0, quizExistingEmails: new Set<string>() }
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })

  // The mirror: real charges with exact cents. Filled by
  // /api/admin/stripe-charges-sync (daily 06:20 + on demand). Empty mirror =
  // five zero rows, never an inferred number.
  const charges: { amount_cents: number; currency: string; charged_at: string; customer_id: string | null; email: string | null; customer_email: string | null; refunded: boolean }[] = []
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const { data, error } = await c
      .from('stripe_charges')
      .select('amount_cents, currency, charged_at, customer_id, email, customer_email, refunded')
      .gte('charged_at', `${MIRROR_START_ISO}T00:00:00Z`)
      // Chronological, so "the person's FIRST $4.99" below is deterministic.
      .order('charged_at', { ascending: true })
      .range(offset, offset + 999)
    if (error || !data) break
    charges.push(...(data as typeof charges))
    if (data.length < 1000) break
  }

  // The owner's trials sheet, as the cohort source of last resort: it reaches
  // a year back, far beyond the mirror, so an annual whose trial predates the
  // mirror can still be attributed to its true trial week instead of falling
  // back to its bill date (which reads as a fresh cohort converting weeks
  // before it is due — the "$120 on Jul 29" bug the owner caught).
  const sheetTrial = new Map<string, string>()
  for (let offset = 0; offset < 5000; offset += 1000) {
    const { data, error } = await c
      .from('sheet_trials')
      .select('email, trial_date')
      .range(offset, offset + 999)
    if (error || !data) break
    for (const r of data as { email: string | null; trial_date: string | null }[]) {
      const e = r.email?.trim().toLowerCase()
      if (!e || !r.trial_date) continue
      const prev = sheetTrial.get(e)
      if (!prev || r.trial_date < prev) sheetTrial.set(e, r.trial_date)
    }
    if (data.length < 1000) break
  }

  // Who is who. netNew uses the same write-once quiz_completed_at rule as
  // every other net-new number on this page.
  type P = { netNew: boolean; quizAt: string | null; test: boolean; email: string | null }
  const byCustomer = new Map<string, P>()
  const byEmail = new Map<string, P>()
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const { data, error } = await c
      .from('submissions')
      .select('email, quiz_completed_at, stripe_first_charge_at, stripe_customer_id, stripe_customer_ids, is_test')
      .is('archived_at', null)
      .range(offset, offset + 999)
    if (error || !data) break
    for (const r of data as { email: string | null; quiz_completed_at: string | null; stripe_first_charge_at: string | null; stripe_customer_id: string | null; stripe_customer_ids: unknown; is_test: boolean | null }[]) {
      const e = r.email?.trim().toLowerCase() || null
      const p: P = {
        netNew: !!(r.quiz_completed_at && r.stripe_first_charge_at &&
          new Date(r.stripe_first_charge_at).getTime() > new Date(r.quiz_completed_at).getTime()),
        quizAt: r.quiz_completed_at,
        test: r.is_test === true,
        email: e,
      }
      if (r.stripe_customer_id) byCustomer.set(r.stripe_customer_id, p)
      if (Array.isArray(r.stripe_customer_ids)) {
        for (const id of r.stripe_customer_ids) if (typeof id === 'string') byCustomer.set(id, p)
      }
      if (e) {
        const prev = byEmail.get(e)
        // Prefer the row that actually took the quiz over a CRM-only sibling.
        if (!prev || (!prev.quizAt && p.quizAt)) byEmail.set(e, p)
      }
    }
    if (data.length < 1000) break
  }

  const entries: { at: string; kind: RevKind; usd: number }[] = []
  let lifetimeSplits = 0
  let preWindowAnnuals = 0
  /** Emails of category-B buyers: took the quiz, then bought a trial, but had
   *  paid us before. They belong to the north star (the quiz earned the trial)
   *  without being net-new customers, so the KPI layer needs them by name. */
  const quizExistingEmails = new Set<string>()
  /** Each person's trial COHORT anchor (quiz week for net-new, first-trial
   *  charge date otherwise). Presence marks the trial as filed, so later
   *  $4.99s are repeats — and the person's $59.75 restates to this anchor,
   *  because "how much did that week's trials convert into" is the question
   *  this matrix answers (owner call, 2026-08-10, the Gina case: trial Jul 10,
   *  annual billed Aug 10, the money belongs to the Jul 10 cohort). */
  const trialAnchor = new Map<P, string>()
  // Per-person outcome, for the people-vs-charges reconciliation note. Keyed
  // by the shared P object, which both lookup maps hold per submission row.
  const outcome = new Map<P, { n499: number; other: number }>()
  for (const ch of charges) {
    if (ch.refunded) continue // returned money is not revenue
    // Customer id first (most reliable), then either email the charge carries.
    const person = (ch.customer_id && byCustomer.get(ch.customer_id))
      || (ch.email && byEmail.get(ch.email))
      || (ch.customer_email && byEmail.get(ch.customer_email))
      || null
    if (person?.test) continue
    if (person) {
      const o = outcome.get(person) || { n499: 0, other: 0 }
      // A $54.74 lifetime bundle CONTAINS a paid trial, so it counts as one.
      if (ch.currency === 'usd' && (ch.amount_cents === 499 || ch.amount_cents === 5474)) o.n499++
      else o.other++
      outcome.set(person, o)
    }
    const usd = ch.amount_cents / 100
    const isUsd = ch.currency === 'usd'
    if (isUsd && (ch.amount_cents === 499 || ch.amount_cents === 5474)) {
      // $54.74 is ONE payment for TWO things — owner's pricing history, stated
      // 2026-08-10: the $4.99 paid trial plus the $49.75 LIFETIME option (an
      // upsell offered instead of the $59.75/year renewal). Split accordingly;
      // the split preserves the total to the cent.
      if (ch.amount_cents === 5474) {
        lifetimeSplits++
        entries.push({ at: ch.charged_at, kind: 'other', usd: 49.75 })
      }
      // ONE trial per person. Week Jul 20 taught this: 14 net-new people, 16
      // trial charges, because two people subscribed twice minutes apart under
      // two Stripe customers each. The extra $4.99s are real money but they
      // are double-subscriptions, not second trials — they go to Other so the
      // trials rows always reconcile with the people counts above them.
      const repeat = person !== null && trialAnchor.has(person)
      // Did the quiz earn this trial? The quiz must have been completed before
      // the charge (one day of slack for people who take it late at night and
      // pay after midnight). Separate question from whether they were already
      // a customer, which is what netNew answers.
      const quizEarnedIt = !!(person?.quizAt &&
        Date.parse(person.quizAt) <= Date.parse(ch.charged_at) + 86_400_000)
      if (repeat) {
        entries.push({ at: ch.charged_at, kind: 'other', usd: 4.99 })
      } else if (person?.netNew && person.quizAt) {
        entries.push({ at: person.quizAt, kind: 'net', usd: 4.99 })
        trialAnchor.set(person, person.quizAt)
      } else if (quizEarnedIt && person?.quizAt) {
        entries.push({ at: person.quizAt, kind: 'quizExisting', usd: 4.99 })
        trialAnchor.set(person, person.quizAt)
        if (person.email) quizExistingEmails.add(person.email)
      } else {
        entries.push({ at: ch.charged_at, kind: 'notQuiz', usd: 4.99 })
        if (person) trialAnchor.set(person, ch.charged_at)
      }
    } else if (isUsd && ch.amount_cents === 5975) {
      // COHORT clock: the annual restates to the week of the trial that
      // earned it. Charges are processed chronologically and the annual bills
      // ~a month after the trial, so the person's anchor is already recorded
      // whenever their trial is inside the mirror. Fallback chain: quiz week
      // for a net-new person, then the owner's SHEET (it reaches a year back),
      // then — last resort — the charge date.
      let anchor: string | null = null
      if (person) {
        const t = trialAnchor.get(person)
        if (t) anchor = t
        else if (person.netNew && person.quizAt) anchor = person.quizAt
      }
      if (!anchor) {
        anchor = (ch.email && sheetTrial.get(ch.email)) || (person?.email && sheetTrial.get(person.email)) || null
      }
      if (anchor && anchor < MIRROR_START_ISO) {
        // The trial cohort predates the visible window. Its money belongs to
        // that (off-screen) cohort, so it must NOT appear in any visible
        // column — a recent week showing conversions it could not have
        // produced yet is exactly the bug this branch exists to prevent.
        preWindowAnnuals++
      } else {
        entries.push({ at: anchor ?? ch.charged_at, kind: 'annual', usd })
      }
    } else {
      // Legacy $39.75 annuals, $7.99 subs, odd amounts, non-USD — real money
      // the three named buckets cannot claim.
      entries.push({ at: ch.charged_at, kind: 'other', usd })
    }
  }
  let quizRepeatTrials = 0
  for (const [p, o] of Array.from(outcome)) {
    if (p.netNew && o.n499 > 1) quizRepeatTrials++
  }
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
    for (const e of rev.entries) {
      const b = bucketKey(e.at, gran)
      if (!b || b < launchBucket) continue
      const r = revByBucket.get(b) || { net: 0, quizExisting: 0, notQuiz: 0, annual: 0, other: 0 }
      r[e.kind] += e.usd
      revByBucket.set(b, r)
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
