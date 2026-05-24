'use client'

import { useState } from 'react'

type PrefillResult = {
  email: string
  blocked?: boolean
  fields: Record<string, { value: string | string[]; source: string } | undefined>
  history: { found: boolean; submissionId?: string; archetype?: string; completedAt?: number }
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

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  aiLevel: 'AI level',
  workArea: 'Work area',
  learningStyle: 'Learning style',
  timeCommitment: 'Time commitment',
  mainGoal: 'Main goal',
  aiTools: 'AI tools',
  jobLevel: 'Job level',
}

const SOURCE_COLORS: Record<string, string> = {
  history: 'bg-purple-100 text-purple-700',
  beehiiv: 'bg-blue-100 text-blue-700',
  apollo: 'bg-orange-100 text-orange-700',
}

export default function DebugPage() {
  const [email, setEmail] = useState('')
  const [result, setResult] = useState<PrefillResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onLookup(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch(`/api/admin/lookup?email=${encodeURIComponent(email)}`)
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

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-black text-black mb-1">Debug lookup</h1>
      <p className="text-sm text-gray-500 mb-6">
        Paste an email to see exactly what the prefill API would return — past submission, Beehiiv custom fields, Apollo enrichment, and the merged result.
      </p>

      <form onSubmit={onLookup} className="flex gap-2 mb-8">
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

          {/* History */}
          <section className="bg-white border border-[#E0E0E0] rounded-xl p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">KV history</h2>
            {result.history.found ? (
              <div className="text-sm text-gray-700 space-y-1">
                <div><span className="text-gray-400">Submission ID:</span> {result.history.submissionId}</div>
                <div><span className="text-gray-400">Archetype:</span> {result.history.archetype}</div>
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
  )
}
