'use client'

import { useCallback, useEffect, useState } from 'react'

// Owner review UI for the enrichment overhaul: stored enrichment (today) vs
// the NEW verified Google-first resolver, side by side. The "Run" button
// drives the batches (each spends API credits), so clicking it IS the spend
// approval. Target 30 records, Gmail signups first (the problem set).

interface Fields {
  linkedinUrl?: string | null; companyName?: string | null; jobTitle?: string | null
  country?: string | null; seniority?: string | null
  confidence?: number | null; reasoning?: string | null; outcome?: string | null; status?: string | null
}
interface Row { id: string; submission_id: string; name: string | null; email: string | null; current: Fields; proposed: Fields }

const TARGET = 30
const BATCH = 5

function Cell({ label, cur, prop }: { label: string; cur?: string | null; prop?: string | null }) {
  const changed = (cur || '') !== (prop || '') && !!(cur || prop)
  return (
    <tr style={{ borderBottom: '1px solid #F4F0E9' }}>
      <td style={{ padding: '4px 10px 4px 0', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9C9C9C', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{label}</td>
      <td style={{ padding: '4px 10px', fontSize: 12.5, color: cur ? '#333' : '#C4BDB2', verticalAlign: 'top', maxWidth: 220, wordBreak: 'break-word' }}>{cur || '—'}</td>
      <td style={{ padding: '4px 0 4px 10px', fontSize: 12.5, fontWeight: changed ? 700 : 400, color: prop ? (changed ? '#0F8A6D' : '#333') : '#C4BDB2', verticalAlign: 'top', maxWidth: 220, wordBreak: 'break-word' }}>{prop || '—'}</td>
    </tr>
  )
}

const OUTCOME_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  matched: { bg: '#E8F5E9', fg: '#2E7D32', label: 'matched' },
  rejected: { bg: '#FFF3E0', fg: '#E65100', label: 'unresolved (low confidence)' },
  no_results: { bg: '#F5F5F5', fg: '#9C9C9C', label: 'no results' },
  error: { bg: '#FDECEA', fg: '#B3261E', label: 'error' },
  unconfigured: { bg: '#F5F5F5', fg: '#9C9C9C', label: 'no name to search' },
}

export default function EnrichCompare() {
  const [runId, setRunId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const load = useCallback(async (rid: string) => {
    const res = await fetch(`/api/admin/enrich/compare?runId=${rid}`)
    const body = await res.json().catch(() => ({}))
    if (Array.isArray(body.rows)) { setRows(body.rows); setProgress(body.rows.length) }
  }, [])

  // On mount, surface the most recent run so a refresh doesn't lose it.
  useEffect(() => {
    fetch('/api/admin/enrich/compare').then(r => r.json()).then(b => {
      if (b.latestRunId) { setRunId(b.latestRunId); load(b.latestRunId) }
    }).catch(() => {})
  }, [load])

  const run = async (freshRun: boolean) => {
    setRunning(true); setError(null)
    let rid = freshRun ? null : runId
    if (freshRun) { setRows([]); setProgress(0) }
    try {
      for (let i = 0; i < Math.ceil(TARGET / BATCH) + 2; i++) {
        const res = await fetch('/api/admin/enrich/compare', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: rid || undefined, limit: BATCH, target: TARGET, onlyGmail: true }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        rid = body.runId; setRunId(rid)
        await load(rid!)
        if (body.finished) break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <button onClick={() => run(true)} disabled={running}
          className="rounded-lg bg-[#333333] px-5 py-2.5 text-sm font-bold text-[#FFFDFA] disabled:opacity-50">
          {running ? `Running… ${progress}/${TARGET}` : `Run comparison · ${TARGET} Gmail records`}
        </button>
        {runId && !running && rows.length > 0 && rows.length < TARGET && (
          <button onClick={() => run(false)} className="rounded-lg border border-[#E8E4DF] px-4 py-2.5 text-sm font-bold text-[#333]">Continue</button>
        )}
        <span className="text-[11.5px] text-[#9C9C9C]">
          Fresh enrichment of {TARGET} records: Apify (Google search + profile) + up to ~{TARGET} Apollo credits (1/record, Wiza skipped) + small LLM calls. Clicking Run authorizes that spend. The left column is what&rsquo;s already stored (free).
        </span>
      </div>
      {running && (
        <div className="mb-4 h-1.5 w-full rounded bg-[#EFEAE1] overflow-hidden">
          <div className="h-full bg-[#0F8A6D] transition-all" style={{ width: `${Math.round((progress / TARGET) * 100)}%` }} />
        </div>
      )}
      {error && <p className="mb-4 text-sm font-semibold text-[#BE3B3B]">Error: {error}</p>}

      {rows.length === 0 && !running && <p className="text-sm text-[#9C9C9C]">No comparison yet. Hit Run to enrich 30 Gmail-signup records with the new resolver and see them against what&rsquo;s stored today.</p>}

      <div className="flex flex-col gap-4">
        {rows.map(r => {
          const oc = OUTCOME_STYLE[r.proposed.outcome || ''] || OUTCOME_STYLE.no_results
          return (
            <section key={r.id} className="rounded-xl border border-[#E8E4DF] bg-white p-4">
              <div className="flex items-center gap-2.5 flex-wrap mb-2">
                <span className="text-[13.5px] font-bold text-[#1A1A1A]">{r.name || '(no name)'}</span>
                <span className="text-[11.5px] text-[#9C9C9C]">{r.email}</span>
                <span className="ml-auto rounded-full px-2.5 py-0.5 text-[10.5px] font-bold" style={{ backgroundColor: oc.bg, color: oc.fg }}>{oc.label}</span>
                {typeof r.proposed.confidence === 'number' && (
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: r.proposed.confidence >= 0.7 ? '#0F8A6D' : '#E65100' }}>conf {r.proposed.confidence.toFixed(2)}</span>
                )}
              </div>
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th />
                    <th className="text-left" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9C9C9C', padding: '0 10px 4px 0' }}>Stored today</th>
                    <th className="text-left" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0F8A6D', padding: '0 0 4px 10px' }}>New resolver</th>
                  </tr>
                </thead>
                <tbody>
                  <Cell label="LinkedIn" cur={r.current.linkedinUrl} prop={r.proposed.linkedinUrl} />
                  <Cell label="Company" cur={r.current.companyName} prop={r.proposed.companyName} />
                  <Cell label="Title" cur={r.current.jobTitle} prop={r.proposed.jobTitle} />
                  <Cell label="Country" cur={r.current.country} prop={r.proposed.country} />
                  <Cell label="Seniority" cur={r.current.seniority} prop={r.proposed.seniority} />
                </tbody>
              </table>
              {r.proposed.reasoning && <p className="mt-2 text-[11.5px] italic text-[#6B6B6B]">{r.proposed.reasoning}</p>}
            </section>
          )
        })}
      </div>
    </div>
  )
}
