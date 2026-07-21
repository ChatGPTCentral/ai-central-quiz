'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Unified verify + tune. For each unverified contact (newest first) we run BOTH
// enrichers live and show three columns — what the quiz knows, Apollo, and the
// Google+Apify resolver. The owner votes the winner or types an override; one
// click writes the profile onto the record, stamps it verified, banks it as
// ground truth, and logs the head-to-head. Every verify makes the resolver
// smarter (it reuses verified colleagues at the same domain as few-shot).

interface Cand {
  source: 'apollo' | 'verified'; found: boolean
  linkedinUrl?: string | null; companyName?: string | null; jobTitle?: string | null
  country?: string | null; seniority?: string | null; industry?: string | null
  photoUrl?: string | null; confidence?: number | null; reasoning?: string | null
}
interface QueueRecord { id: string; known: { [k: string]: string | null } }
interface Stats { queueTotal: number; verifiedTotal: number }
type Profile = { linkedinUrl?: string; companyName?: string; jobTitle?: string; country?: string; seniority?: string; industry?: string; photoUrl?: string }

const INK = '#333', CREAM = '#FEF7E7', GREEN = '#0F8A6D', AMBER = '#9C6B2F'

function Photo({ url, name, accent }: { url?: string | null; name?: string | null; accent: string }) {
  const [broken, setBroken] = useState(false)
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" onError={() => setBroken(true)} referrerPolicy="no-referrer"
      style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${accent}`, display: 'block' }} />
  }
  return <span style={{ width: 72, height: 72, borderRadius: '50%', border: '3px dashed #D8D2C6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, color: '#C4BDB2', background: '#FAF7F1' }}>{initial}</span>
}

function CandCard({ title, cand, accent, name, loading }: { title: string; cand?: Cand; accent: string; name?: string | null; loading: boolean }) {
  const F = ({ label, v, link }: { label: string; v?: string | null; link?: boolean }) => (
    <div style={{ fontSize: 12.5, marginTop: 2 }}>
      <span style={{ color: '#9C9C9C' }}>{label}: </span>
      {v ? (link
        ? <a href={v} target="_blank" rel="noopener noreferrer" style={{ color: '#0A66C2', fontWeight: 600, wordBreak: 'break-all' }}>{v.replace(/^https?:\/\/(www\.)?/, '')}</a>
        : <strong style={{ color: '#333', fontWeight: 600 }}>{v}</strong>)
        : <span style={{ color: '#C4BDB2' }}>—</span>}
    </div>
  )
  return (
    <div style={{ flex: 1, minWidth: 240, background: '#FFFFFF', border: '1px solid #E8E4DF', borderTop: `3px solid ${accent}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Photo url={cand?.photoUrl} name={name} accent={accent} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: accent }}>{title}</div>
          {loading && <div style={{ fontSize: 11, color: '#9C9C9C' }}>enriching…</div>}
          {!loading && cand && !cand.found && <div style={{ fontSize: 11, color: '#B3261E' }}>no match found</div>}
          {!loading && cand && typeof cand.confidence === 'number' && <div style={{ fontSize: 11, fontWeight: 700, color: cand.confidence >= 0.7 ? GREEN : AMBER }}>confidence {cand.confidence.toFixed(2)}</div>}
        </div>
      </div>
      <div style={{ marginTop: 10, opacity: loading ? 0.4 : 1 }}>
        <F label="LinkedIn" v={cand?.linkedinUrl} link />
        <F label="Company" v={cand?.companyName} />
        <F label="Title" v={cand?.jobTitle} />
        <F label="Country" v={cand?.country} />
        <F label="Seniority" v={cand?.seniority} />
      </div>
      {cand?.reasoning && !loading && <p style={{ marginTop: 8, fontSize: 11.5, fontStyle: 'italic', color: '#6B6B6B' }}>{cand.reasoning}</p>}
    </div>
  )
}

function toProfile(c?: Cand): Profile {
  if (!c || !c.found) return {}
  return { linkedinUrl: c.linkedinUrl || undefined, companyName: c.companyName || undefined, jobTitle: c.jobTitle || undefined, country: c.country || undefined, seniority: c.seniority || undefined, industry: c.industry || undefined, photoUrl: c.photoUrl || undefined }
}

