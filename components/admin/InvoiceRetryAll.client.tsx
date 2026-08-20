'use client'

// Retry All — one click to run the whole queue, not one invoice.
//
// Owner request, 2026-08-20, right after the single-invoice retry got fixed
// to check live via paymentMethods.list instead of guessing a Stripe field.
// This reuses that same endpoint, per row, so every safety property it has —
// the paid-since guard, the idempotency key, the live card check, the honest
// refusal message — applies here too, unchanged. This component adds only the
// batching and the confirmation in front of it.
//
// A BULK button that moves money needs MORE friction than a single one, not
// less: it can touch dozens of real cards in one action, and there is no undo.
// So the confirmation here is two deliberate clicks with the count and the
// dollar total stated plainly, not a five-second arm/disarm timer — a timer
// is right for "am I sure THIS click was intentional", not for "have I
// actually read how many people this touches".
//
// NO SUBSET. Owner, 2026-08-20: "'retry all' should retry all for real not a
// subset." The first version silently capped a run at 50 and kept the rest
// for "next time" — safe, but not what was asked. It now runs every invoice
// it is given, in full. The `invoices` prop is the boundary that matters: the
// caller (app/admin/revenue/unpaid/page.tsx) passes exactly the overdue,
// actionable set, not a smaller slice picked in here.
//
// SEQUENTIAL, not parallel. Awaiting one call before starting the next is
// slower, but it is gentle on Stripe's rate limits and it is what makes a
// live, honest progress list possible — the owner sees each outcome as it
// lands rather than staring at a spinner for everyone at once.

import React, { useState } from 'react'

const GREEN = '#2E7D32'
const RED = '#B00020'
const INK = '#1A1A1A'
const MUTE = '#6B6B6B'
const AMBER = '#B26A00'

export interface RetryAllInvoice {
  invoiceId: string
  personKey: string | null
  amountCents: number
  currency: string | null
  /** Non-null = known blocked (uncollectible, paid since, etc). Skipped
   *  WITHOUT a network call — the reason is read from a reliable enum field
   *  or our own charge history, not a guessed one, so it is safe to trust
   *  without asking Stripe again. Still listed in the results, never hidden:
   *  owner, 2026-08-20, "can't the retry button go on everybody, why just a
   *  subset" — it does go on everybody now; this is how it stays honest
   *  about the ones it already knows cannot move. */
  blockedReason?: string | null
}

type Outcome = 'pending' | 'charging' | 'paid' | 'no_card' | 'refused' | 'failed' | 'skipped'

interface ResultRow {
  invoiceId: string
  personKey: string | null
  amountCents: number
  currency: string | null
  outcome: Outcome
  message: string
}

const money = (cents: number, cur: string | null) => {
  const c = (cur || 'usd').toUpperCase()
  const sym = c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : ''
  return `${sym}${(cents / 100).toFixed(2)}${sym ? '' : ' ' + c}`
}

