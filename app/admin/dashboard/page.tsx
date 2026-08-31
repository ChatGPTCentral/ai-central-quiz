import {
  filteredSubmissionsAll,
  parseFilters,
  revenueCharges,
  LAUNCH_ISO,
  LAUNCH_LABEL,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import {
  bucketKey,
  bucketEnd,
  type Gran,
} from '@/lib/trial-entries'
import { createClient } from '@supabase/supabase-js'
import { loadEventStats, type EventBuckets, type JourneyCell, type RawPlacement } from '@/lib/dashboard-events'
import DashboardArea from './DashboardArea.client'
import LedgerHealth from '@/components/admin/LedgerHealth'
import UxHealth from '@/components/admin/UxHealth'
import type { UxSignal } from '@/lib/ux-watch'
import type { CheckResult } from '@/lib/ledger-invariants'
import { type BentoRow, type FunnelEventCounts, type SeriesPoint, type Series } from './DashboardBento.client'

export const dynamic = 'force-dynamic'
export const revalidate = 30

// bucketKey / bucketEnd moved to lib/trial-entries.ts: the drill endpoint has
// to bucket exactly the way this page does, and a copied date function is a
// disagreement waiting to happen. loadEventStats() (funnel + placement
// events) is now in lib/dashboard-events.ts for the same reason: /admin/
// insights needs the exact same placements this page computes, and a second
// copy of that ~250-line stitching algorithm is a second implementation of
// the same rule (owner, 2026-08-29).
const GRANS: Gran[] = ['day', 'week', 'month']

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
  // ONE TRIAL, ONE ROW: trialPoints (not entries) for counting, because a
  // refunded trial now emits TWO entries of its own kind — the main one at
  // $0 plus the "-cost" sweep's negative residual, both needed so the money
  // still nets to the cent (see lib/trial-entries.ts) — and counting entries
  // instead of trials silently counted that one refunded person twice. Found
  // 2026-08-29 when the matrix (96) and /admin/revenue/trials (94) stopped
  // agreeing on July right after the gross-count fix: Bianco and Mitchell,
  // July's two refunds, were each worth 2 in this count instead of 1.
  const notQuizTrialEntries = rev.trialPoints.filter(t => t.attribution === 'not_quiz')
  const quizExistingEntries = rev.trialPoints.filter(t => t.attribution === 'quiz_existing')
  // A renewal is credited to the TRIAL that earned it, not the month the
  // renewal happened to bill (owner, 2026-08-29, after the "one clock"
  // fix moved renewals onto their own charge date and put July's renewals
  // under August: "se un trial appartiene e luglio ed è stato cominciato
  // e poi la conversione avviene ad agosto, comunque devi attribuirlo a
  // luglio"). Only for annualQuiz/annualNotQuiz — a trial's OWN sale still
  // sits on ITS OWN charge date, unchanged. Built from trialPoints, the
  // one place a renewal's chargeId is linked back to its trial's own date.
  const originalTrialDateByRenewalCharge = new Map<string, string>()
  for (const t of rev.trialPoints) if (t.convertedChargeId) originalTrialDateByRenewalCharge.set(t.convertedChargeId, t.chargedAt)
  const cohortDateOf = (e: { kind: string; chargeId: string; chargedAt: string }) => {
    if (e.kind !== 'annualQuiz' && e.kind !== 'annualNotQuiz') return e.chargedAt
    // The "-cost" sweep's residual for a disputed/refunded renewal carries
    // the SAME renewal charge id plus this suffix (lib/trial-entries.ts) —
    // strip it so that entry lands in the same cohort bucket as the main one.
    const baseChargeId = e.chargeId.endsWith('-cost') ? e.chargeId.slice(0, -5) : e.chargeId
    return originalTrialDateByRenewalCharge.get(baseChargeId) ?? e.chargedAt
  }


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
      // NET money the quiz itself produced from this person (their trial +
      // its own renewal, rule 6 kept-money) — see quizRevenueByEmail's own
      // comment. `ltv` above stays as-is: it is submissions.lifetime_value_usd,
      // a CRM field other screens (People, IdCard) legitimately use as a rough
      // "has this person ever paid us" signal, gross of fees, whole lifetime.
      // A north-star money figure must use this field instead, never that one.
      quizNetRevenueUsd: emailKey ? (rev.quizRevenueByEmail.get(emailKey) ?? 0) : 0,
      netNew,
      quizTrial,
    }
  })

  // "Which CTA gets clicked" (with its who-actually-paid join) moved to
  // /admin/insights/page.tsx (owner, 2026-08-29) — DashboardArea/
  // DashboardBento no longer render it, so this page no longer builds it.

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
    // ONE RULE for which period a trial or its money sits in, everywhere on
    // this table: the day the charge actually happened, cash-basis, day 1 to
    // the last day of the month — never restated to the quiz date (owner,
    // 2026-08-29, after ALL TRIALS and the trials table kept disagreeing on
    // "July": "esiste UNA SOLA regola == che è uguale a come fare il
    // bilancio 'per competenza' e non 'per cassa'... perchè abbiamo piu
    // regole se solo una regola è vera"). bucketKey(e.chargedAt, ...) below,
    // not e.at — chargedAt is the one field every Entry/TrialPoint carries
    // that is ALWAYS the real charge date, quiz-earned or not (see the `at`
    // vs `chargedAt` split in lib/trial-entries.ts). This is a display-only
    // choice: classifyLedger() itself, and anything reading `at` directly
    // (the drill endpoint, the KPI row's all-window sums), is untouched.
    //
    // The trials the quiz cannot claim, in the same buckets as everything
    // else, so a good week for the quiz can be told apart from a good week
    // for Stripe. One row per TRIAL (trialPoints), not per entry — revByBucket
    // below counts entries on purpose (a refunded trial's money is two entries,
    // $0 plus its cost residual, so both must be summed), but a headcount must
    // never do that, or one refunded person reads as two.
    const otherByBucket = new Map<string, number>()
    for (const t of notQuizTrialEntries) {
      const b = bucketKey(t.chargedAt, gran)
      if (!b || b < launchBucket) continue
      otherByBucket.set(b, (otherByBucket.get(b) || 0) + 1)
    }
    const quizExistingByBucket = new Map<string, number>()
    for (const t of quizExistingEntries) {
      const b = bucketKey(t.chargedAt, gran)
      if (!b || b < launchBucket) continue
      quizExistingByBucket.set(b, (quizExistingByBucket.get(b) || 0) + 1)
    }

    // The revenue split. Kind names match the SeriesPoint field suffixes.
    // Trial→annual, credited to the week of the TRIAL that earned it (owner,
    // 2026-08-29: "se un trial appartiene e luglio... comunque devi
    // attribuirlo a luglio") — cohortDateOf() below handles this for the
    // annualQuiz/annualNotQuiz rows specifically; every other row still
    // sits on its own charge date, per the rule above.
    const maturity = new Map<string, { due: number; conv: number }>()
    // Net-new per bucket, from the ledger like its two siblings, so the three
    // parts of ALL TRIALS come from one place and always sum to it.
    const netNewByBucket = new Map<string, number>()
    // The two transparency lines under ALL TRIALS: how many of THAT bucket's
    // gross count were refunded / disputed. Not a fourth part — every one of
    // these is already inside net/quizExisting/notQuiz above.
    const refundedByBucket = new Map<string, number>()
    const disputedByBucket = new Map<string, number>()
    for (const t of rev.trialPoints) {
      const b = bucketKey(t.chargedAt, gran)
      if (!b || b < launchBucket) continue
      if (t.attribution === 'quiz_net_new') netNewByBucket.set(b, (netNewByBucket.get(b) || 0) + 1)
      if (t.refunded) refundedByBucket.set(b, (refundedByBucket.get(b) || 0) + 1)
      if (t.disputed) disputedByBucket.set(b, (disputedByBucket.get(b) || 0) + 1)
      if (!t.due) continue
      const m = maturity.get(b) || { due: 0, conv: 0 }
      m.due++
      if (t.converted) m.conv++
      maturity.set(b, m)
    }

    const revByBucket = new Map<string, { net: number; quizExisting: number; notQuiz: number; annualQuiz: number; annualNotQuiz: number; other: number; lifetimeSale: number }>()
    // What the conversion money is actually MADE OF, per bucket. A conversion
    // can be a $59.75 annual or the $49.75 half of a lifetime bundle, so the
    // hover must state the real mix instead of dividing the total by an
    // assumed price — which produced "1 × $59.75 = $49.75", a sentence that
    // is false on its face (owner, 2026-08-11).
    const annualParts = new Map<string, Map<number, number>>()
    for (const e of rev.entries) {
      const b = bucketKey(cohortDateOf(e), gran)
      if (!b || b < launchBucket) continue
      const r = revByBucket.get(b) || { net: 0, quizExisting: 0, notQuiz: 0, annualQuiz: 0, annualNotQuiz: 0, other: 0, lifetimeSale: 0 }
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
      refundedTrials: refundedByBucket.get(bucket) || 0,
      disputedTrials: disputedByBucket.get(bucket) || 0,
      revenue: subs.get(bucket)?.revenue || 0,
      revenueNet: revByBucket.get(bucket)?.net || 0,
      revenueQuizExisting: revByBucket.get(bucket)?.quizExisting || 0,
      revenueNotQuiz: revByBucket.get(bucket)?.notQuiz || 0,
      revenueAnnualQuiz: revByBucket.get(bucket)?.annualQuiz || 0,
      revenueAnnualNotQuiz: revByBucket.get(bucket)?.annualNotQuiz || 0,
      annualParts: Array.from(annualParts.get(bucket)?.entries() ?? []).sort((a, b) => b[0] - a[0]),
      revenueOther: revByBucket.get(bucket)?.other || 0,
      revenueLifetime: revByBucket.get(bucket)?.lifetimeSale || 0,
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
    <DashboardArea
      rows={rows}
      sample={sample}
      funnelEvents={events.funnel}
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
