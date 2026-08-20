'use client'

// Generates a real, hosted Stripe INVOICE link for a graduated person with
// no quiz result to send them back to.
//
// Owner, 2026-08-20: "can't we generate the invoices and then use the
// invoice links" — correct, and simpler than what this replaced. A hosted
// invoice page is an interactive Stripe payment form, exactly like a
// Checkout Session — it can complete a 3D Secure challenge the same way,
// because the cardholder authenticates in their own browser either way. The
// mechanism this needed already existed: /api/admin/charge-annual's
// mode:'invoice' branch, live since 2026-08-13 as the single-row button's
// "Email invoice instead" fallback. This calls the same route, the same
// guards, and just reads the hosted_invoice_url back out of the response.
//
// DURABLE STATE, corrected the same day. The first version only remembered a
// generated link in React state — gone on reload. The owner generated a real
// link for ajit.talluri@gmail.com, it worked, then he reloaded and clicked
// again: correctly refused ("already has a live subscription"), because the
// FIRST click had already made one. The refusal was right; showing a blank
// button that invited the second click was the bug. existingUrl now comes
// from the database (admin_actions, via revenue_recovery_board) and renders
// immediately — no button, no chance of asking Stripe to make a second one.
//
// Creates a real subscription (collection_method: send_invoice) and sends
// Stripe's own invoice email immediately — nobody is CHARGED by this,
// nothing moves until the person opens the link and pays.

import React, { useState } from 'react'

const GREEN = '#2E7D32'
const RED = '#B00020'
const INK = '#1A1A1A'
const MUTE = '#6B6B6B'

export default function RecoveryInvoiceLink({ customerId, personKey, chargeId, existingUrl, needsReview }: {
  customerId: string | null
  personKey: string
  chargeId: string | null
  /** Already generated, read from admin_actions — render it, never a fresh button. */
  existingUrl?: string | null
  /** Stripe shows a live subscription we never created. Something converted
   *  them outside this system after they graduated — a human needs to look
   *  in Stripe directly, generating again would just be refused again. */
  needsReview?: boolean
}) {
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState('')

  if (!customerId || !chargeId) return null

  const fire = async () => {
    setPhase('busy')
    try {
      const res = await fetch('/api/admin/charge-annual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, personKey, chargeId, mode: 'invoice' }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.ok && j.invoiceUrl) {
        setPhase('done')
        setUrl(j.invoiceUrl)
      } else if (res.ok && j.ok) {
        setPhase('error')
        setMsg('Invoice created but Stripe did not return a hosted URL — check admin_actions (charge_annual_invoiced) for the invoice id.')
      } else {
        setPhase('error')
        setMsg(String(j.error || `HTTP ${res.status}`))
      }
    } catch (e) {
      setPhase('error')
      setMsg(e instanceof Error ? e.message : 'network error')
    }
  }

  const shown = phase === 'done' ? url : existingUrl

  if (shown) {
    return (
      <div style={{ marginTop: 4 }}>
        <input
          readOnly
          value={shown}
          onClick={e => (e.target as HTMLInputElement).select()}
          style={{ fontSize: 9.5, width: '100%', border: `1px solid ${GREEN}`, padding: '3px 5px', color: GREEN, fontFamily: 'monospace' }}
        />
        <div style={{ fontSize: 9.5, color: MUTE, marginTop: 2 }}>
          {phase === 'done'
            ? 'select all, copy into the draft. Stripe already emailed this invoice too, separately.'
            : 'already generated — this is the same link every time, not a fresh one.'}
        </div>
      </div>
    )
  }

  // No link yet, and Stripe already refused one for a reason unrelated to
  // "we already made it": someone converted outside this system.
  if (needsReview) {
    return (
      <span style={{ fontSize: 9.5, color: RED, display: 'block', marginTop: 4, lineHeight: 1.4 }}>
        ⚠ Stripe shows a live subscription we never created. Check this customer in Stripe directly before doing anything else.
      </span>
    )
  }

  if (phase === 'busy') return <span style={{ fontSize: 10, color: MUTE, fontWeight: 700 }}>generating…</span>

  if (phase === 'error') {
    return (
      <span style={{ fontSize: 9.5, color: RED, display: 'block', marginTop: 4, lineHeight: 1.4 }}>
        ✕ {msg} <button onClick={() => setPhase('idle')} style={{ marginLeft: 4, fontSize: 9.5, textDecoration: 'underline' }}>retry</button>
      </span>
    )
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); void fire() }}
      style={{ marginTop: 5, fontSize: 9.5, fontWeight: 800, border: `1px solid ${INK}`, background: '#FFFFFF', padding: '2px 7px', cursor: 'pointer' }}
    >
      Generate invoice link
    </button>
  )
}
