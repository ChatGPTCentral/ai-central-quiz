'use client'

// Retry All for trials — the same bulk pattern as InvoiceRetryAll, on the
// other side of the recovery system.
//
// Owner, 2026-08-20, in the same breath as asking for the invoice version:
// "for all overdue trials... the different behaviour is that while for
// outstanding invoice we gotta charge them, with the overdue trials we gotta
// create subscriptions." That is the one real difference. An overdue INVOICE
// already exists in Stripe and just needs `invoices.pay()`; a lapsed TRIAL
// has no invoice yet — recovering it means `subscriptions.create()`, a new
// object, on whatever payment method the person left behind. This component
// calls the exact same endpoint the single-row button already uses
// (/api/admin/charge-annual, mode: 'charge'), so every guard it has — the
// live-subscriptions check, the manual-override check, the "already pays
// elsewhere" check, the idempotency key — applies to each row here too.
//
// NO SUBSET, same rule as the invoice version: this runs every row it is
// given, not a capped slice. The confirmation states the exact count and an
// ESTIMATED total (trial price maps to plan price; a handful of trial amounts
// map to no known plan and are still attempted, just left out of the total so
// the total never overstates what will actually be asked for).
//
// CHARGE ONLY, not the invoice/email fallback. The single-row button offers
// both because a human is looking at one person and can decide. A bulk run
// automates the create-and-charge attempt only; anyone it cannot charge
// (no reusable payment method) is reported as such, not silently emailed —
// sending an invoice to dozens of people unattended is a different decision
// than this one, and stays a deliberate per-person action.
//
// STOPPABLE MID-RUN, same as the invoice-side twin. Rows already subscribed
// stay subscribed; nothing after a Stop click fires.

import React, { useRef, useState } from 'react'

const GREEN = '#2E7D32'
const RED = '#B00020'
const INK = '#1A1A1A'
const MUTE = '#6B6B6B'
const AMBER = '#B26A00'

export interface RetryAllTrial {
  customerId: string
  personKey: string
  chargeId: string
  trialCents: number
}

type Outcome = 'pending' | 'charging' | 'created' | 'no_card' | 'refused' | 'failed'

interface ResultRow extends RetryAllTrial {
  outcome: Outcome
  message: string
}

/** Mirrors lib/offers-server's trial->plan mapping for display only — the
 *  endpoint re-derives the real price server-side from the charge on record,
 *  this is purely so the confirmation dialog can show an honest estimate. */
const planCentsFor = (trialCents: number): number | null =>
  trialCents === 399 ? 3975 : trialCents === 499 ? 5975 : null

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

