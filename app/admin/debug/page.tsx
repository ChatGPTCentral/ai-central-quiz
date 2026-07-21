'use client'

import { useEffect, useState } from 'react'
import { stageDef } from '@/lib/segmentation-v2'

type PrefillResult = {
  email: string
  blocked?: boolean
  fields: Record<string, { value: string | string[]; source: string } | undefined>
  history: {
    found: boolean
    submissionId?: string
    completedAt?: number
    // v2 segmentation snapshot
    stage?: string
    stageReason?: string
    persona?: string
    personaReason?: string
    frequencyScore?: number
    depthScore?: number
    breadthScore?: number
    momentum?: number
    friction?: string
    intent30d?: string
  }
  beehiiv: { found: boolean; subscriberId?: string; status?: string; customFields?: Record<string, string>; raw?: unknown; error?: string }
  apollo: {
    success: boolean
    companyName?: string
    companySize?: string
    industry?: string
    linkedinUrl?: string
    jobTitle?: string
    seniorityLevel?: string
  }
}

// Field labels — kept for any legacy fields surfaced by Beehiiv / older
// quiz history rows. v2 fields are rendered separately below
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  jobLevel: 'Job level',
  workArea: 'Work area',
  aiTools: 'AI tools',
  // Legacy v1 fields (kept for back-compat with pre-cutover Beehiiv data)
  aiLevel: 'AI level (legacy)',
  learningStyle: 'Learning style (legacy)',
  timeCommitment: 'Time commitment (legacy)',
  mainGoal: 'Main goal (legacy)',
}

const SOURCE_COLORS: Record<string, string> = {
  history: 'bg-purple-100 text-purple-700',
  beehiiv: 'bg-blue-100 text-blue-700',
  apollo: 'bg-orange-100 text-orange-700',
}

interface RecentLead { name: string | null; email: string; created_at: string }

