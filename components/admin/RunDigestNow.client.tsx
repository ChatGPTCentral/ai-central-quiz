'use client'

// A person watching the numbers should not have to wait for 07:15 UTC
// (owner, 2026-08-24: "ci dobbiamo ossessionare") — same reasoning as the
// ux-watch "run now" affordance: the schedule is for the machine.

import { useState } from 'react'

const INK = '#1A1A1A'

export default function RunDigestNow() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const run = async () => {
    setBusy(true); setFailed(false)
    try {
      const res = await fetch('/api/cron/daily-digest')
      if (!res.ok) throw new Error(String(res.status))
      window.location.reload()
    } catch {
      setBusy(false); setFailed(true)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        style={{
          fontSize: 11.5, fontWeight: 700, padding: '6px 12px', cursor: busy ? 'default' : 'pointer',
          border: `2px solid ${INK}`, background: busy ? '#F3F0E8' : '#FFFDFA', color: INK,
        }}
      >
        {busy ? 'Calcolo…' : "Rifai adesso"}
      </button>
      {failed && <span style={{ fontSize: 11, color: '#B00020' }}>non riuscito, riprova</span>}
    </span>
  )
}