export default function InvoiceRetryAll({ invoices }: { invoices: RetryAllInvoice[] }) {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle')
  const [results, setResults] = useState<ResultRow[]>([])

  // The full list, always — see the header note on why there is no slice here.
  const batch = invoices
  const toCall = batch.filter(inv => !inv.blockedReason)
  const toSkip = batch.filter(inv => inv.blockedReason)
  const totalByCurrency = new Map<string, number>()
  for (const inv of toCall) {
    const k = (inv.currency || 'usd').toUpperCase()
    totalByCurrency.set(k, (totalByCurrency.get(k) ?? 0) + inv.amountCents)
  }
  const totalLabel = Array.from(totalByCurrency.entries()).map(([c, cents]) => money(cents, c)).join(' + ')

  if (invoices.length === 0) return null

  const run = async () => {
    setPhase('running')
    setResults(batch.map(inv => ({ ...inv, outcome: 'pending', message: '' })))
    for (let i = 0; i < batch.length; i++) {
      const inv = batch[i]
      if (inv.blockedReason) {
        // Known-blocked, verified from a reliable field, not a guess: skip
        // without spending a Stripe call, but still show it, in place, so
        // nothing here is invisible.
        setResults(prev => prev.map((r, idx) => (idx === i ? { ...r, outcome: 'skipped', message: inv.blockedReason ?? '' } : r)))
        continue
      }
      setResults(prev => prev.map((r, idx) => (idx === i ? { ...r, outcome: 'charging' } : r)))
      try {
        const res = await fetch('/api/admin/invoice-retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: inv.invoiceId, personKey: inv.personKey, action: 'pay' }),
        })
        const j = await res.json().catch(() => ({}))
        const outcome: Outcome =
          res.ok && j.ok ? 'paid'
          : j.refused ? 'refused'
          : /no card attached/i.test(String(j.error || '')) ? 'no_card'
          : 'failed'
        setResults(prev => prev.map((r, idx) => (idx === i ? { ...r, outcome, message: String(j.message || j.error || '') } : r)))
      } catch (e) {
        setResults(prev => prev.map((r, idx) => (idx === i ? { ...r, outcome: 'failed', message: e instanceof Error ? e.message : 'network error' } : r)))
      }
      // A short gap between calls — gentle on Stripe, and it is what turns
      // this into a list the owner can actually watch land, one at a time.
      await new Promise(r => setTimeout(r, 200))
    }
    setPhase('done')
  }

  if (phase === 'idle') {
    return (
      <button
        onClick={() => setPhase('confirm')}
        style={{ fontSize: 11, fontWeight: 800, border: `2px solid ${INK}`, background: '#FFFDFA', padding: '5px 11px', cursor: 'pointer' }}
      >
        Retry all {batch.length}
      </button>
    )
  }

  if (phase === 'confirm') {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 8, border: `2px solid ${RED}`, background: '#FFF4F4', padding: '10px 12px', maxWidth: 460 }}>
        <strong style={{ fontSize: 12.5, color: RED }}>
          This runs every one of the {batch.length} rows above. {toCall.length} get a real, live charge attempt
          totaling {totalLabel}{toSkip.length > 0 ? `; ${toSkip.length} are already known blocked and are skipped without spending a Stripe call, but still listed` : ''}.
        </strong>
        <span style={{ fontSize: 11.5, color: INK, lineHeight: 1.5 }}>
          Each real attempt is checked live before it charges — nobody who has paid since, and nobody without a real
          card attached, will be touched. This cannot be undone once it runs.
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => void run()}
            style={{ fontSize: 11, fontWeight: 800, border: `2px solid ${RED}`, background: '#FFFFFF', color: RED, padding: '5px 11px', cursor: 'pointer' }}
          >
            Yes, run all {batch.length} now
          </button>
          <button
            onClick={() => setPhase('idle')}
            style={{ fontSize: 11, border: `1px solid ${INK}`, background: '#FFFFFF', padding: '5px 11px', cursor: 'pointer' }}
          >
            cancel
          </button>
        </span>
      </span>
    )
  }

  // running or done — same list, the running one still animating its tail.
  const counts = {
    paid: results.filter(r => r.outcome === 'paid').length,
    no_card: results.filter(r => r.outcome === 'no_card').length,
    refused: results.filter(r => r.outcome === 'refused').length,
    failed: results.filter(r => r.outcome === 'failed').length,
    skipped: results.filter(r => r.outcome === 'skipped').length,
    left: results.filter(r => r.outcome === 'pending' || r.outcome === 'charging').length,
  }
  const outcomeColor: Record<Outcome, string> = {
    pending: MUTE, charging: MUTE, paid: GREEN, no_card: AMBER, refused: MUTE, failed: RED, skipped: MUTE,
  }
  const outcomeLabel: Record<Outcome, string> = {
    pending: 'waiting', charging: 'charging…', paid: 'paid', no_card: 'no card — try email',
    refused: 'refused', failed: 'failed', skipped: 'skipped',
  }

  return (
    <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '10px 12px', maxWidth: 520 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: INK }}>
        {phase === 'running'
          ? `Retrying… ${results.length - counts.left} of ${results.length}`
          : `Done — ${counts.paid} paid, ${counts.no_card} no card, ${counts.refused} refused, ${counts.failed} failed, ${counts.skipped} skipped (already known blocked)`}
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 260, overflowY: 'auto' }}>
        {results.map(r => (
          <div key={r.invoiceId} style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'baseline' }}>
            <span style={{ width: 66, flexShrink: 0, fontWeight: 700 }}>{money(r.amountCents, r.currency)}</span>
            <span style={{ flex: 1, minWidth: 0, color: MUTE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.personKey ?? r.invoiceId}
            </span>
            <span style={{ color: outcomeColor[r.outcome], fontWeight: 700, whiteSpace: 'nowrap' }}>{outcomeLabel[r.outcome]}</span>
          </div>
        ))}
      </div>
      {phase === 'done' && (
        <button
          onClick={() => { setPhase('idle'); setResults([]) }}
          style={{ marginTop: 8, fontSize: 10.5, border: `1px solid ${INK}`, background: '#FFFFFF', padding: '3px 8px', cursor: 'pointer' }}
        >
          reset
        </button>
      )}
    </div>
  )
}
