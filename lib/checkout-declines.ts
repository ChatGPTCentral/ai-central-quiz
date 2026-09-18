// The checkout-outcome board — WHO paid, and WHO didn't, side by side.
// Owner, 2026-09-15: "una board dove raccogliamo insights per ogni...
// persona che non ha pagato, per capire quale sarebbe la best action to
// conversion" (getCheckoutDeclines below). Owner again, 2026-09-18, after
// the first version shipped: "noi abbiamo bisogno sia di chi non paga sia
// di chi paga" — one-sided was half the answer. getPaidTrials pairs it,
// same per-person shape (source, country, quiz level, timing, which button),
// reusing the anon_id-resolution lib/buyer-behavior.ts's single-person
// getBehaviorTimeline already solved (quiz_view/quiz_start fire before a
// submission_id exists, so they only join through anon_id, and a person who
// returns later on a fresh visit gets a NEW anon_id too) — this is that same
// logic run for many people at once instead of one dossier page at a time.
//
// getCheckoutDeclines is scoped to people who got far enough to have a real
// signal — clicked a checkout button and never converted — since that is
// the one non-paying group where "why" is answerable at all (an email
// exists because the quiz was already completed) and where the signal
// (checkout_modal_close: how + dwellMs) already exists, built for
// app/api/admin/checkout-autopsy/route.ts's aggregate read of the exact same
// events. This is that same source, at the PERSON level instead of a
// histogram — one fact, two views, not a second computation of it.
//
// dwellMs interpretation carries over unchanged from checkout-autopsy: under
// ~10s is a bounce or misclick, 30s+ is someone who read the form and said
// no on purpose. Those need different messages, so the read/bounce split is
// exposed as its own field rather than left for a reader to infer from raw ms.

import { db } from '@/lib/revenue-shared'
import { humanizePlacement } from '@/lib/buyer-behavior'

export type DeclineRow = {
  submissionId: string
  name: string | null
  email: string | null
  country: string | null
  stage: string | null
  lastClickAt: string
  lastClickPlacement: string | null
  closeHow: string | null
  closeDwellMs: number | null
  /** Coarse read of closeDwellMs, null when no close event was ever seen
   *  (they left the tab open or the page — no explicit close at all). */
  signal: 'read_then_declined' | 'quick_bounce' | 'unclear' | null
}

function classify(dwellMs: number | null): DeclineRow['signal'] {
  if (dwellMs === null) return null
  if (dwellMs >= 20000) return 'read_then_declined'
  if (dwellMs < 5000) return 'quick_bounce'
  return 'unclear'
}

export async function getCheckoutDeclines(days = 14, limit = 80): Promise<DeclineRow[]> {
  const c = db()
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  try {
    const { data: clickRows } = await c
      .from('funnel_events')
      .select('submission_id, ts, props')
      .eq('event', 'checkout_click')
      .gte('ts', since)
      .not('submission_id', 'is', null)

    const lastClick = new Map<string, { ts: string; placement: string | null }>()
    for (const r of clickRows ?? []) {
      const sid = r.submission_id as string
      const ts = r.ts as string
      const cur = lastClick.get(sid)
      if (!cur || ts > cur.ts) lastClick.set(sid, { ts, placement: ((r.props as Record<string, unknown> | null)?.placement as string) ?? null })
    }
    if (lastClick.size === 0) return []

    const clickedIds = Array.from(lastClick.keys())
    const { data: paidRows } = await c
      .from('trial_ledger')
      .select('submission_id')
      .in('submission_id', clickedIds)
      .eq('trial_refunded', false)
    const paid = new Set((paidRows ?? []).map(r => r.submission_id as string))
    const declinedIds = clickedIds.filter(id => !paid.has(id))
    if (declinedIds.length === 0) return []

    const { data: closeRows } = await c
      .from('funnel_events')
      .select('submission_id, ts, props')
      .eq('event', 'checkout_modal_close')
      .in('submission_id', declinedIds)
    const lastClose = new Map<string, { how: string | null; dwellMs: number | null; ts: string }>()
    for (const r of closeRows ?? []) {
      const sid = r.submission_id as string
      const ts = r.ts as string
      const cur = lastClose.get(sid)
      if (!cur || ts > cur.ts) {
        const props = r.props as Record<string, unknown> | null
        lastClose.set(sid, { how: (props?.how as string) ?? null, dwellMs: typeof props?.dwellMs === 'number' ? props.dwellMs : null, ts })
      }
    }

    const { data: subs } = await c.from('submissions').select('id, name, email, country, stage').in('id', declinedIds)
    const subById = new Map((subs ?? []).map(s => [s.id as string, s as { id: string; name: string | null; email: string | null; country: string | null; stage: string | null }]))

    return declinedIds
      .map(id => {
        const s = subById.get(id)
        const click = lastClick.get(id)!
        const close = lastClose.get(id) ?? null
        return {
          submissionId: id,
          name: s?.name ?? null,
          email: s?.email ?? null,
          country: s?.country ?? null,
          stage: s?.stage ?? null,
          lastClickAt: click.ts,
          lastClickPlacement: click.placement,
          closeHow: close?.how ?? null,
          closeDwellMs: close?.dwellMs ?? null,
          signal: classify(close?.dwellMs ?? null),
        }
      })
      .sort((a, b) => (a.lastClickAt < b.lastClickAt ? 1 : -1))
      .slice(0, limit)
  } catch {
    return []
  }
}

