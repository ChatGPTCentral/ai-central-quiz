'use client'

// "Sync now" — pull Stripe immediately and reload the page.
//
// Charges normally arrive by webhook within seconds and the hourly sweep
// catches anything missed, so this is the escape hatch for the moment the
// owner is looking at Stripe and this page at the same time and wants them to
// agree right now. It shows how stale the mirror is so the button is only
// interesting when it needs to be.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SyncCharges({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const ageMin = lastSyncedAt ? Math.round((Date.now() - Date.parse(lastSyncedAt)) / 60000) : null
  const stale = ageMin !== null && ageMin > 75

  const run = async () => {
    setBusy(true); setMsg('pulling Stripe…')
    try {
      const res = await fetch('/api/admin/stripe-charges-sync', { cache: 'no-store' })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error || String(res.status))
      setMsg(`${d?.charges ?? 0} charges synced`)
      router.refresh()
      setTimeout(() => setMsg(''), 3000)
    } catch (e) {
      setMsg(`failed: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center" style={{ gap: 8 }}>
      <button type="button" onClick={run} disabled={busy}
        title="Pull every charge from Stripe now and refresh this page"
        style={{
          padding: '5px 11px', fontSize: 11.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
          border: `2px solid ${stale ? '#B26A00' : '#1A1A1A'}`,
          background: stale ? '#FEF7E7' : '#FFFDFA', color: '#1A1A1A',
        }}>
        {busy ? 'Syncing…' : 'Sync Stripe now'}
      </button>
      <span style={{ fontSize: 11, color: msg.startsWith('failed') ? '#B00020' : '#7A7A7A' }}>
        {msg || (ageMin === null ? 'never synced'
          : ageMin < 2 ? 'synced just now'
          : ageMin < 90 ? `synced ${ageMin} min ago`
          : `synced ${Math.round(ageMin / 60)}h ago`)}
      </span>
    </span>
  )
}