export default function ChargeAnnualAll({ trials }: { trials: RetryAllTrial[] }) {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'stopping' | 'done'>('idle')
  const [results, setResults] = useState<ResultRow[]>([])
  const stopRequested = useRef(false)

  if (trials.length === 0) return null

  let estimatedTotal = 0
  let unmapped = 0
  for (const t of trials) {
    const p = planCentsFor(t.trialCents)
    if (p === null) unmapped++
    else estimatedTotal += p
  }

  const run = async () => {
    stopRequested.current = false
    setPhase('running')
    setResults(trials.map(t => ({ ...t, outcome: 'pending', message: '' })))
    for (let i = 0; i < trials.length; i++) {
      if (stopRequested.current) break
      const t = trials[i]
      setResults(prev => prev.map((r, idx) => (idx === i ? { ...r, outcome: 'charging' } : r)))
      try {
        const res = await fetch('/api/admin/charge-annual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: t.customerId, personKey: t.personKey, chargeId: t.chargeId, mode: 'charge' }),
        })
        const j = await res.json().catch(() => ({}))
        const errText = String(j.error || '')
        const outcome: Outcome =
          res.ok && j.ok ? 'created'
          : /refused:/i.test(errText) ? 'refused'
          : /no reusable payment method/i.test(errText) ? 'no_card'
          : 'failed'
        setResults(prev => prev.map((r, idx) => (idx === i
          ? { ...r, outcome, message: outcome === 'created' ? `${j.subscription} · ${j.status}` : errText }
          : r)))
      } catch (e) {
        setResults(prev => prev.map((r, idx) => (idx === i ? { ...r, outcome: 'failed', message: e instanceof Error ? e.message : 'network error' } : r)))
      }
      await new Promise(r => setTimeout(r, 200))
    }
    setPhase('done')
  }

  const requestStop = () => {
    stopRequested.current = true
    setPhase('stopping')
  }

  if (phase === 'idle') {
    return (
      <button
        onClick={() => setPhase('confirm')}
        style={{ fontSize: 11, fontWeight: 800, border: `2px solid ${INK}`, background: '#FFFDFA', padding: '5px 11px', cursor: 'pointer' }}
      >
        Retry all {trials.length}
      </button>
    )
  }

  if (phase === 'confirm') {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 8, border: `2px solid ${RED}`, background: '#FFF4F4', padding: '10px 12px', maxWidth: 460 }}>
        <strong style={{ fontSize: 12.5, color: RED }}>
          This attempts to CREATE {trials.length} new subscription{trials.length === 1 ? '' : 's'} now, roughly {money(estimatedTotal)}
          {unmapped > 0 ? ` (+${unmapped} at an unmapped price, still attempted)` : ''}.
        </strong>
        <span style={{ fontSize: 11.5, color: INK, lineHeight: 1.5 }}>
          Every one of them, in this one run. Each is re-checked live first — nobody with a live subscription already,
          nobody hand-marked, nobody paying us outside the trial plans, will be touched. A decline creates nothing.
          This cannot be undone once it runs.
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => void run()}
            style={{ fontSize: 11, fontWeight: 800, border: `2px solid ${RED}`, background: '#FFFFFF', color: RED, padding: '5px 11px', cursor: 'pointer' }}
          >
            Yes, charge all {trials.length} now
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

  const counts = {
    created: results.filter(r => r.outcome === 'created').length,
    no_card: results.filter(r => r.outcome === 'no_card').length,
    refused: results.filter(r => r.outcome === 'refused').length,
    failed: results.filter(r => r.outcome === 'failed').length,
    left: results.filter(r => r.outcome === 'pending' || r.outcome === 'charging').length,
  }
  const outcomeColor: Record<Outcome, string> = {
    pending: MUTE, charging: MUTE, created: GREEN, no_card: AMBER, refused: MUTE, failed: RED,
  }
  const outcomeLabel: Record<Outcome, string> = {
    pending: 'waiting', charging: 'charging…', created: 'subscribed', no_card: 'no card — email instead',
    refused: 'refused', failed: 'failed',
  }

  const stoppedEarly = phase === 'done' && counts.left > 0
  return (
    <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '10px 12px', maxWidth: 520 }}>
      <div className="flex items-center justify-between" style={{ gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: INK }}>
          {phase === 'running' && `Retrying… ${results.length - counts.left} of ${results.length}`}
          {phase === 'stopping' && `Stopping after the current one… ${results.length - counts.left} of ${results.length}`}
          {phase === 'done' && (stoppedEarly
            ? `Stopped — ${counts.created} subscribed, ${counts.no_card} no card, ${counts.refused} refused, ${counts.failed} failed, ${counts.left} never started`
            : `Done — ${counts.created} subscribed, ${counts.no_card} no card, ${counts.refused} refused, ${counts.failed} failed`)}
        </div>
        {phase === 'running' && (
          <button
            onClick={requestStop}
            style={{ fontSize: 10, fontWeight: 800, border: `2px solid ${RED}`, background: '#FFFFFF', color: RED, padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            ■ Stop
          </button>
        )}
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 260, overflowY: 'auto' }}>
        {results.map(r => (
          <div key={r.chargeId} style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'baseline' }}>
            <span style={{ width: 60, flexShrink: 0, fontWeight: 700 }}>{money(planCentsFor(r.trialCents) ?? r.trialCents)}</span>
            <span style={{ flex: 1, minWidth: 0, color: MUTE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.personKey}
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