export type PaidRow = {
  submissionId: string
  name: string | null
  country: string | null
  stage: string | null
  utmSource: string | null
  trialAt: string
  trialCents: number
  landingDwellSeconds: number | null
  quizFillSeconds: number | null
  /** The checkout button clicked at or before this charge, across every
   *  visit tied to this submission — null means no on-site click precedes
   *  it at all, the signature of a direct/email-link payment (real case
   *  found 2026-09-13: a buyer paid from a held-rate email link, then
   *  browsed the site afterward — a LATER click must never be credited
   *  here, so only clicks at or before trialAt are ever considered). */
  clickPlacement: string | null
  /** Whole days between finishing the quiz and this charge. Null when the
   *  quiz_submit itself was never found (older or untracked submissions). */
  daysSinceQuiz: number | null
  /** THE MOST LIKELY REASON, owner's ask 2026-09-18 — an inference stated
   *  as one, built only from what actually happened (a click or its
   *  absence, same-visit or a return days later), never a story about
   *  what the person felt. Three buckets, in priority order: no click at
   *  all (paid off-site, a direct or held-rate email link); a gap of 1+
   *  days since the quiz (something brought them back, most likely a
   *  reminder or recovery email, not the original visit); same visit,
   *  decided fast, and the button they actually clicked. */
  reason: string
}

function inferReason(hasSubmission: boolean, clickPlacement: string | null, daysSinceQuiz: number | null): string {
  if (!hasSubmission) return 'No quiz activity found at all for this charge — too old or untracked to read.'
  if (!clickPlacement) return 'No on-site click precedes this charge — paid via a direct or held-rate email link.'
  const label = humanizePlacement(clickPlacement)
  if (daysSinceQuiz !== null && daysSinceQuiz >= 1) {
    return `Returned ${daysSinceQuiz} day${daysSinceQuiz === 1 ? '' : 's'} after finishing the quiz, then clicked ${label} — likely a reminder or recovery email brought them back, not the original visit.`
  }
  return `Same visit as the quiz, decided fast, clicked ${label}.`
}

function baseRow(t: Record<string, unknown>): PaidRow {
  return {
    submissionId: t.submission_id as string, name: (t.name as string) ?? null, country: (t.country as string) ?? null,
    stage: (t.stage as string) ?? null, utmSource: (t.utm_source as string) ?? null, trialAt: t.trial_at as string,
    trialCents: t.trial_cents as number, landingDwellSeconds: null, quizFillSeconds: null, clickPlacement: null,
    daysSinceQuiz: null, reason: inferReason(false, null, null),
  }
}

/** days/limit default to effectively "everyone" — owner, 2026-09-18: "non
 *  possiamo fare uno sweep su tutti i paganti?" after a 14-day window
 *  showed only 26 rows. Total ever is 203 quiz-earned trials (checked the
 *  same day), comfortably under this default limit. */
