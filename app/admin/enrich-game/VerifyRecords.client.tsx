'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Verify new records: walk the unverified-but-enriched submissions newest-first,
// confirm the stored profile is right (or fix it), and stamp it verified in the
// database. No enrichment is re-run — this is the human QA pass, so it spends no
// API credits. Distinct from the tuner above (which trains the resolver).

interface Current {
  linkedinUrl?: string | null; companyName?: string | null; jobTitle?: string | null
  country?: string | null; seniority?: string | null; industry?: string | null
  photoUrl?: string | null; enrichmentStatus?: string | null; enrichedAt?: string | null
}
interface VerifyRow { id: string; known: Record<string, string | null>; current: Current }
interface Stats { queueTotal: number; verifiedTotal: number }

const INK = '#333', CREAM = '#FEF7E7', GREEN = '#0F8A6D'

function Photo({ url, name }: { url?: string | null; name?: string | null }) {
  const [broken, setBroken] = useState(false)
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" onError={() => setBroken(true)} referrerPolicy="no-referrer"
      style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${GREEN}`, display: 'block' }} />
  }
  return <span style={{ width: 72, height: 72, borderRadius: '50%', border: '3px dashed #D8D2C6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, color: '#C4BDB2', background: '#FAF7F1' }}>{initial}</span>
}

export default function VerifyRecords() {
  const [record, setRecord] = useState<VerifyRow | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)
  const [truth, setTruth] = useState({ linkedinUrl: '', companyName: '', jobTitle: '', country: '' })
  const [sessionVerified, setSessionVerified] = useState(0)
  const skipped = useRef<string[]>([])

  const loadNext = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = skipped.current.length ? `?exclude=${skipped.current.slice(-300).join(',')}` : ''
      const res = await fetch(`/api/admin/enrich/verify${qs}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setRecord(body.record); setStats(body.stats)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadNext() }, [loadNext])

  const decide = async (action: 'confirm' | 'correct') => {
    if (!record || busy) return
    setBusy(true)
    const payload = action === 'correct'
      ? { id: record.id, action, truth }
      : { id: record.id, action }
    try {
      const res = await fetch('/api/admin/enrich/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setSessionVerified(n => n + 1)
      setFlash(action === 'correct' ? 'Fixed & verified ✓' : 'Verified ✓')
      setTimeout(() => setFlash(null), 1000)
      setTruth({ linkedinUrl: '', companyName: '', jobTitle: '', country: '' }); setFixing(false)
      await loadNext()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const skip = async () => {
    if (!record || busy) return
    skipped.current.push(record.id)
    setFixing(false); setTruth({ linkedinUrl: '', companyName: '', jobTitle: '', country: '' })
    await loadNext()
  }

  const done = (stats?.verifiedTotal || 0)
  const pending = (stats?.queueTotal || 0)
  const pct = done + pending > 0 ? Math.round((done / (done + pending)) * 100) : 0
  const F = ({ label, v, link }: { label: string; v?: string | null; link?: boolean }) => (
    <div style={{ fontSize: 12.5, marginTop: 3 }}>
      <span style={{ color: '#9C9C9C' }}>{label}: </span>
      {v ? (link
        ? <a href={v} target="_blank" rel="noopener noreferrer" style={{ color: '#0A66C2', fontWeight: 600, wordBreak: 'break-all' }}>{v.replace(/^https?:\/\/(www\.)?/, '')}</a>
        : <strong style={{ color: '#333', fontWeight: 600 }}>{v}</strong>)
        : <span style={{ color: '#C4BDB2' }}>—</span>}
    </div>
  )

  return (
    <div>
      {/* Scoreboard */}
      {stats && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: GREEN }}>Verified this session: {sessionVerified}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#9C6B2F' }}>Need verification: {pending.toLocaleString()}</span>
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
            {skipped.current.length > 0 ? '🎉 Nothing left to verify (skipped ones aside).' : '🎉 Every enriched record is verified.'}
          </p>
          <p style={{ fontSize: 12.5, color: '#9C9C9C', marginTop: 6 }}>New records appear here as they get enriched.</p>
        </div>
      )}

      {/* Active record */}
      {record && (
        <div>
          {/* Known facts */}
          <div style={{ background: CREAM, border: '1px solid #EADFBF', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: '3px 16px' }}>
            {[['name', record.known.name], ['email', record.known.email], ['country', record.known.country], ['job level', record.known.jobLevel], ['work area', record.known.workArea]]
              .filter(([, v]) => v).map(([k, v]) => (
                <span key={k as string} style={{ fontSize: 12.5 }}><span style={{ color: '#9C7A2F' }}>{k}:</span> <strong style={{ color: INK, fontWeight: 700 }}>{v}</strong></span>
              ))}
          </div>

          {/* Stored profile */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E8E4DF', borderTop: `3px solid ${GREEN}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Photo url={record.current.photoUrl} name={record.known.name} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: GREEN }}>Stored profile</div>
                <div style={{ fontSize: 11, color: '#9C9C9C' }}>
                  {record.current.enrichmentStatus || 'enriched'}{record.current.enrichedAt ? ` · ${new Date(record.current.enrichedAt).toLocaleDateString()}` : ''}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <F label="LinkedIn" v={record.current.linkedinUrl} link />
              <F label="Company" v={record.current.companyName} />
              <F label="Title" v={record.current.jobTitle} />
              <F label="Country" v={record.current.country} />
              <F label="Seniority" v={record.current.seniority} />
              <F label="Industry" v={record.current.industry} />
            </div>
          </div>

          {/* Decision */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <button onClick={() => decide('confirm')} disabled={busy}
              style={{ background: GREEN, color: '#FFFDFA', border: 'none', borderRadius: 9, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
              ✓ Looks right — verify
            </button>
            <button onClick={() => setFixing(f => !f)} disabled={busy}
              style={{ background: '#FFFFFF', color: INK, border: '2px solid #E8E4DF', borderRadius: 9, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
              {fixing ? '▾ Fix & verify' : '✗ Fix & verify'}
            </button>
            <button onClick={skip} disabled={busy}
              style={{ background: '#FFFFFF', color: '#9C9C9C', border: '2px solid #E8E4DF', borderRadius: 9, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
              Skip
            </button>
          </div>

          {/* Correction box */}
          {fixing && (
            <div style={{ border: '1px dashed #D8D2C6', borderRadius: 10, padding: 14, background: '#FBF8F2' }}>
              <p style={{ fontSize: 12, color: '#6B6B6B', margin: '0 0 8px' }}>Only fill what needs fixing — blank fields keep the stored value. Saved straight to the record, no re-enrichment.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                <input value={truth.linkedinUrl} onChange={e => setTruth(t => ({ ...t, linkedinUrl: e.target.value }))} placeholder="correct LinkedIn URL"
                  style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
                <input value={truth.companyName} onChange={e => setTruth(t => ({ ...t, companyName: e.target.value }))} placeholder="correct company"
                  style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
                <input value={truth.jobTitle} onChange={e => setTruth(t => ({ ...t, jobTitle: e.target.value }))} placeholder="correct title"
                  style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
                <input value={truth.country} onChange={e => setTruth(t => ({ ...t, country: e.target.value }))} placeholder="correct country"
                  style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
              </div>
              <button
                onClick={() => decide('correct')}
                disabled={busy || !(truth.linkedinUrl || truth.companyName || truth.jobTitle || truth.country).trim()}
                style={{ marginTop: 10, background: INK, color: CREAM, border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (busy || !(truth.linkedinUrl || truth.companyName || truth.jobTitle || truth.country).trim()) ? 0.5 : 1 }}>
                Save correction & verify
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
