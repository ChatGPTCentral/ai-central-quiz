'use client'

// The two money buttons on an outstanding invoice, with a deliberate second
// click on the one that charges. Same contract as ChargeAnnual: a button that
// moves money never fires on a slip of the mouse. The first click arms it, the
// second charges, and arming times out after five seconds back to safe.
//
// "Email invoice" does not arm, because it takes no money. It asks.
//
// Results WRAP rather than truncate. On 2026-08-13 a truncated Stripe
// permission error read as silence, and the owner spent an afternoon looking
// for a problem the message had already named. A money button's outcome is the
// last thing on this page allowed to be unreadable.
//
// RETRY IS ALWAYS OFFERED, corrected 2026-08-20. The first version hid this
// button whenever the hourly mirror's has_payment_method flag read false, on
// the theory that offering an action that cannot work is worse than not
// offering it. The theory was right; the flag was wrong. Ton Kuijlen has a
// Mastercard on file and the flag said he did not, because it was built by
// reading Stripe object fields that this account's API version does not
// populate the way expected — read app/api/admin/invoice-retry/route.ts for
// the full story. That mirror value is no longer trusted here at all. The
// endpoint now checks live, via paymentMethods.list, at the moment of the
// click — which is the only version-proof source of truth — and reports the
// real answer if it refuses.

import React, { useRef, useState } from 'react'

const GREEN = '#2E7D32'
const RED = '#B00020'
const INK = '#1A1A1A'
const MUTE = '#6B6B6B'

export default function InvoiceRetry({ invoiceId, personKey, amountCents, currency, blockedReason }: {
  invoiceId: string
  personKey: string | null
  amountCents: number
  currency: string | null
  /** Non-null = this row must not be actioned at all, and this says why.
   *  Computed from real charge history (paid_since, invoice status), never
   *  from a guessed Stripe field, so it stays trustworthy. */
  blockedReason?: string | null
}) {
  const [phase, setPhase] = useState<'idle' | 'armed' | 'busy' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [canEmail, setCanEmail] = useState(false)
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cur = String(currency || 'usd').toUpperCase()
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : ''
  const label = `${sym}${(amountCents / 100).toFixed(2)}${sym ? '' : ' ' + cur}`

  const fire = async (action: 'pay' | 'send') => {
    setPhase('busy')
    try {
      const res = await fetch('/api/admin/invoice-retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, personKey, action }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.ok) {
        setPhase('done')
        setMsg(String(j.message || j.status || 'done'))
      } else {
        setPhase('error')
        setMsg(String(j.error || `HTTP ${res.status}`))
        // A refusal means the row should not be worked at all, so it never
        // earns the email fallback. A decline does: the hosted invoice lets
        // them pay with a DIFFERENT card, which a retry can never do.
        setCanEmail(!j.refused)
      }
    } catch (e) {
      setPhase('error')
      setMsg(e instanceof Error ? e.message : 'network error')
      setCanEmail(true)
    }
  }

  // A row the view has ruled out shows the reason instead of a control that
  // would be refused anyway. A blank cell reads as a broken feature.
  if (blockedReason) {
    return <span style={{ fontSize: 10.5, color: MUTE, lineHeight: 1.4, display: 'inline-block', maxWidth: 250 }}>{blockedReason}</span>
  }

  if (phase === 'busy') return <span style={{ fontSize: 10, color: MUTE, fontWeight: 700 }}>working…</span>

  if (phase === 'done') {
    return (
      <span style={{ fontSize: 10, color: GREEN, fontWeight: 800, maxWidth: 320, display: 'inline-block', whiteSpace: 'normal', lineHeight: 1.45 }}>
        ✓ {msg}
      </span>
    )
  }

  if (phase === 'error') {
    return (
      <span style={{ display: 'inline-flex', gap: 5, alignItems: 'flex-start', flexWrap: 'wrap', whiteSpace: 'normal' }}>
        <span style={{ fontSize: 10, color: RED, fontWeight: 700, maxWidth: 300, display: 'inline-block', whiteSpace: 'normal', lineHeight: 1.45 }}>
          ✕ {msg}
        </span>
        {canEmail && (
          <button
            onClick={() => void fire('send')}
            title="Stripe emails the hosted invoice, due in 7 days. They can pay with ANY card, including a different one. This is the only lever that works on a card that cannot support the purchase, an expired card, or a 3DS challenge."
            style={{ fontSize: 9.5, border: `2px solid ${INK}`, background: '#FFFDFA', fontWeight: 800, padding: '1px 6px', cursor: 'pointer' }}
          >
            📧 Email invoice instead
          </button>
        )}
        <button
          onClick={() => { setPhase('idle'); setMsg(''); setCanEmail(false) }}
          style={{ fontSize: 9.5, border: `1px solid ${INK}`, background: '#FFFDFA', padding: '1px 6px', cursor: 'pointer' }}
        >
          reset
        </button>
      </span>
    )
  }

  const armed = phase === 'armed'
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        onClick={() => {
          if (!armed) {
            setPhase('armed')
            if (disarm.current) clearTimeout(disarm.current)
            disarm.current = setTimeout(() => setPhase(p => (p === 'armed' ? 'idle' : p)), 5000)
          } else {
            if (disarm.current) clearTimeout(disarm.current)
            void fire('pay')
          }
        }}
        title={armed
          ? 'Second click charges the card on file, for real.'
          : `Charges the card on file for ${label}, now. Checked live against Stripe at the click, not against the hourly mirror — this will correctly refuse if there truly is no card.`}
        style={{
          fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer',
          border: `2px solid ${armed ? RED : INK}`,
          background: armed ? '#FFF4F4' : '#FFFDFA',
          color: armed ? RED : INK,
          padding: '2px 8px',
        }}
      >
        {armed ? `Sure? Charge ${label}` : `Retry ${label}`}
      </button>
      <button
        onClick={() => void fire('send')}
        title="Stripe emails the hosted invoice, due in 7 days. They pay with ANY card."
        style={{ fontSize: 9.5, border: `1px solid ${INK}`, background: '#FFFDFA', padding: '2px 6px', cursor: 'pointer', fontWeight: 700 }}
      >
        📧 Email
      </button>
    </span>
  )
}
