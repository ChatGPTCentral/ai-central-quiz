'use client'

import { useEffect, useState, useCallback } from 'react'

interface Preview {
  total: number
  withLinkedin: number
  missingLinkedin: number
  previouslyFailed: number
  reEnrichTargets: number
  hitRatePct: number
}

interface BatchResult {
  email: string
  status: string
  linkedinUrl?: string
  providersTried: string[]
  fromCache: boolean
}

export default function EnrichPage() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [running, setRunning] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const [batchSize, setBatchSize] = useState(25)
  const [log, setLog] = useState<BatchResult[]>([])
  const [error, setError] = useState('')

  const loadPreview = useCallback(async () => {
    setError('')
    try {
      const res = await fetch('/api/admin/enrich/preview')
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Preview failed')
      else setPreview(data)
    } catch {
      setError('Network error')
    }
  }, [])

  useEffect(() => { loadPreview() }, [loadPreview])

  const runBatch = useCallback(async () => {
    setRunning(true); setError('')
    try {
      const res = await fetch('/api/admin/enrich/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: batchSize }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Batch failed')
      } else {
        setLog(prev => [...data.results, ...prev].slice(0, 200))
        await loadPreview()
      }
    } catch {
      setError('Network error')
    } finally {
      setRunning(false)
    }
  }, [batchSize, loadPreview])

  // Auto-loop: when autoMode is on, kick the next batch as soon as the previous one returns
  useEffect(() => {
    if (!autoMode || running) return
    if (preview && preview.reEnrichTargets > 0) {
      runBatch()
    } else {
      setAutoMode(false)
    }
  }, [autoMode, running, preview, runBatch])

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-black text-black mb-1">Re-enrich</h1>
      <p className="text-sm text-gray-500 mb-6">Run the provider waterfall (Apollo → Databar → Wiza) on rows missing a LinkedIn URL.</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{error}</div>
      )}

      {preview && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total rows" value={preview.total} />
            <StatCard label="With LinkedIn" value={preview.withLinkedin} suffix={`${preview.hitRatePct}%`} />
            <StatCard label="Missing LinkedIn" value={preview.missingLinkedin} accent />
            <StatCard label="Previously failed" value={preview.previouslyFailed} />
          </div>

          {/* Actions */}
          <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6">
            <h2 className="text-base font-black text-black mb-1">Re-enrich incomplete rows</h2>
            <p className="text-sm text-gray-500 mb-4">
              {preview.reEnrichTargets.toLocaleString()} rows have no LinkedIn URL.
              Cache hits (re-runs within 60 days) cost nothing.
            </p>

            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm text-gray-700">Batch size:</label>
              <select
                value={batchSize}
                onChange={e => setBatchSize(parseInt(e.target.value, 10))}
                disabled={running}
                className="px-3 py-1.5 border border-[#E0E0E0] rounded-md text-sm bg-white disabled:opacity-50"
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={runBatch}
                disabled={running || preview.reEnrichTargets === 0}
                className="px-5 py-2.5 rounded-lg bg-black text-white text-sm font-bold disabled:opacity-40 hover:bg-[#222]"
              >
                {running ? 'Running…' : `Re-enrich next ${batchSize}`}
              </button>
              <button
                onClick={() => setAutoMode(m => !m)}
                disabled={running && !autoMode}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                  autoMode ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white border-2 border-black text-black hover:bg-gray-50'
                }`}
              >
                {autoMode ? 'Stop auto-loop' : 'Re-enrich all (auto-loop)'}
              </button>
              <button
                onClick={loadPreview}
                disabled={running}
                className="px-4 py-2.5 rounded-lg bg-white border border-[#E0E0E0] text-sm font-medium hover:bg-gray-50 disabled:opacity-40"
              >
                Refresh
              </button>
            </div>

            {autoMode && (
              <p className="text-xs text-gray-500 mt-3">
                Auto-loop running — will fire batches of {batchSize} until no rows remain. Stop anytime.
              </p>
            )}
          </div>

          {/* Log */}
          {log.length > 0 && (
            <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 px-5 pt-5 mb-3">Recent results ({log.length})</h2>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {log.map((r, i) => (
                      <tr key={i} className="border-b border-[#F0F0F0]">
                        <td className="px-5 py-2 text-gray-700 text-[13px] truncate max-w-[280px]">{r.email}</td>
                        <td className="px-3 py-2">
                          <StatusPill status={r.status} cached={r.fromCache} />
                        </td>
                        <td className="px-3 py-2 text-[11px] text-gray-400">{r.providersTried.join(' → ')}</td>
                        <td className="px-5 py-2 text-right">
                          {r.linkedinUrl ? (
                            <a href={r.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-[#0A66C2] text-xs font-bold hover:underline">in</a>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, suffix, accent }: { label: string; value: number; suffix?: string; accent?: boolean }) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${accent ? 'border-black' : 'border-[#E0E0E0]'}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-black text-black tabular-nums">
        {value.toLocaleString()}
        {suffix && <span className="text-sm text-gray-400 ml-2 font-medium">{suffix}</span>}
      </p>
    </div>
  )
}

function StatusPill({ status, cached }: { status: string; cached: boolean }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    complete:               { bg: '#E0F5E0', fg: '#1F6B1F', label: 'complete' },
    partial:                { bg: '#FFF5DC', fg: '#8A6500', label: 'partial' },
    failed:                 { bg: '#FEE3E3', fg: '#A02020', label: 'failed' },
    error:                  { bg: '#FEE3E3', fg: '#A02020', label: 'error' },
    skipped_invalid_email:  { bg: '#F0F0F0', fg: '#666',   label: 'skipped' },
  }
  const cfg = map[status] || { bg: '#F0F0F0', fg: '#666', label: status }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: cfg.bg, color: cfg.fg }}>
      {cfg.label}
      {cached && <span className="text-[9px] opacity-60">· cached</span>}
    </span>
  )
}
