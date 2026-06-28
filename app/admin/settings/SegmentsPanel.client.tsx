'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { STAGES, PERSONAS } from '@/lib/segmentation-v2'

interface Props {
  /** key → count for stage column (server-computed across ALL active rows) */
  stageDist: Record<string, number>
  /** key → count for persona column */
  personaDist: Record<string, number>
  total: number
}

function DistRow({ emoji, label, color, count, pct }: { emoji: string; label: string; color: string; count: number; pct: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center gap-1 text-[12px] font-bold min-w-[150px]" style={{ color }}>{emoji} {label}</span>
      <div className="flex-1 h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] tabular-nums text-[#9C9C9C] w-24 text-right">{count.toLocaleString()} ({pct.toFixed(1)}%)</span>
    </div>
  )
}

export default function SegmentsPanel({ stageDist, personaDist, total }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')

  async function reassign(dryRun: boolean) {
    if (!dryRun && !confirm('Re-run the Stage + Persona classifier on every CRM row?\n\nDeterministic + idempotent — only rows whose classification changed get written. Takes ~1-2 min for ~2.8k rows.')) return
    setBusy(true); setMsg('')
    try {
      // Loop until hasMore=false (the endpoint chunks at 5000 rows).
      let totalScanned = 0, totalUpdated = 0
      for (let pass = 0; pass < 10; pass++) {
        const res = await fetch('/api/admin/stages/reassign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun, limit: 5000 }),
        })
        const data = await res.json()
        if (!res.ok) { setMsg(`✕ ${data.error || 'failed'}`); return }
        totalScanned += data.scanned ?? 0
        totalUpdated += data.updated ?? 0
        setMsg(`${dryRun ? 'Dry-run' : 'Reassigned'} pass ${pass + 1}: scanned ${data.scanned}, updated ${data.updated} · cum ${totalScanned}/${totalUpdated}`)
        if (!data.hasMore) break
      }
      if (!dryRun) router.refresh()
    } catch (e) {
      setMsg(`✕ ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const unStage = stageDist['(unclassified)'] || 0
  const unPersona = personaDist['(unclassified)'] || 0
  const pctOf = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden mt-6">
      <header className="px-5 py-4 border-b border-[#E8E4DF] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-black text-[#333333]">Stage + Persona classification</h2>
          <p className="text-[11px] text-[#9C9C9C] mt-0.5">
            The canonical segmentation — every row gets one ladder <strong>stage</strong> + one role <strong>persona</strong>. Edit <code className="bg-[#F5F5F5] px-1 rounded">lib/segmentation-v2.ts</code> to refine, then reassign. Counts span all {total.toLocaleString()} active rows.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => reassign(true)} disabled={busy} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-white border border-[#E8E4DF] text-[#333333] hover:bg-[#FEF7E7] disabled:opacity-40">👁 Dry run</button>
          <button onClick={() => reassign(false)} disabled={busy} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-[#333333] text-[#FFFDFA] hover:opacity-90 disabled:opacity-40">{busy ? 'Working…' : '↻ Reassign all'}</button>
        </div>
      </header>

      {msg && <div className="px-5 py-2 text-[11px] text-[#062B0A] bg-[#62A758]/15 border-b border-[#E8E4DF]">{msg}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#F5F5F5]">
        <div className="p-5 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9C9C] mb-3">📈 Stage (AI adoption ladder)</p>
          {STAGES.map(def => (
            <DistRow key={def.key} emoji={def.emoji} label={def.label} color={def.color} count={stageDist[def.key] || 0} pct={pctOf(stageDist[def.key] || 0)} />
          ))}
          {unStage > 0 && <DistRow emoji="·" label="(unclassified)" color="#9C9C9C" count={unStage} pct={pctOf(unStage)} />}
        </div>
        <div className="p-5 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#9C9C9C] mb-3">👤 Persona (role)</p>
          {PERSONAS.map(def => (
            <DistRow key={def.key} emoji={def.emoji} label={def.label} color={def.color} count={personaDist[def.key] || 0} pct={pctOf(personaDist[def.key] || 0)} />
          ))}
          {unPersona > 0 && <DistRow emoji="·" label="(unclassified)" color="#9C9C9C" count={unPersona} pct={pctOf(unPersona)} />}
        </div>
      </div>
    </section>
  )
}
