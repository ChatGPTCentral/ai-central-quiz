'use client'

// The verification box in the person record's identity rail.
//
// Replaces the old two-state block (tuner timestamp or "pending"). Four
// states now, and two owner actions that were impossible before: verify or
// reject THIS person right here, without a detour through the tuner queue.
// Owner's law: his click is final — the API locks the row against every
// automated path until he himself resets it.

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

const GREEN = '#2D6A26'
const RED = '#A31621'
const AMBER = '#B26A00'
const MUTE = '#9C9C9C'

export default function VerificationControl({ id, state, evidence, verifiedAt }: {
  id: string
  state: string
  evidence?: string | null
  verifiedAt?: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const set = async (next: 'owner_verified' | 'rejected' | 'unverified') => {
    setBusy(true)
    setErr('')
    try {
      const res = await fetch('/api/admin/verify-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, state: next }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(String(j.error || `HTTP ${res.status}`))
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const btn: React.CSSProperties = { fontSize: 10, fontWeight: 800, padding: '5px 9px', cursor: 'pointer', background: '#FFFFFF' }

  const banner = (color: string, bg: string, label: string) => (
    <div style={{ border: `2px solid ${color}`, background: bg, color, padding: '9px 12px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}
         title={evidence || undefined}>
      {label}
    </div>
  )

  return (
    <div style={{ marginTop: 18, maxWidth: 272 }}>
      {state === 'owner_verified' && banner(GREEN, '#FFFFFF', `✓ Verified by you${verifiedAt ? ` ${fmt(verifiedAt)}` : ''}`)}
      {state === 'auto_verified' && banner(GREEN, '#F2F9F1', '✓ Verified — domain proof')}
      {state === 'rejected' && banner(RED, '#FDECEA', '✕ Rejected by you')}
      {(state === 'unverified' || !state) && banner(AMBER, '#FEF7E7', '⏳ Not verified')}

      {evidence && (
        <div style={{ marginTop: 5, fontSize: 10, color: MUTE, lineHeight: 1.45 }}>{evidence}</div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
        {state !== 'owner_verified' && (
          <button disabled={busy} onClick={() => void set('owner_verified')} style={{ ...btn, border: `2px solid ${GREEN}`, color: GREEN }}>
            ✓ Verify
          </button>
        )}
        {state !== 'rejected' && (
          <button disabled={busy} onClick={() => void set('rejected')} style={{ ...btn, border: `2px solid ${RED}`, color: RED }}>
            ✕ Reject
          </button>
        )}
        {(state === 'owner_verified' || state === 'rejected') && (
          <button disabled={busy} onClick={() => void set('unverified')} style={{ ...btn, border: '1px solid #E8E4DF', color: MUTE, fontWeight: 700 }}
                  title="Unlocks the row: automation may enrich it again and it re-enters the tuner queue">
            reset
          </button>
        )}
      </div>
      {busy && <div style={{ marginTop: 5, fontSize: 10, color: MUTE }}>saving…</div>}
      {err && <div style={{ marginTop: 5, fontSize: 10, color: RED }}>✕ {err}</div>}
    </div>
  )
}
