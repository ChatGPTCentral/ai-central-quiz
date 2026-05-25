'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Single Enrich button — always runs the full v2 pipeline with cache bypassed
 * AND overwrites existing values. One workflow that always works.
 */
export default function EnrichHeaderButton({
  id, status, enrichedAt,
}: {
  id: string
  status?: 'complete' | 'partial' | 'failed'
  enrichedAt?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ saved: boolean; fields: string[] } | null>(null)

  const dateStr = enrichedAt ? new Date(enrichedAt).toLocaleDateString() : null

  async function run() {
    if (status && !confirm(`This row was already enriched${dateStr ? ` on ${dateStr}` : ''} (status: ${status}).\n\nRe-run anyway? Costs API credits.`)) return
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

  const statusChip = status && (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
        status === 'complete' ? 'bg-[#62A758]/15 text-[#2D6A26] border border-[#62A758]/40' :
        status === 'partial'  ? 'bg-[#E7B02F]/15 text-[#9A6F00] border border-[#E7B02F]/40' :
        'bg-[#BE3B3B]/15 text-[#8A1F1F] border border-[#BE3B3B]/40'
      }`}
      title={dateStr ? `Enriched on ${dateStr}` : 'Enrichment status'}
    >
      {status === 'complete' ? '✓' : status === 'partial' ? '~' : '✕'} {status}
      {dateStr && <span className="font-normal opacity-70">· {dateStr}</span>}
    </span>
  )

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {statusChip}
        <button
          onClick={run}
          disabled={busy}
          title={status ? `Already enriched${dateStr ? ` on ${dateStr}` : ''} — click to re-run` : 'Run the full enrichment pipeline'}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#333333] text-[#FFFDFA] text-sm font-bold disabled:opacity-40 hover:opacity-90"
        >
          {busy ? 'Enriching…' : (status ? <>↻ Re-enrich</> : <>✨ Enrich</>)}
        </button>
      </div>
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

