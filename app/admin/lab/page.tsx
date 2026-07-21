'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Status = 'skipped' | 'ok' | 'miss' | 'error'

interface Stage {
  name: 'name_from_email' | 'google_search' | 'linkedin_scrape' | 'apollo' | 'photo_ai_demographics' | 'beehiiv_lookup' | 'stripe_lookup'
  status: Status
  result?: unknown
  reason?: string
}

interface V2Result {
  email: string
  rowId?: string | null
  saved?: boolean
  stages: Stage[]
  merged: Record<string, unknown> & { sources?: Record<string, string>; providersTried?: string[] }
  raw: Record<string, unknown>
  providersTried: string[]
  status: 'complete' | 'partial' | 'failed'
}

const STAGE_LABEL: Record<Stage['name'], string> = {
  name_from_email:         '1 · Name from email',
  google_search:           '2 · Google → LinkedIn URL discovery',
  linkedin_scrape:         '3 · LinkedIn profile scrape (Apify)',
  apollo:                  '4 · Apollo person match',
  photo_ai_demographics:   '6 · Claude vision · age + sex from photo',
  beehiiv_lookup:          '7 · Beehiiv subscriber lookup',
  stripe_lookup:           '8 · Stripe customer lookup',
}

const STATUS_COLOR: Record<Status, { bg: string; fg: string; label: string }> = {
  ok:      { bg: '#62A75833', fg: '#1F6B1F', label: 'ok' },
  miss:    { bg: '#E7B02F33', fg: '#8A6500', label: 'miss' },
  error:   { bg: '#BE3B3B33', fg: '#A02020', label: 'error' },
  skipped: { bg: '#9C9C9C22', fg: '#9C9C9C', label: 'skipped' },
}

export default function LabPage() {
  return (
    <Suspense>
      <LabPageInner />
    </Suspense>
  )
}

function LabPageInner() {
  const searchParams = useSearchParams()
  const [identifier, setIdentifier] = useState('')
  const [running, setRunning] = useState(false)
  const [save, setSave] = useState(false)
  const [result, setResult] = useState<V2Result | null>(null)
  const [error, setError] = useState('')

  // Handoff from other admin pages (e.g. Debug lookup): /admin/lab?email=…
  useEffect(() => {
    const e = searchParams.get('email')
    if (e) setIdentifier(e)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run() {
    if (!identifier.trim()) return
    setRunning(true); setError(''); setResult(null)
    const body: Record<string, unknown> = { save }
    // Detect UUID vs email
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier.trim())) {
      body.id = identifier.trim()
    } else {
      body.email = identifier.trim()
    }
    try {
      const res = await fetch('/api/admin/enrich/v2/row', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Pipeline failed')
      else setResult(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <header style={{ padding: '26px 36px 18px' }}>
        <div className="flex items-baseline justify-between flex-wrap" style={{ gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Tools · run the live pipeline</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Enrichment lab</h1>
          </div>
          <div className="flex items-center gap-4 text-[11.5px] font-bold">
            <a href="/admin/enrich-inspect" className="text-[#046BB1] hover:underline">Deep inspector (current vs verified) →</a>
            <a href="/admin/enrich-game" className="text-[#046BB1] hover:underline">Enrich tuner →</a>
          </div>
        </div>
        <p className="text-sm text-[#9C9C9C] mt-1.5">
          Test the v2 pipeline on any submission (or any email) without touching the live data.
          Stages run in order: <strong>name from email → Google → LinkedIn scrape → Apollo → AI vision → Beehiiv → Stripe</strong>.
          Toggle <strong>Save</strong> to write merged results + run the Stage + Persona classifier on the row.
        </p>
      </header>

      <div className="p-8 pt-1 max-w-5xl">
      <div className="flex gap-2 items-end mb-6">
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] block mb-1">Email or row UUID</label>
          <input
            type="text"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') run() }}
            placeholder="alex@company.com  or  88c733bf-…"
            className="w-full px-3 py-2 border border-[#E8E4DF] rounded-md text-sm outline-none focus:border-[#333333]"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[#333333] px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={save} onChange={e => setSave(e.target.checked)} className="accent-[#333333]" />
          Save to row
        </label>
        <button
          onClick={run}
          disabled={running || !identifier.trim()}
          className="px-5 py-2 rounded-md bg-[#333333] text-[#FFFDFA] text-sm font-bold disabled:opacity-40 hover:opacity-90"
        >
          {running ? 'Running…' : 'Run v2'}
        </button>
      </div>

      {error && (
        <div className="bg-[#BE3B3B11] border border-[#BE3B3B33] text-[#A02020] rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {result && (
        <>
          {/* Top summary */}
          <div className="bg-white border border-[#E8E4DF] rounded-xl p-4 mb-5 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {(() => {
                const photo = result.merged.photoUrl as string | undefined
                return photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" referrerPolicy="no-referrer"
                    className="w-14 h-14 rounded-full object-cover bg-[#F5F5F5] border border-[#E8E4DF]" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#F5F5F5] border border-[#E8E4DF] flex items-center justify-center text-[#9C9C9C] text-xl font-black">?</div>
                )
              })()}
              <div>
                <p className="text-sm font-bold text-[#333333]">{(result.merged.fullName as string) || result.email}</p>
                <p className="text-[11px] text-[#9C9C9C]">{result.email}</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs">
              <StatusPill status={result.status === 'failed' ? 'error' : result.status === 'partial' ? 'miss' : 'ok'} label={result.status} />
              {result.saved && <span className="text-[#62A758] font-bold text-xs">✓ saved</span>}
              {result.rowId && (
                <a href={`/admin/submissions/${result.rowId}`} className="text-[#046BB1] hover:underline text-xs">view row →</a>
              )}
            </div>
          </div>

          {/* Stages */}
          <div className="space-y-3 mb-6">
            {result.stages.map((s, i) => (
              <details key={i} className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
                <summary className="cursor-pointer px-4 py-3 flex items-center gap-3 hover:bg-[#FFFDFA]">
                  <span className="text-xs font-bold text-[#333333]">{STAGE_LABEL[s.name]}</span>
                  <StatusPill status={s.status} label={s.status} />
                  {s.reason && <span className="text-[11px] text-[#9C9C9C]">{s.reason}</span>}
                </summary>
                <pre className="text-[11px] bg-[#FFFDFA] border-t border-[#E8E4DF] p-3 overflow-auto max-h-80">
                  {JSON.stringify(s.result, null, 2)}
                </pre>
              </details>
            ))}
          </div>

          {/* Merged result */}
          <details className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 text-xs font-bold uppercase tracking-widest text-[#9C9C9C] hover:bg-[#FFFDFA]">Merged final result</summary>
            <pre className="text-[11px] bg-[#FFFDFA] border-t border-[#E8E4DF] p-3 overflow-auto max-h-96">
              {JSON.stringify(result.merged, null, 2)}
            </pre>
          </details>
        </>
      )}
      </div>
    </div>
  )
}

function StatusPill({ status, label }: { status: Status; label: string }) {
  const cfg = STATUS_COLOR[status]
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: cfg.bg, color: cfg.fg }}>
      {label}
    </span>
  )
}