export default function VerifyRecords() {
  const [record, setRecord] = useState<QueueRecord | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [enriching, setEnriching] = useState(false)
  const [apollo, setApollo] = useState<Cand | undefined>()
  const [verified, setVerified] = useState<Cand | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)
  const [truth, setTruth] = useState<Profile>({})
  const [sessionDone, setSessionDone] = useState(0)
  const [started, setStarted] = useState(false)
  const skipped = useRef<string[]>([])

  const runEnrich = useCallback(async (id: string) => {
    setEnriching(true); setApollo(undefined); setVerified(undefined)
    try {
      const res = await fetch('/api/admin/enrich/verify/enrich', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setApollo(body.apollo); setVerified(body.verified)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setEnriching(false) }
  }, [])

  const loadNext = useCallback(async (autoEnrich: boolean) => {
    setLoading(true); setError(null); setFixing(false); setTruth({})
    setApollo(undefined); setVerified(undefined)
    try {
      const qs = skipped.current.length ? `?exclude=${skipped.current.slice(-300).join(',')}` : ''
      const res = await fetch(`/api/admin/enrich/verify${qs}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setRecord(body.record); setStats(body.stats)
      if (body.record && autoEnrich) runEnrich(body.record.id)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [runEnrich])

  // Load the queue count on mount, but don't spend credits until the owner
  // clicks Start (each record enriched = 1 Apollo credit).
  useEffect(() => { loadNext(false) }, [loadNext])

  const start = () => { setStarted(true); if (record) runEnrich(record.id) }

  const decide = async (won: 'apollo' | 'verified' | 'both' | 'manual' | 'neither') => {
    if (!record || busy) return
    let profile: Profile = {}
    if (won === 'apollo') profile = toProfile(apollo)
    else if (won === 'verified') profile = toProfile(verified)
    else if (won === 'both') { const a = toProfile(apollo), v = toProfile(verified); profile = { linkedinUrl: v.linkedinUrl || a.linkedinUrl, companyName: v.companyName || a.companyName, jobTitle: v.jobTitle || a.jobTitle, country: v.country || a.country, seniority: v.seniority || a.seniority, industry: v.industry || a.industry, photoUrl: v.photoUrl || a.photoUrl } }
    else if (won === 'manual') profile = truth
    setBusy(true)
    try {
      const res = await fetch('/api/admin/enrich/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, won, profile, apollo, verified, known: record.known, method: won === 'manual' ? 'manual override' : undefined }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setSessionDone(n => n + 1)
      setFlash(won === 'neither' ? 'Marked unresolved ✓' : 'Verified ✓')
      setTimeout(() => setFlash(null), 900)
      await loadNext(true)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const skip = async () => {
    if (!record || busy) return
    skipped.current.push(record.id)
    await loadNext(true)
  }

  const done = stats?.verifiedTotal || 0
  const pending = stats?.queueTotal || 0
  const pct = done + pending > 0 ? Math.round((done / (done + pending)) * 100) : 0
  const canManual = !!(truth.linkedinUrl || truth.companyName || truth.jobTitle || truth.country)
  const btn = (label: string, on: () => void, bg: string, disabled = false) => (
    <button onClick={on} disabled={busy || disabled}
      style={{ background: bg, color: bg === '#FFFFFF' ? INK : '#FFFDFA', border: bg === '#FFFFFF' ? '2px solid #E8E4DF' : 'none', borderRadius: 9, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: (busy || disabled) ? 0.5 : 1 }}>
      {label}
    </button>
  )

  return (
    <div>
      {/* Scoreboard */}
      {stats && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: GREEN }}>Verified this session: {sessionDone}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: AMBER }}>Not yet verified: {pending.toLocaleString()}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9C9C9C' }}>{done.toLocaleString()} verified in the database ({pct}%)</span>
          <div style={{ width: '100%', height: 6, background: '#EFEAE1', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: GREEN, transition: 'width .3s' }} />
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12.5, fontWeight: 600, color: '#BE3B3B', marginBottom: 12 }}>Error: {error}</p>}
      {flash && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: INK, color: CREAM, padding: '8px 20px', borderRadius: 20, fontWeight: 800, fontSize: 14, zIndex: 80 }}>{flash}</div>}

      {loading && !record && <p style={{ fontSize: 12.5, color: '#9C9C9C' }}>Loading…</p>}

      {/* Empty state */}
      {!loading && !record && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4DF', borderRadius: 12, padding: 28, textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: INK }}>
            {skipped.current.length > 0 ? '🎉 Nothing left to verify (skipped ones aside).' : '🎉 Every contact is verified.'}
          </p>
        </div>
      )}

      {/* Start gate (first record loaded, not yet enriching — avoids surprise spend) */}
      {record && !started && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4DF', borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: INK }}>Ready to verify {pending.toLocaleString()} contacts?</p>
          <p style={{ fontSize: 12.5, color: '#9C9C9C', margin: '6px 0 14px' }}>
            Each record runs both enrichers live (1 Apollo credit + a Google/Apify lookup). Vote the winner or type the fix; it saves to the record and teaches the resolver. Work through as many as you like — you control the spend.
          </p>
          <button onClick={start} style={{ background: INK, color: CREAM, border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>▶ Start verifying</button>
        </div>
      )}

      {/* Active record */}
      {record && started && (
        <div>
          {/* Known facts */}
          <div style={{ background: CREAM, border: '1px solid #EADFBF', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: '3px 16px' }}>
            {[['name', record.known.name], ['email', record.known.email], ['country', record.known.country], ['job level', record.known.jobLevel], ['work area', record.known.workArea]]
              .filter(([, v]) => v).map(([k, v]) => (
                <span key={k as string} style={{ fontSize: 12.5 }}><span style={{ color: '#9C7A2F' }}>{k}:</span> <strong style={{ color: INK, fontWeight: 700 }}>{v}</strong></span>
              ))}
          </div>

          {/* Two enrichers */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <CandCard title="Enricher 1 · Apollo" cand={apollo} accent={AMBER} name={record.known.name} loading={enriching} />
            <CandCard title="Enricher 2 · Google + Apify" cand={verified} accent={GREEN} name={record.known.name} loading={enriching} />
          </div>

          {/* Decision */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {btn('✓ Apollo', () => decide('apollo'), AMBER, enriching || !apollo?.found)}
            {btn('✓ Google/Apify', () => decide('verified'), GREEN, enriching || !verified?.found)}
            {btn('Both agree', () => decide('both'), '#546E7A', enriching || !(apollo?.found && verified?.found))}
            {btn(fixing ? '▾ Fix manually' : '✗ Fix manually', () => setFixing(f => !f), '#FFFFFF')}
            {btn('Neither', () => decide('neither'), '#B3261E', enriching)}
            {btn('Skip', skip, '#FFFFFF')}
          </div>

          {/* Manual override */}
          {fixing && (
            <div style={{ border: '1px dashed #D8D2C6', borderRadius: 10, padding: 14, background: '#FBF8F2' }}>
              <p style={{ fontSize: 12, color: '#6B6B6B', margin: '0 0 8px' }}>Type the correct details — this overrides the record and becomes ground truth. Blank fields are ignored.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                <input value={truth.linkedinUrl || ''} onChange={e => setTruth(t => ({ ...t, linkedinUrl: e.target.value }))} placeholder="correct LinkedIn URL" style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
                <input value={truth.companyName || ''} onChange={e => setTruth(t => ({ ...t, companyName: e.target.value }))} placeholder="correct company" style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
                <input value={truth.jobTitle || ''} onChange={e => setTruth(t => ({ ...t, jobTitle: e.target.value }))} placeholder="correct title" style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
                <input value={truth.country || ''} onChange={e => setTruth(t => ({ ...t, country: e.target.value }))} placeholder="correct country" style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
              </div>
              <button onClick={() => decide('manual')} disabled={busy || !canManual}
                style={{ marginTop: 10, background: INK, color: CREAM, border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (busy || !canManual) ? 0.5 : 1 }}>
                Save override & verify
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