export default function DebugPage() {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<PrefillResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<RecentLead[]>([])

  // Quick-pick candidates: the latest quiz submissions, so debugging starts
  // from real records instead of hand-typed emails.
  useEffect(() => {
    fetch('/api/admin/lookup?recent=1')
      .then(r => r.json())
      .then(b => setRecent(Array.isArray(b.recent) ? b.recent : []))
      .catch(() => { /* chips just don't render */ })
  }, [])

  async function runLookup(target: string) {
    if (!target) return
    setEmail(target)
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`/api/admin/lookup?email=${encodeURIComponent(target)}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Lookup failed')
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function onLookup(e?: React.FormEvent) {
    e?.preventDefault()
    runLookup(email)
  }

  return (
    <div>
      <header style={{ padding: '26px 36px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Tools · prefill path inspector</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Debug lookup</h1>
        <p className="text-sm text-gray-500 mt-1 mb-2">
          What the public quiz PREFILL path returns for an email: past submission, Survey v2 stage + persona, Beehiiv custom fields, Apollo enrichment, and the merged result. This intentionally mirrors the legacy prefill API the quiz calls, not the full pipeline.
        </p>
        <p className="text-sm text-gray-500">
          To run the full current enrichment pipeline on an email (Google-first, Apify, AI vision), use the{' '}
          <a className="font-bold text-[#046BB1] hover:underline" href={`/admin/lab${email ? `?email=${encodeURIComponent(email)}` : ''}`}>Enrichment Lab →</a>
        </p>
      </header>

      <div className="p-8 pt-1 max-w-4xl">
      <form onSubmit={onLookup} className="flex gap-2 mb-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="someone@company.com"
          className="flex-1 px-4 py-3 border-2 border-[#E0E0E0] rounded-lg outline-none focus:border-black text-sm"
        />
        <button
          type="submit"
          disabled={loading || !email}
          className="px-5 py-3 rounded-lg bg-black text-white font-bold text-sm disabled:opacity-40 hover:bg-[#222] transition-colors"
        >
          {loading ? 'Looking up…' : 'Lookup'}
        </button>
      </form>

      {recent.length > 0 && (
        <div className="mb-8">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Recent submissions</div>
          <div className="flex flex-wrap gap-1.5">
            {recent.map(r => (
              <button
                key={r.email}
                onClick={() => runLookup(r.email)}
                disabled={loading}
                title={`${r.email} · ${new Date(r.created_at).toLocaleString()}`}
                className="px-2.5 py-1 rounded-full border border-[#E0E0E0] bg-white text-[11.5px] text-[#333] hover:border-black transition-colors disabled:opacity-40"
              >
                {r.name || r.email}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="space-y-6">
          {result.blocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              ⚠️ Email blocked — personal-domain email. Prefill returned no fields.
            </div>
          )}

          {/* Merged fields */}
          <section className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 px-5 pt-5 mb-3">Merged prefill fields</h2>
            <div className="px-5 pb-5">
              {Object.entries(FIELD_LABELS).map(([key, label]) => {
                const f = result.fields[key]
                return (
                  <div key={key} className="flex items-start justify-between gap-4 py-2.5 border-b border-[#F0F0F0] last:border-b-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 w-32 shrink-0">{label}</span>
                    <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                      <span className="text-sm text-black break-words">
                        {f ? (Array.isArray(f.value) ? f.value.join(', ') : f.value) : <span className="text-gray-300">—</span>}
                      </span>
                      {f && (
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${SOURCE_COLORS[f.source] || 'bg-gray-100 text-gray-700'}`}>
                          {f.source}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Segmentation v2 snapshot — stage + persona + raw v2 inputs */}
          {result.history.found && result.history.stage && (
            <section className="bg-white border border-[#E0E0E0] rounded-xl p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">📈 AI ladder · v2 segmentation</h2>
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {(() => {
                  const def = stageDef(result.history.stage)
                  if (!def || def.key === 'unknown') return null
                  return (
                    <span
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider"
                      style={{ backgroundColor: def.color + '22', color: def.color, border: `1px solid ${def.color}40` }}
                      title={result.history.stageReason}
                    >
                      {def.emoji} {def.label}
                    </span>
                  )
                })()}
              </div>
              {result.history.stageReason && (
                <p className="text-[11px] text-gray-500 mb-1"><strong>Why stage:</strong> {result.history.stageReason}</p>
              )}

              {/* Raw v2 signals */}
              {(result.history.frequencyScore != null || result.history.depthScore != null || result.history.breadthScore != null || result.history.momentum != null || result.history.friction || result.history.intent30d) ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Survey v2:</span>
                  {result.history.frequencyScore != null && <span className="px-1.5 py-0.5 rounded bg-[#F5F5F5] text-[#333333] text-[10px]">freq {result.history.frequencyScore}/3</span>}
                  {result.history.depthScore != null && <span className="px-1.5 py-0.5 rounded bg-[#F5F5F5] text-[#333333] text-[10px]">depth {result.history.depthScore}/6</span>}
                  {result.history.breadthScore != null && <span className="px-1.5 py-0.5 rounded bg-[#F5F5F5] text-[#333333] text-[10px]">breadth {result.history.breadthScore}</span>}
                  {result.history.momentum != null && <span className="px-1.5 py-0.5 rounded bg-[#F5F5F5] text-[#333333] text-[10px]">momentum {result.history.momentum > 0 ? '+' : ''}{result.history.momentum}</span>}
                  {result.history.friction && <span className="px-1.5 py-0.5 rounded bg-[#FEF7E7] text-[#BE593B] text-[10px]" title="What's blocking them">🛑 {result.history.friction.replace(/_/g, ' ')}</span>}
                  {result.history.intent30d && <span className="px-1.5 py-0.5 rounded bg-[#62A758]/15 text-[#2D6A26] text-[10px]" title="30-day intent">🎯 {result.history.intent30d.replace(/_/g, ' ')}</span>}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 italic mt-2">No Survey v2 signals yet · stage inferred from legacy fields</p>
              )}
            </section>
          )}

          {/* History */}
          <section className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">KV history</h2>
            {result.history.found ? (
              <div className="text-sm text-gray-700 space-y-1">
                <div><span className="text-gray-400">Submission ID:</span> {result.history.submissionId}</div>
                <div><span className="text-gray-400">Completed:</span> {result.history.completedAt ? new Date(result.history.completedAt).toLocaleString() : '—'}</div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No prior submission</p>
            )}
          </section>

          {/* Beehiiv */}
          <section className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Beehiiv subscriber</h2>
            {result.beehiiv.found ? (
              <>
                <div className="text-sm text-gray-700 mb-3">
                  <span className="text-gray-400">ID:</span> {result.beehiiv.subscriberId}{' '}
                  <span className="text-gray-400 ml-2">Status:</span> {result.beehiiv.status}
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-black mb-2">Raw payload</summary>
                  <pre className="bg-[#FAFAFA] border border-[#F0F0F0] rounded-lg p-3 overflow-auto max-h-80">{JSON.stringify(result.beehiiv.raw, null, 2)}</pre>
                </details>
              </>
            ) : (
              <p className="text-sm text-gray-400">{result.beehiiv.error ? `Error: ${result.beehiiv.error}` : 'Not subscribed'}</p>
            )}
          </section>

          {/* Apollo */}
          <section className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Apollo enrichment</h2>
            {result.apollo.success ? (
              <pre className="text-xs bg-[#FAFAFA] border border-[#F0F0F0] rounded-lg p-3 overflow-auto max-h-80">{JSON.stringify(result.apollo, null, 2)}</pre>
            ) : (
              <p className="text-sm text-gray-400">No Apollo match</p>
            )}
          </section>
        </div>
      )}
      </div>
    </div>
  )
}
