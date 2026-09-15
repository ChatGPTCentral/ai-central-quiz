// Reached checkout, didn't pay — the board the owner asked for 2026-09-15:
// "una board dove raccogliamo insights per ogni... persona che non ha pagato,
// per capire quale sarebbe la best action to conversion". Not everyone who
// never converted: only people who got far enough to have a real signal —
// they clicked a checkout button and did not end up in trial_ledger — since
// that is the one non-paying group where "why" is answerable at all (an
// email exists because the quiz was already completed) and where the
// signal (checkout_modal_close: how + dwellMs) already exists, built for
// app/api/admin/checkout-autopsy/route.ts's aggregate read of the exact same
// events. This is that same source, at the PERSON level instead of a
// histogram — one fact, two views, not a second computation of it.
//
// dwellMs interpretation carries over unchanged from checkout-autopsy: under
// ~10s is a bounce or misclick, 30s+ is someone who read the form and said
// no on purpose. Those need different messages, so the read/bounce split is
// exposed as its own field rather than left for a reader to infer from raw ms.

import { db } from '@/lib/revenue-shared'

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
