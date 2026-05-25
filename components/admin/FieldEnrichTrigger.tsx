'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Tiny in-cell enrich trigger. Calls the surgical field-enrichment endpoint
 * with the minimum set of stages needed for the requested field.
 *
 * Cost map (per click):
 *   field='photo'        → ≈ $0.004 (Apify) or 1× Apollo fallback
 *   field='demographics' → ≈ $0.005 (Claude vision, fills age + sex together)
 */
export default function FieldEnrichTrigger({
  rowId,
  field,
  label = '✨',
  title,
  className = '',
}: {
  rowId: string
  field: 'photo' | 'demographics' | 'beehiiv' | 'stripe'
  label?: string
  title?: string
  className?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function run(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/enrich/v2/field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowId, fields: [field] }),
      })
      const data = await res.json()
      if (!res.ok || !data.updated?.length) {
        const reason = data.skipped?.[0]?.reason || data.error || 'No data returned'
        setErr(reason)
      } else {
        router.refresh()
      }
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      title={err || title || (field === 'photo' ? 'Fetch photo only (≈$0.004)' : 'Estimate age + sex from photo (≈$0.005)')}
      className={`inline-flex items-center justify-center h-5 px-1.5 rounded text-[10px] font-bold transition-colors ${
        err ? 'bg-[#BE3B3B]/15 text-[#BE3B3B] border border-[#BE3B3B]/30' :
        busy ? 'bg-[#F5F5F5] text-[#9C9C9C]' :
        'bg-[#FEF7E7] text-[#E48715] border border-[#E48715]/30 hover:bg-[#E48715] hover:text-white'
      } ${className}`}
    >
      {busy ? '…' : err ? '✕' : label}
    </button>
  )
}
