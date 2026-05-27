'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { STAGES, PERSONAS, stageDef, personaDef, type StageKey, type PersonaKey } from '@/lib/segmentation-v2'

interface RowSlice {
  stage: string | null
  persona: string | null
  segment: string | null
  lifetime_value_usd: number | string | null
  beehiiv_status: string | null
}

interface Props {
  rows: RowSlice[]
}

export default function SandboxPanel({ rows }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const total = rows.length
  const staged = rows.filter(r => r.stage).length

  // Stage distribution (in canonical S0→S5 order, unknown last)
  const stageDist = useMemo(() => {
    const d: Record<string, number> = {}
    for (const r of rows) {
      const k = r.stage || 'unknown'
      d[k] = (d[k] || 0) + 1
    }
    return d
  }, [rows])

  // Persona distribution
  const personaDist = useMemo(() => {
    const d: Record<string, number> = {}
    for (const r of rows) {
      const k = r.persona || 'unknown'
      d[k] = (d[k] || 0) + 1
    }
    return d
  }, [rows])

  // Stage × Persona cross-tab — { [stage]: { [persona]: count } }
  const crossTab = useMemo(() => {
    const x: Record<string, Record<string, number>> = {}
    for (const r of rows) {
      const s = r.stage || 'unknown'
      const p = r.persona || 'unknown'
      x[s] = x[s] || {}
      x[s][p] = (x[s][p] || 0) + 1
    }
    return x
  }, [rows])

  // Stage × Revenue (the analytical payoff)
  const stageRevenue = useMemo(() => {
    const m: Record<string, { n: number; paying: number; revenue: number; active: number }> = {}
    for (const r of rows) {
      const k = r.stage || 'unknown'
      m[k] = m[k] || { n: 0, paying: 0, revenue: 0, active: 0 }
      m[k].n += 1
      const ltv = r.lifetime_value_usd != null ? Number(r.lifetime_value_usd) : 0
      if (ltv > 0) {
        m[k].paying += 1
        m[k].revenue += ltv
      }
      if (r.beehiiv_status === 'active') m[k].active += 1
    }
    return m
  }, [rows])

  async function reassign(dryRun: boolean) {
    if (!dryRun && !confirm('Re-run the v2 classifier on every CRM row?\n\nWrites to stage / persona / staged_at - - the production `segment` columns are untouched. Takes ~1-2 min.')) return
    setBusy(true); setMsg('')
    try {
      let totalScanned = 0, totalUpdated = 0
      for (let pass = 0; pass < 10; pass++) {
        const res = await fetch('/api/admin/sandbox/stage-reassign', {
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

  const stageOrder: StageKey[] = ['S0_unaware', 'S1_curious', 'S2_experimenter', 'S3_practitioner', 'S4_power_user', 'S5_builder', 'unknown']
  const personaOrder: PersonaKey[] = ['decision_maker', 'operator', 'maker', 'learner', 'unknown']

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <section className="bg-white border border-[#E8E4DF] rounded-xl px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] text-[#9C9C9C]">
            Total rows: <strong className="text-[#333333]">{total.toLocaleString()}</strong> ·{' '}
            Staged: <strong className="text-[#333333]">{staged.toLocaleString()}</strong> ({total ? Math.round((staged/total)*100) : 0}%)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => reassign(true)} disabled={busy} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-white border border-[#E8E4DF] text-[#333333] hover:bg-[#FEF7E7] disabled:opacity-40">👁 Dry run</button>
          <button onClick={() => reassign(false)} disabled={busy} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-[#E48715] text-[#FFFDFA] hover:opacity-90 disabled:opacity-40">{busy ? 'Working…' : '↻ Reassign v2'}</button>
        </div>
      </section>

      {msg && <div className="px-5 py-2 text-[11px] text-[#062B0A] bg-[#62A758]/15 border border-[#62A758]/40 rounded">{msg}</div>}

      {/* Stage ladder distribution */}
      <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
        <header className="px-5 py-3 border-b border-[#E8E4DF]">
          <h2 className="text-base font-black text-[#333333]">Stage ladder · distribution</h2>
          <p className="text-[11px] text-[#9C9C9C] mt-0.5">The AI-adoption journey - - rows flow UP this ladder over time</p>
        </header>
        <div className="divide-y divide-[#F5F5F5]">
          {stageOrder.map(key => {
            const def = stageDef(key)
            if (!def) return null
            const n = stageDist[key] || 0
            const pct = total > 0 ? (n / total) * 100 : 0
            return (
              <div key={key} className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-xl shrink-0">{def.emoji}</span>
                <div className="w-44 shrink-0">
                  <div className="text-[12px] font-bold text-[#333333]">{def.label}</div>
                  <div className="text-[10px] text-[#9C9C9C]">{def.key}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-[#F5F5F5] rounded relative overflow-hidden">
                    <div className="h-full rounded transition-all" style={{ width: `${pct}%`, backgroundColor: def.color }} />
                  </div>
                  <div className="text-[10px] text-[#9C9C9C] mt-1 truncate">{def.salesHook}</div>
                </div>
                <div className="shrink-0 text-right w-24">
                  <div className="text-sm font-black tabular-nums" style={{ color: def.color }}>{n.toLocaleString()}</div>
                  <div className="text-[10px] text-[#9C9C9C] tabular-nums">{pct.toFixed(1)}%</div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Stage × Persona cross-tab */}
      <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
        <header className="px-5 py-3 border-b border-[#E8E4DF]">
          <h2 className="text-base font-black text-[#333333]">Stage × Persona</h2>
          <p className="text-[11px] text-[#9C9C9C] mt-0.5">Where each persona sits on the ladder · darker cells = bigger cohorts</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-[#FFFDFA] border-b border-[#E8E4DF]">
                <th className="text-left px-3 py-2 font-bold text-[#9C9C9C] uppercase tracking-wider text-[10px]">Stage \ Persona</th>
                {personaOrder.map(p => {
                  const def = personaDef(p)
                  return (
                    <th key={p} className="text-center px-3 py-2 font-bold text-[10px] uppercase tracking-wider" style={{ color: def?.color || '#9C9C9C' }}>
                      {def?.emoji} {def?.label || p}
                    </th>
                  )
                })}
                <th className="text-right px-3 py-2 font-bold text-[#9C9C9C] uppercase tracking-wider text-[10px]">Σ</th>
              </tr>
            </thead>
            <tbody>
              {stageOrder.map(s => {
                const sDef = stageDef(s)
                const row = crossTab[s] || {}
                const rowSum = Object.values(row).reduce((a, b) => a + b, 0)
                return (
                  <tr key={s} className="border-b border-[#F5F5F5] hover:bg-[#FFFDFA]">
                    <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: sDef?.color }}>
                      {sDef?.emoji} {sDef?.label || s}
                    </td>
                    {personaOrder.map(p => {
                      const n = row[p] || 0
                      const intensity = total > 0 ? Math.min((n / total) * 8, 1) : 0
                      const pDef = personaDef(p)
                      return (
                        <td key={p} className="text-center px-3 py-2 tabular-nums" style={{ backgroundColor: pDef ? `${pDef.color}${Math.floor(intensity * 60).toString(16).padStart(2, '0')}` : undefined }}>
                          {n > 0 ? n.toLocaleString() : <span className="text-[#E8E4DF]">·</span>}
                        </td>
                      )
                    })}
                    <td className="text-right px-3 py-2 font-bold tabular-nums">{rowSum.toLocaleString()}</td>
                  </tr>
                )
              })}
              <tr className="bg-[#FFFDFA] font-bold">
                <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-[#9C9C9C]">Σ</td>
                {personaOrder.map(p => (
                  <td key={p} className="text-center px-3 py-2 tabular-nums">{(personaDist[p] || 0).toLocaleString()}</td>
                ))}
                <td className="text-right px-3 py-2 tabular-nums">{total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Stage × Revenue (the analytical payoff) */}
      <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
        <header className="px-5 py-3 border-b border-[#E8E4DF]">
          <h2 className="text-base font-black text-[#333333]">Stage × Revenue</h2>
          <p className="text-[11px] text-[#9C9C9C] mt-0.5">Which stage actually converts? Money sits HERE - - never in the segment definition.</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-[#FFFDFA] border-b border-[#E8E4DF]">
                <th className="text-left px-3 py-2 font-bold text-[#9C9C9C] uppercase tracking-wider text-[10px]">Stage</th>
                <th className="text-right px-3 py-2 font-bold text-[#9C9C9C] uppercase tracking-wider text-[10px]">N</th>
                <th className="text-right px-3 py-2 font-bold text-[#9C9C9C] uppercase tracking-wider text-[10px]">Paying</th>
                <th className="text-right px-3 py-2 font-bold text-[#9C9C9C] uppercase tracking-wider text-[10px]">Conv %</th>
                <th className="text-right px-3 py-2 font-bold text-[#9C9C9C] uppercase tracking-wider text-[10px]">Active 📧</th>
                <th className="text-right px-3 py-2 font-bold text-[#9C9C9C] uppercase tracking-wider text-[10px]">Revenue</th>
                <th className="text-right px-3 py-2 font-bold text-[#9C9C9C] uppercase tracking-wider text-[10px]">ARPU</th>
              </tr>
            </thead>
            <tbody>
              {stageOrder.map(s => {
                const sDef = stageDef(s)
                const m = stageRevenue[s] || { n: 0, paying: 0, revenue: 0, active: 0 }
                if (m.n === 0) return null
                const conv = m.n > 0 ? (m.paying / m.n) * 100 : 0
                const arpu = m.n > 0 ? m.revenue / m.n : 0
                return (
                  <tr key={s} className="border-b border-[#F5F5F5] hover:bg-[#FFFDFA]">
                    <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: sDef?.color }}>
                      {sDef?.emoji} {sDef?.label || s}
                    </td>
                    <td className="text-right px-3 py-2 tabular-nums">{m.n.toLocaleString()}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{m.paying.toLocaleString()}</td>
                    <td className="text-right px-3 py-2 tabular-nums font-bold" style={{ color: conv > 5 ? '#2D6A26' : '#9C9C9C' }}>{conv.toFixed(1)}%</td>
                    <td className="text-right px-3 py-2 tabular-nums">{m.active.toLocaleString()}</td>
                    <td className="text-right px-3 py-2 tabular-nums">${m.revenue.toFixed(0)}</td>
                    <td className="text-right px-3 py-2 tabular-nums">${arpu.toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Persona breakdown */}
      <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
        <header className="px-5 py-3 border-b border-[#E8E4DF]">
          <h2 className="text-base font-black text-[#333333]">Persona facet</h2>
          <p className="text-[11px] text-[#9C9C9C] mt-0.5">Mostly fixed - - role context, independent of AI maturity</p>
        </header>
        <div className="divide-y divide-[#F5F5F5]">
          {PERSONAS.map(def => {
            const n = personaDist[def.key] || 0
            const pct = total > 0 ? (n / total) * 100 : 0
            return (
              <div key={def.key} className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-xl shrink-0">{def.emoji}</span>
                <div className="w-44 shrink-0">
                  <div className="text-[12px] font-bold text-[#333333]">{def.label}</div>
                  <div className="text-[10px] text-[#9C9C9C]">{def.key}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-[#F5F5F5] rounded relative overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: def.color }} />
                  </div>
                  <div className="text-[10px] text-[#9C9C9C] mt-1 truncate">{def.description}</div>
                </div>
                <div className="shrink-0 text-right w-24">
                  <div className="text-sm font-black tabular-nums" style={{ color: def.color }}>{n.toLocaleString()}</div>
                  <div className="text-[10px] text-[#9C9C9C] tabular-nums">{pct.toFixed(1)}%</div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
