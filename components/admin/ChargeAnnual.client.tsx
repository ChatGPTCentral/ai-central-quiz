'use client'

// The one-click $59.75 retry, with a deliberate second click. A button that
// moves money must never fire on a slip of the mouse, so the first click only
// arms it ("Sure? Charge card on file") and the second one charges. Arming
// times out after five seconds back to safe.

import React, { useRef, useState } from 'react'

const GREEN = '#2E7D32'
const RED = '#B00020'
const INK = '#1A1A1A'

export default function ChargeAnnual({ customerId, personKey, chargeId, trialCents }: {
  customerId: string
  personKey: string
  chargeId: string
  /** The trial's amount decides the plan: 399 → $39.75/yr, 499 → $59.75/yr.
   *  Display only — the server re-reads the charge and picks the price
   *  itself, so a stale prop can mislabel a button but never mischarge. */
  trialCents: number
}) {
  const planLabel = trialCents === 399 ? '$39.75' : '$59.75'
  const [phase, setPhase] = useState<'idle' | 'armed' | 'busy' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fire = async (mode: 'charge' | 'invoice' = 'charge') => {
    setPhase('busy')
    try {
      const res = await fetch('/api/admin/charge-annual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, personKey, chargeId, mode }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.ok) {
        setPhase('done')
        setMsg(j.invoiced
          ? `${j.subscription} · invoice ${j.invoiceSent ? 'emailed, due in 7 days' : 'created (Stripe emails it shortly)'}`
          : `${j.subscription} · ${j.status}. Ledger updates at the next :20 sync.`)
      } else {
        setPhase('error')
        setMsg(String(j.error || `HTTP ${res.status}`))
      }
    } catch (e) {
      setPhase('error')
      setMsg(e instanceof Error ? e.message : 'network error')
    }
  }

  // Results WRAP instead of truncating. The truncation hid the one message
  // that explained everything (a Stripe key permission error), and the owner
  // read the silence as "not going through" (2026-08-13). A money button's
  // outcome is the last thing on this page allowed to be unreadable.
  if (phase === 'done') return <span style={{ fontSize: 10, color: GREEN, fontWeight: 800, maxWidth: 360, display: 'inline-block', whiteSpace: 'normal', lineHeight: 1.45 }}>✓ {msg}</span>
  if (phase === 'error') return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'flex-start', whiteSpace: 'normal' }}>
      <span style={{ fontSize: 10, color: RED, fontWeight: 700, maxWidth: 340, display: 'inline-block', whiteSpace: 'normal', lineHeight: 1.45 }}>✕ {msg}</span>
      {/* Nothing reusable to bill: offer the path the Stripe dashboard offers
          on such customers — the subscription on an emailed invoice. */}
      {msg.includes('no reusable payment method') && (
        <button onClick={() => void fire('invoice')}
          title={`Creates the ${planLabel}/year subscription with a Stripe invoice emailed to them, due in 7 days. They pay it themselves.`}
          style={{ fontSize: 9.5, border: `2px solid ${INK}`, background: '#FFFDFA', fontWeight: 800, padding: '1px 6px', cursor: 'pointer' }}>
          📧 Email invoice instead
        </button>
      )}
      <button onClick={() => { setPhase('idle'); setMsg('') }} style={{ fontSize: 9.5, border: `1px solid ${INK}`, background: '#FFFDFA', padding: '1px 6px', cursor: 'pointer' }}>retry</button>
    </span>
  )
  if (phase === 'busy') return <span style={{ fontSize: 10, color: '#6B6B6B', fontWeight: 700 }}>charging…</span>

  const armed = phase === 'armed'
  return (
    <button
      onClick={() => {
        if (!armed) {
          setPhase('armed')
          if (disarm.current) clearTimeout(disarm.current)
          disarm.current = setTimeout(() => setPhase(p => (p === 'armed' ? 'idle' : p)), 5000)
        } else {
          if (disarm.current) clearTimeout(disarm.current)
          void fire()
        }
      }}
      title={armed ? 'Second click charges the card on file, for real.' : `Creates the ${planLabel}/year subscription (the plan matching their trial) on this customer’s card on file. First click arms, second click charges.`}
      style={{
        fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer',
        border: `2px solid ${armed ? RED : INK}`,
        background: armed ? '#FFF4F4' : '#FFFDFA',
        color: armed ? RED : INK,
        padding: '2px 8px',
      }}
    >
      {armed ? `Sure? Charge ${planLabel} to card on file` : `Charge ${planLabel}`}
    </button>
  )
}
