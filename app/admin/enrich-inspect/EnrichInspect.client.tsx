'use client'

import { useState } from 'react'

// Visual audit of the two enrichment flows. Submit a record (type it or paste
// a submission id to hydrate), and watch the current pipeline and the new
// verified-resolver pipeline run step by step, side by side: what each step
// ingested, the queries/URLs it used, and what it returned.

interface Stage {
  name: string
  status: 'ok' | 'miss' | 'skipped' | 'error'
  input?: Record<string, unknown>
  reason?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any
}
interface Flow {
  stages: Stage[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  merged: any
  status: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolver?: any
  providersTried: string[]
}

const DOT: Record<string, string> = { ok: '#2E7D32', miss: '#E65100', skipped: '#C4BDB2', error: '#B3261E' }
const STAGE_LABEL: Record<string, string> = {
  name_from_email: 'Name from email', google_search: 'Google → identity', linkedin_scrape: 'LinkedIn profile scrape',
  apollo: 'Apollo lookup', photo_ai_demographics: 'Photo AI demographics',
  beehiiv_lookup: 'Beehiiv lookup', stripe_lookup: 'Stripe lookup',
}

function KV({ obj }: { obj?: Record<string, unknown> }) {
  if (!obj) return null
  const entries = Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (entries.length === 0) return <span style={{ fontSize: 11.5, color: '#C4BDB2' }}>(empty)</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
      {entries.map(([k, v]) => (
        <span key={k} style={{ fontSize: 11.5, color: '#4A4A4A' }}>
          <span style={{ color: '#9C9C9C' }}>{k}:</span> <strong style={{ fontWeight: 600, color: '#333' }}>{String(v)}</strong>
        </span>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GoogleDetail({ result, isNew }: { result: any; isNew: boolean }) {
  const queries: string[] = result?.triedQueries || []
  const cands: { url: string; title?: string; snippet?: string; query?: string; isLinkedin?: boolean }[] =
    result?.candidates || result?.organicSample || []
  return (
    <div>
      {queries.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9C9C9C', marginBottom: 3 }}>Queries searched</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {queries.map((q, i) => (
              <span key={i} style={{ fontSize: 11, background: '#F1EDE4', border: '1px solid #E8E4DF', borderRadius: 4, padding: '1px 7px', color: '#333' }}>{q}</span>
            ))}
          </div>
        </div>
      )}
      {isNew && typeof result?.confidence === 'number' && (
        <div style={{ marginBottom: 8, fontSize: 11.5 }}>
          <span style={{ fontWeight: 700, color: result.confidence >= 0.7 ? '#2E7D32' : '#E65100' }}>LLM verdict: confidence {Number(result.confidence).toFixed(2)}</span>
          {result.reasoning && <span style={{ color: '#6B6B6B', fontStyle: 'italic' }}> — {result.reasoning}</span>}
        </div>
      )}
      {cands.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9C9C9C', marginBottom: 3 }}>Results read ({cands.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cands.map((c, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${c.isLinkedin ? '#0A66C2' : '#E8E4DF'}`, paddingLeft: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#191919' }}>{c.title || '(no title)'} {c.isLinkedin && <span style={{ color: '#0A66C2', fontSize: 10 }}>· LinkedIn</span>}</div>
                <div style={{ fontSize: 10.5, color: '#0F8A6D', wordBreak: 'break-all' }}>{c.url}</div>
                {c.snippet && <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{c.snippet}</div>}
                {c.query && <div style={{ fontSize: 9.5, color: '#B7B0A4', marginTop: 1 }}>via: {c.query}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResultDetail({ stage }: { stage: Stage }) {
  if (stage.name === 'google_search') return <GoogleDetail result={stage.result} isNew={!!stage.result?.candidates} />
  const r = stage.result
  if (!r) return null
  // Person-shaped result → show the identity fields it produced.
  const fields = ['fullName', 'jobTitle', 'companyName', 'seniority', 'country', 'city', 'linkedinUrl', 'industry', 'headline']
    .map(k => [k, r[k]]).filter(([, v]) => v) as [string, string][]
  if (fields.length > 0) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
        {fields.map(([k, v]) => (
          <span key={k} style={{ fontSize: 11.5, color: '#4A4A4A' }}><span style={{ color: '#9C9C9C' }}>{k}:</span> <strong style={{ fontWeight: 600, color: '#333' }}>{v}</strong></span>
        ))}
      </div>
    )
  }
  if (typeof r === 'object' && r.linkedinUrl) return <div style={{ fontSize: 11.5, color: '#0F8A6D', wordBreak: 'break-all' }}>{r.linkedinUrl}</div>
  return null
}

function StageNode({ stage, last }: { stage: Stage; last: boolean }) {
  const [open, setOpen] = useState(stage.name === 'google_search')
  const hasDetail = !!stage.input || !!stage.result || !!stage.reason
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ width: 13, height: 13, borderRadius: '50%', background: DOT[stage.status] || '#C4BDB2', marginTop: 3 }} />
        {!last && <span style={{ flex: 1, width: 2, background: '#E8E4DF', marginTop: 2 }} />}
      </div>
      <div style={{ flex: 1, paddingBottom: last ? 0 : 14, minWidth: 0 }}>
        <button onClick={() => hasDetail && setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: hasDetail ? 'pointer' : 'default', textAlign: 'left', width: '100%' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{STAGE_LABEL[stage.name] || stage.name}</span>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DOT[stage.status] }}>{stage.status}</span>
          {hasDetail && <span style={{ marginLeft: 'auto', color: '#C4BDB2', fontSize: 11 }}>{open ? '▾' : '▸'}</span>}
        </button>
        {stage.reason && <div style={{ fontSize: 11.5, color: '#6B6B6B', marginTop: 2 }}>{stage.reason}</div>}
        {open && hasDetail && (
          <div style={{ marginTop: 6, background: '#FBF8F2', border: '1px solid #EFEAE1', borderRadius: 6, padding: '8px 10px' }}>
            {stage.input && (
              <div style={{ marginBottom: stage.result ? 8 : 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9C9C9C', marginBottom: 3 }}>Input it used</div>
                <KV obj={stage.input} />
              </div>
            )}
            {stage.result && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9C9C9C', marginBottom: 3 }}>Result</div>
                <ResultDetail stage={stage} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Stepper({ title, flow, accent }: { title: string; flow: Flow; accent: string }) {
  const m = flow.merged || {}
  return (
    <div style={{ flex: 1, minWidth: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: accent }}>{title}</h3>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: '#9C9C9C', border: '1px solid #E8E4DF', borderRadius: 4, padding: '1px 6px' }}>{flow.status}</span>
      </div>
      {/* Final identity summary */}
      <div style={{ background: '#FFFFFF', border: `1px solid #E8E4DF`, borderLeft: `3px solid ${accent}`, borderRadius: 6, padding: '8px 11px', marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9C9C9C', marginBottom: 3 }}>Final identity</div>
        <KV obj={{ linkedin: m.linkedinUrl, company: m.companyName, title: m.jobTitle, country: m.country, seniority: m.seniority }} />
      </div>
      <div>{flow.stages.map((s, i) => <StageNode key={i} stage={s} last={i === flow.stages.length - 1} />)}</div>
    </div>
  )
}

const FIELDS: { key: string; label: string; ph: string }[] = [
  { key: 'name', label: 'Name', ph: 'Jane Doe' },
  { key: 'email', label: 'Email', ph: 'jane@gmail.com' },
  { key: 'country', label: 'Country', ph: 'United States' },
  { key: 'jobTitle', label: 'Title (optional)', ph: 'Marketing Director' },
  { key: 'companyName', label: 'Company (optional)', ph: 'Acme Inc' },
  { key: 'linkedinUrl', label: 'LinkedIn (optional)', ph: 'leave blank to test search' },
]

export default function EnrichInspect() {
  const [form, setForm] = useState<Record<string, string>>({ name: '', email: '', country: '', jobTitle: '', companyName: '', linkedinUrl: '', submissionId: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{ current: Flow; proposed: Flow; input: Record<string, unknown> } | null>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const run = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/admin/enrich/inspect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, submissionId: form.submissionId || undefined }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setData(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E4DF', borderRadius: 10, padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
          {FIELDS.map(f => (
            <label key={f.key} style={{ display: 'block' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6B6B6B' }}>{f.label}</span>
              <input value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.ph}
                style={{ width: '100%', marginTop: 3, fontSize: 13, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6, background: '#FFFDFA' }} />
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6B6B6B' }}>or record id</span>
            <input value={form.submissionId} onChange={e => set('submissionId', e.target.value)} placeholder="hydrate from a submission"
              style={{ fontSize: 12, padding: '5px 8px', border: '1px solid #E8E4DF', borderRadius: 6, width: 260 }} />
          </label>
          <button onClick={run} disabled={busy} style={{ background: '#333333', color: '#FFFDFA', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Running both pipelines…' : '▶ Run both pipelines'}
          </button>
          <span style={{ fontSize: 11, color: '#9C9C9C' }}>Runs both flows fresh (~2 min, a couple of API credits). Clear LinkedIn to watch the search work.</span>
        </div>
        {error && <p style={{ marginTop: 10, fontSize: 12.5, fontWeight: 600, color: '#BE3B3B' }}>Error: {error}</p>}
      </div>

      {data && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Stepper title="Current pipeline" flow={data.current} accent="#9C6B2F" />
          <Stepper title="New pipeline (verified)" flow={data.proposed} accent="#0F8A6D" />
        </div>
      )}
    </div>
  )
}
