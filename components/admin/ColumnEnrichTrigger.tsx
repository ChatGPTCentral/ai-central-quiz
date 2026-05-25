'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Column-header "fill all empty" trigger. Calls the batch field-enrichment
 * endpoint with the requested single field — only rows that are missing it
 * get processed.
 */
export default function ColumnEnrichTrigger({
  field,
  label = '✨ Fill',
}: {
  field: 'photo' | 'demographics' | 'beehiiv' | 'stripe'
  label?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function run(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const labelMap = { photo: 'photos', demographics: 'age + sex', beehiiv: 'Beehiiv data', stripe: 'Stripe LTV' }
    const costMap  = { photo: 0.004,    demographics: 0.005,        beehiiv: 0,             stripe: 0 }
    const free = costMap[field] === 0
    const note = free ? 'free (API has no per-call cost)' : `≈ $${(50 * costMap[field]).toFixed(2)} (50 calls max)`
    if (!confirm(`Fill empty ${labelMap[field]} for the top 50 rows missing them?\n\nCost: ${note}.`)) return
    setBusy(true); setMsg('')
    try {
      const res = await fetch('/api/admin/enrich/v2/field/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, limit: 50, missingOnly: true }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || 'Failed'); return }
      setMsg(`✓ ${data.updatedCount}/${data.processed} updated`)
      router.refresh()
      setTimeout(() => setMsg(''), 5000)
    } catch (e) {
      setMsg(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      title={`Fill empty ${field === 'photo' ? 'photos' : 'demographics'} on the top 50 missing rows`}
      className="ml-1.5 inline-flex items-center h-5 px-1.5 rounded text-[9px] font-bold uppercase tracking-wider bg-white border border-[#E8E4DF] text-[#9C9C9C] hover:bg-[#FEF7E7] hover:text-[#E48715] hover:border-[#E48715] disabled:opacity-40"
    >
      {busy ? '…' : msg || label}
    </button>
  )
}
