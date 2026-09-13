// The behaviour timeline behind one submission's dossier "Behavior" tab.
//
// Owner, 2026-09-13: "visto che abbiamo i recording e tu puoi leggerli,
// possiamo fare un x-ray del behaviour di ogni pagante". Correction folded
// into the feature itself: Clarity recordings have no API (dashboard only,
// CLAUDE.md), so nothing here is read from video. Every field is the same
// fact a recording would show, read from funnel_events instead, which is
// exact where a recording is only watchable: source, country, quiz-fill
// time, landing dwell, and which checkout button was clicked, all timestamped
// already.
//
// A submission_id only exists from quiz_submit onward, so quiz_view/
// quiz_start for the same visit carry submission_id = null (assigned before
// there is a submission to assign). anon_id is the only identifier stable
// across a whole visit, and a person who returns later (a recovery-email
// click, a second attempt) gets a NEW anon_id — so this first resolves
// every anon_id ever tied to the submission (across every visit), then
// reads all events under any of them. That is also why "the" checkout
// click is not a single lookup: some charges have none at all (a static
// payment link from an email skips the site entirely), so each trial gets
// its own nearest-preceding click, which is null when there isn't one.

import { db } from '@/lib/revenue-shared'

export type CheckoutClick = { ts: string; placement: string | null }
export type TrialClick = { at: string; cents: number; refunded: boolean; clickTs: string | null; clickPlacement: string | null }

export type BehaviorTimeline = {
  visits: number
  landedAt: string | null
  landedReferrer: string | null
  startedAt: string | null
  submittedAt: string | null
  landingDwellSeconds: number | null
  quizFillSeconds: number | null
  checkoutClicks: CheckoutClick[]
  trials: TrialClick[]
}

const EMPTY: BehaviorTimeline = {
  visits: 0, landedAt: null, landedReferrer: null, startedAt: null, submittedAt: null,
  landingDwellSeconds: null, quizFillSeconds: null, checkoutClicks: [], trials: [],
}

function seconds(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const d = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000)
  return d >= 0 ? d : null
}

export async function getBehaviorTimeline(submissionId: string): Promise<BehaviorTimeline> {
  const c = db()
  try {
    const { data: anonRows } = await c
      .from('funnel_events')
      .select('anon_id')
      .eq('submission_id', submissionId)
      .not('anon_id', 'is', null)
    const anonIds = Array.from(new Set((anonRows ?? []).map(r => r.anon_id as string)))
    if (anonIds.length === 0) return EMPTY

    const { data: eventRows } = await c
      .from('funnel_events')
      .select('event, ts, props')
      .in('anon_id', anonIds)
      .order('ts', { ascending: true })
    const events = eventRows ?? []

    const landed = events.find(e => e.event === 'quiz_view')
    const started = events.find(e => e.event === 'quiz_start')
    const submitted = events.find(e => e.event === 'quiz_submit')
    const checkoutClicks: CheckoutClick[] = events
      .filter(e => e.event === 'checkout_click')
      .map(e => ({ ts: e.ts as string, placement: ((e.props as Record<string, unknown> | null)?.placement as string) ?? null }))

    const { data: trialRows } = await c
      .from('trial_ledger')
      .select('trial_at, trial_cents, trial_refunded')
      .eq('submission_id', submissionId)
      .order('trial_at', { ascending: true })

    const trials: TrialClick[] = (trialRows ?? []).map(t => {
      const at = t.trial_at as string
      // Nearest click at or before this charge — never a later one, a click
      // after the money already moved cannot be what caused it (a buyer who
      // pays via an email link and then browses the site afterward, real
      // case found 2026-09-13, would otherwise wrongly credit that browsing).
      const preceding = checkoutClicks.filter(cc => new Date(cc.ts).getTime() <= new Date(at).getTime())
      const last = preceding.length ? preceding[preceding.length - 1] : null
      return { at, cents: t.trial_cents as number, refunded: !!t.trial_refunded, clickTs: last?.ts ?? null, clickPlacement: last?.placement ?? null }
    })

    return {
      visits: anonIds.length,
      landedAt: (landed?.ts as string) ?? null,
      landedReferrer: ((landed?.props as Record<string, unknown> | null)?.referrer as string) ?? null,
      startedAt: (started?.ts as string) ?? null,
      submittedAt: (submitted?.ts as string) ?? null,
      landingDwellSeconds: seconds((landed?.ts as string) ?? null, (started?.ts as string) ?? null),
      quizFillSeconds: seconds((started?.ts as string) ?? null, (submitted?.ts as string) ?? null),
      checkoutClicks,
      trials,
    }
  } catch {
    return EMPTY
  }
}

const PLACEMENT_NAME: Record<string, string> = {
  v2_offer_stack: 'Offer stack',
  v2_offer_stack_badges: 'Offer stack · pay marks',
  v2_hero_cta: 'Hero button',
  v2_offer_bar: 'Sticky bar button',
  v2_offer_bar_banner: 'Sticky bar · whole strip',
  v2_study_plan: 'Study plan',
  v2_study_plan_badges: 'Study plan · pay marks',
  v2_risk_free: 'Risk-free block',
  v2_risk_free_badges: 'Risk-free · pay marks',
  v2_library_grid: 'Library grid',
  v2_expense_email: 'Expense-it email prompt',
  v2_express_pay: 'Express pay',
  v2_fomo_notification: 'Trial notification',
  v2_social_marquee: 'Reviews marquee',
}

export function humanizePlacement(p: string | null): string {
  if (!p) return '—'
  return PLACEMENT_NAME[p] || p.replace(/^v2_/, '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()).trim()
}

export function fmtDuration(sec: number | null): string {
  if (sec === null) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60), s = sec % 60
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
