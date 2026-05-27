'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SEGMENTS } from '@/lib/segmentation'

interface Props {
  /** Current distribution { segment_key: count } — server-computed */
  distribution: Record<string, number>
  total: number
}

export default function SegmentsPanel({ distribution, total }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')

  async function reassign(dryRun: boolean) {
    if (!dryRun && !confirm('Re-run the persona classifier on every CRM row?\n\nDeterministic + idempotent — only rows whose segment changed get written. Takes ~1-2 min for ~2.5k rows.')) return
    setBusy(true); setMsg('')
    try {
      // Loop until hasMore=false (the endpoint chunks at 5000 rows)
      let totalScanned = 0, totalUpdated = 0
      for (let pass = 0; pass < 10; pass++) {
        const res = await fetch('/api/admin/segments/reassign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun, limit: 5000 }),
        })
        const data = await res.json()
        if (!res.ok) { setMsg(`✕ ${data.error || 'failed'}`); return }
        totalScanned += data.scanned ?? 0
        totalUpdated += data.updated ?? 0
        setMsg(`${dryRun ? 'Dry-run' : 'Reassigned'} pass ${pass+1}: scanned ${data.scanned}, updated ${data.updated} · cum ${totalScanned}/${totalUpdated}`)
        if (!data.hasMore) break
      }
      if (!dryRun) router.refresh()
    } catch (e) {
      setMsg(`✕ ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden mt-6">
      <header className="px-5 py-4 border-b border-[#E8E4DF] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-black text-[#333333]">Persona segments</h2>
          <p className="text-[11px] text-[#9C9C9C] mt-0.5">
            Money-blind segmentation — each row gets exactly one persona based on socio-demo-psycho-behavioural traits. Edit <code className="bg-[#F5F5F5] px-1 rounded">lib/segmentation.ts</code> to refine, then reassign.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => reassign(true)} disabled={busy} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-white border border-[#E8E4DF] text-[#333333] hover:bg-[#FEF7E7] disabled:opacity-40">👁 Dry run</button>
          <button onClick={() => reassign(false)} disabled={busy} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-[#333333] text-[#FFFDFA] hover:opacity-90 disabled:opacity-40">{busy ? 'Working…' : '↻ Reassign all'}</button>
        </div>
      </header>

      {msg && <div className="px-5 py-2 text-[11px] text-[#062B0A] bg-[#62A758]/15 border-b border-[#E8E4DF]">{msg}</div>}

      <div className="divide-y divide-[#F5F5F5]">
        {SEGMENTS.map(def => {
          const count = distribution[def.key] || 0
          const pct = total > 0 ? (count / total) * 100 : 0
          return (
            <div key={def.key} className="flex items-start gap-4 px-5 py-3 hover:bg-[#FFFDFA]">
              <div className="shrink-0 mt-0.5">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: def.color + '22', color: def.color, border: `1px solid ${def.color}40` }}
                >
                  {def.emoji} {def.label}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-[#333333]"><strong>Sales angle:</strong> {def.salesHypothesis}</p>
                <p className="text-[10px] text-[#9C9C9C] mt-0.5">Priority {def.priority} · key <code className="bg-[#F5F5F5] px-1 rounded">{def.key}</code></p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-base font-black tabular-nums" style={{ color: def.color }}>{count.toLocaleString()}</div>
                <div className="text-[10px] text-[#9C9C9C] tabular-nums">{pct.toFixed(1)}%</div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
