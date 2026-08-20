'use client'

// Generates a real, hosted Stripe Checkout link for a graduated person with
// no quiz result to send them back to (source='stripe' — a direct Stripe
// signup, never took the quiz). Unlike a server-side charge, this link lets
// the cardholder complete a 3D Secure challenge interactively, which is the
// one thing a merchant-initiated attempt can never do.
//
// Creates NOTHING by itself. Nobody is charged until the person opens this
// link and pays — lower risk than the retry buttons, not higher.

import React, { useState } from 'react'

const GREEN = '#2E7D32'
const RED = '#B00020'
const INK = '#1A1A1A'
const MUTE = '#6B6B6B'

export default function RecoveryCheckoutLink({ customerId, personKey, chargeId }: {
  customerId: string | null
  personKey: string
  chargeId: string | null
}) {
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState('')

  if (!customerId || !chargeId) return null

  const fire = async () => {
    setPhase('busy')
    try {
      const res = await fetch('/api/admin/recovery-checkout-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, personKey, chargeId }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.ok && j.url) {
        setPhase('done')
        setUrl(j.url)
      } else {
        setPhase('error')
        setMsg(String(j.error || `HTTP ${res.status}`))
      }
    } catch (e) {
      setPhase('error')
      setMsg(e instanceof Error ? e.message : 'network error')
    }
  }

  if (phase === 'busy') return <span style={{ fontSize: 10, color: MUTE, fontWeight: 700 }}>generating…</span>

  if (phase === 'done') {
    return (
      <div style={{ marginTop: 4 }}>
        <input
          readOnly
          value={url}
          onClick={e => (e.target as HTMLInputElement).select()}
          style={{ fontSize: 9.5, width: '100%', border: `1px solid ${GREEN}`, padding: '3px 5px', color: GREEN, fontFamily: 'monospace' }}
        />
        <div style={{ fontSize: 9.5, color: MUTE, marginTop: 2 }}>select all, copy into the draft. Expires in 24h.</div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <span style={{ fontSize: 9.5, color: RED, display: 'block', marginTop: 4 }}>
        ✕ {msg} <button onClick={() => setPhase('idle')} style={{ marginLeft: 4, fontSize: 9.5, textDecoration: 'underline' }}>retry</button>
      </span>
    )
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); void fire() }}
      style={{ marginTop: 5, fontSize: 9.5, fontWeight: 800, border: `1px solid ${INK}`, background: '#FFFFFF', padding: '2px 7px', cursor: 'pointer' }}
    >
      Generate checkout link
    </button>
  )
}