export async function getPaidTrials(days = 400, limit = 250): Promise<PaidRow[]> {
  const c = db()
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  try {
    const { data: trialRows } = await c
      .from('trial_ledger')
      .select('submission_id, name, country, stage, utm_source, trial_at, trial_cents')
      .not('submission_id', 'is', null)
      .eq('trial_refunded', false)
      .in('attribution', ['quiz_net_new', 'quiz_existing'])
      .gte('trial_at', since)
      .order('trial_at', { ascending: false })
      .limit(limit)
    const trials = trialRows ?? []
    if (trials.length === 0) return []

    const subIds = Array.from(new Set(trials.map(t => t.submission_id as string)))
    // Explicit limits below: Supabase/PostgREST defaults to capping a query
    // at 1000 rows, and sweeping ALL 203 quiz-earned trials (not a 14-day
    // slice) genuinely exceeds that — checked 2026-09-18, 3,915 raw
    // submission/anon_id pairs and 1,031 matching lifecycle events for
    // today's volume alone. A silent truncation here would not error, it
    // would just quietly drop people near the tail into "no data found."
    const { data: anonRows } = await c.from('funnel_events').select('submission_id, anon_id').in('submission_id', subIds).not('anon_id', 'is', null).limit(8000)
    const anonsBySub = new Map<string, string[]>()
    for (const r of anonRows ?? []) {
      const sid = r.submission_id as string
      const arr = anonsBySub.get(sid) ?? []
      arr.push(r.anon_id as string)
      anonsBySub.set(sid, arr)
    }
    const allAnonIds = Array.from(new Set((anonRows ?? []).map(r => r.anon_id as string)))
    if (allAnonIds.length === 0) return trials.map(t => baseRow(t))

    const { data: eventRows } = await c
      .from('funnel_events')
      .select('anon_id, event, ts, props')
      .in('anon_id', allAnonIds)
      .in('event', ['quiz_view', 'quiz_start', 'quiz_submit', 'checkout_click'])
      .order('ts', { ascending: true })
      .limit(8000)
    const events = eventRows ?? []
    const byAnon = new Map<string, typeof events>()
    for (const e of events) {
      const arr = byAnon.get(e.anon_id as string) ?? []
      arr.push(e)
      byAnon.set(e.anon_id as string, arr)
    }

    const seconds = (a: string | null, b: string | null) => {
      if (!a || !b) return null
      const d = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000)
      return d >= 0 ? d : null
    }

    return trials.map(t => {
      const sid = t.submission_id as string
      const anonIds = anonsBySub.get(sid) ?? []
      const own = anonIds.flatMap(a => byAnon.get(a) ?? []).sort((a, b) => (a.ts as string).localeCompare(b.ts as string))
      const landed = own.find(e => e.event === 'quiz_view')
      const started = own.find(e => e.event === 'quiz_start')
      const submitted = own.find(e => e.event === 'quiz_submit')
      const trialAt = t.trial_at as string
      const clicksBefore = own.filter(e => e.event === 'checkout_click' && (e.ts as string) <= trialAt)
      const lastClick = clicksBefore.length ? clicksBefore[clicksBefore.length - 1] : null
      const clickPlacement = lastClick ? (((lastClick.props as Record<string, unknown> | null)?.placement as string) ?? null) : null
      const daysSinceQuiz = submitted
        ? Math.floor((new Date(trialAt).getTime() - new Date(submitted.ts as string).getTime()) / 86400_000)
        : null
      return {
        submissionId: sid,
        name: (t.name as string) ?? null,
        country: (t.country as string) ?? null,
        stage: (t.stage as string) ?? null,
        utmSource: (t.utm_source as string) ?? null,
        trialAt,
        trialCents: t.trial_cents as number,
        landingDwellSeconds: seconds((landed?.ts as string) ?? null, (started?.ts as string) ?? null),
        quizFillSeconds: seconds((started?.ts as string) ?? null, (submitted?.ts as string) ?? null),
        clickPlacement,
        daysSinceQuiz,
        reason: inferReason(!!submitted, clickPlacement, daysSinceQuiz),
      }
    })
  } catch {
    return []
  }
}
