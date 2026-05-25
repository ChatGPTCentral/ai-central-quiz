'use client'

import { useEffect, useState } from 'react'

interface Trace {
  email: string
  archetype: string | null
  reason: string
  answers: Record<string, string | null>
  steps: Array<{ rule: string; matched: boolean; detail?: string }>
}

interface RecentRow { id: string; email: string; archetype: string | null }

export default function ArchetypeTrace() {
  const [identifier, setIdentifier] = useState('')
  const [trace, setTrace] = useState<Trace | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})

  // Pull a small "recent submissions" list + archetype distribution to
  // give the observability page some live context.
  useEffect(() => {
    fetch('/api/admin/flow/recent').then(r => r.json()).then(d => {
      if (d.recent) setRecent(d.recent)
      if (d.stats) setStats(d.stats)
    }).catch(() => {})
  }, [])

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    if (!identifier.trim()) return
    setLoading(true); setError(''); setTrace(null)
    try {
      const res = await fetch(`/api/admin/flow/trace?id=${encodeURIComponent(identifier.trim())}`)
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Trace failed')
      else setTrace(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-6 space-y-4">
      {/* Aggregate stats: how many rows landed in each archetype */}
      {Object.keys(stats).length > 0 && (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <h2 className="text-sm font-black text-black mb-1">Distribution across archetypes</h2>
          <p className="text-xs text-gray-500 mb-3">Live count of how many submissions ended up in each bucket.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(stats).map(([k, n]) => (
              <div key={k} className="bg-[#FFFDFA] border border-[#E0E0E0] rounded-md p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{k}</p>
                <p className="text-xl font-black text-black tabular-nums">{n}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <h2 className="text-sm font-black text-black mb-1">Archetype trace</h2>
        <p className="text-xs text-gray-500 mb-4">
          Paste a row UUID or email to see EXACTLY which condition mapped that submission to its archetype.
        </p>

        {recent.length > 0 && !trace && (
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Recent classifications</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setIdentifier(r.email); setTimeout(() => run(), 0) }}
                  className="px-2 py-1 rounded-md bg-[#FFFDFA] border border-[#E0E0E0] hover:bg-[#FEF7E7] text-[11px]"
                  title={`${r.email} → ${r.archetype || '(none)'}`}
                >
                  {r.email.split('@')[0]}{' '}
                  <span className="text-gray-400">→</span>{' '}
                  <span className="font-medium">{r.archetype || '—'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

      <form onSubmit={run} className="flex gap-2 mb-4">
        <input
          type="text"
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
          placeholder="row id or email"
          className="flex-1 px-3 py-2 border border-[#E0E0E0] rounded-md text-sm outline-none focus:border-black"
        />
        <button
          type="submit"
          disabled={loading || !identifier.trim()}
          className="px-4 py-2 rounded-md bg-black text-white text-xs font-bold uppercase tracking-wider disabled:opacity-40"
        >
          {loading ? 'Tracing…' : 'Trace'}
        </button>
      </form>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {trace && (
        <div className="space-y-3">
          {/* Verdict */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Result:</span>
            <span className="font-bold text-black">{trace.archetype || '(no archetype)'}</span>
            <span className="text-xs text-gray-400 ml-auto">{trace.email}</span>
          </div>
          <p className="text-[11px] text-gray-600 bg-[#FAFAFA] border border-[#F0F0F0] rounded p-2">{trace.reason}</p>

          {/* Rule ladder */}
          <div className="border border-[#E0E0E0] rounded-md overflow-hidden">
            <div className="px-3 py-2 bg-[#FAFAFA] border-b border-[#E0E0E0]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Rule evaluation (top-down)</p>
            </div>
            <div className="divide-y divide-[#F0F0F0]">
              {trace.steps.map((s, i) => (
                <div key={i} className={`flex items-start gap-2 px-3 py-2 text-xs ${s.matched ? 'bg-[#E0F5E0]' : ''}`}>
                  <span className={`shrink-0 mt-0.5 ${s.matched ? 'text-green-700' : 'text-gray-300'}`}>
                    {s.matched ? '✓' : '·'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={s.matched ? 'font-bold text-green-900' : 'text-gray-700'}>{s.rule}</p>
                    {s.detail && <p className="text-[10px] text-gray-500 mt-0.5">{s.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* The 5 inputs the function read */}
          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500">View the 5 quiz fields the function used</summary>
            <table className="w-full mt-2 text-[11px]">
              <tbody>
                {Object.entries(trace.answers).map(([k, v]) => (
                  <tr key={k} className="border-b border-[#F0F0F0]">
                    <td className="py-1 pr-3 text-gray-400 font-medium uppercase tracking-wider text-[9px]">{k}</td>
                    <td className="py-1 text-gray-800">{v || <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
      </div>
    </div>
  )
}
