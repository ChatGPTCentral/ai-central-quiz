'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Single Enrich button — always runs the full v2 pipeline with cache bypassed
 * AND overwrites existing values. One workflow that always works.
 */
export default function EnrichHeaderButton({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ saved: boolean; fields: string[] } | null>(null)

  async function run() {
    setBusy(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/admin/enrich/v2/row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, save: true, force: true }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Pipeline failed'); return }
      if (data.saveError) { setError(`Save error: ${data.saveError}`); return }
      setResult({ saved: !!data.saved, fields: data.fieldsUpdated || [] })
      router.refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={busy}
        title="Re-runs the full pipeline (Google → Apify → Apollo → Wiza → Claude vision) and overwrites existing fields with fresh data."
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#333333] text-[#FFFDFA] text-sm font-bold disabled:opacity-40 hover:opacity-90"
      >
        {busy ? 'Enriching…' : <>✨ Enrich</>}
      </button>
      {error && <p className="text-[11px] text-[#BE3B3B] max-w-xs text-right break-words">{error}</p>}
      {result && !error && result.saved && (
        <p className="text-[11px] text-[#62A758]">✓ Updated {result.fields.length} field{result.fields.length === 1 ? '' : 's'}</p>
      )}
      {result && !error && !result.saved && (
        <p className="text-[11px] text-[#9C9C9C]">No fresh data returned</p>
      )}
    </div>
  )
}
