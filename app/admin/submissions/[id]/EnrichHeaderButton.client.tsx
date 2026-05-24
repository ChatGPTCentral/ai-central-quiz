'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface SavedField { col: string; value?: string }

export default function EnrichHeaderButton({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ saved: boolean; fields: string[]; saveError?: string; fromCache?: boolean } | null>(null)

  async function onClick() {
    setBusy(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/admin/enrich/v2/row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, save: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Pipeline failed')
        return
      }
      setResult({
        saved: !!data.saved,
        fields: data.fieldsUpdated || [],
        saveError: data.saveError,
        fromCache: !!data.fromCache,
      })
      if (data.saveError) {
        setError(`Save error: ${data.saveError}`)
        return
      }
      // Reload server data so the page shows what was just saved
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
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#333333] text-[#FFFDFA] text-sm font-bold disabled:opacity-40 hover:opacity-90"
      >
        {busy ? 'Enriching…' : <>✨ Enrich &amp; save</>}
      </button>
      {error && <p className="text-[11px] text-[#BE3B3B] max-w-xs text-right break-words">{error}</p>}
      {result && !error && result.saved && (
        <p className="text-[11px] text-[#62A758]">
          ✓ Saved {result.fields.length} field{result.fields.length === 1 ? '' : 's'}
          {result.fromCache && <span className="text-[#9C9C9C] ml-1">· cached (free)</span>}
        </p>
      )}
      {result && !error && !result.saved && (
        <p className="text-[11px] text-[#9C9C9C]">No new data to save — try Google manually or click Lab page</p>
      )}
    </div>
  )
}
