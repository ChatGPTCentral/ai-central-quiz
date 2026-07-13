'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// The enrichment game: for each of the last 40 people, see their photo + both
// pipelines' guesses, pick the winner (or neither), and optionally tell me the
// real profile and how you found it. Your verdicts become the eval set I tune
// the resolver against, so the two flows converge on your judgment.

interface Cand {
  linkedinUrl?: string | null; companyName?: string | null; jobTitle?: string | null
  country?: string | null; seniority?: string | null; photoUrl?: string | null
  confidence?: number | null; reasoning?: string | null; outcome?: string | null
}
interface Round { id: string; submission_id: string; known: Record<string, string | null>; current: Cand; proposed: Cand }
interface Stats { total: number; labeled: number; scored: number; newRight: number; currentRight: number; neither: number; reranDone?: number; reranScored?: number; reranRight?: number }

const INK = '#333', CREAM = '#FEF7E7', GREEN = '#0F8A6D', AMBER = '#9C6B2F'
const TARGET = 40

function Photo({ url, name, accent }: { url?: string | null; name?: string | null; accent: string }) {
  const [broken, setBroken] = useState(false)
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" onError={() => setBroken(true)} referrerPolicy="no-referrer"
      style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${accent}`, display: 'block' }} />
  }
  return <span style={{ width: 84, height: 84, borderRadius: '50%', border: `3px dashed #D8D2C6`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: '#C4BDB2', background: '#FAF7F1' }}>{initial}</span>
}

function CandCard({ title, cand, accent, name }: { title: string; cand: Cand; accent: string; name?: string | null }) {
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
        <Photo url={cand.photoUrl} name={name} accent={accent} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: accent }}>{title}</div>
          {typeof cand.confidence === 'number' && (
            <div style={{ fontSize: 11, fontWeight: 700, color: cand.confidence >= 0.7 ? GREEN : AMBER }}>confidence {cand.confidence.toFixed(2)} · {cand.outcome}</div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <F label="LinkedIn" v={cand.linkedinUrl} link />
        <F label="Company" v={cand.companyName} />
        <F label="Title" v={cand.jobTitle} />
        <F label="Country" v={cand.country} />
        <F label="Seniority" v={cand.seniority} />
      </div>
      {cand.reasoning && <p style={{ marginTop: 8, fontSize: 11.5, fontStyle: 'italic', color: '#6B6B6B' }}>{cand.reasoning}</p>}
    </div>
  )
}

export default function EnrichGame() {
  const [round, setRound] = useState<Round | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [truth, setTruth] = useState({ linkedinUrl: '', companyName: '', jobTitle: '' })
  const [method, setMethod] = useState('')
  const [showTruth, setShowTruth] = useState(false)
  const preparingRef = useRef(false)

  const loadNext = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/enrich/game')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setRound(body.round); setStats(body.stats)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadNext() }, [loadNext])

  const prepare = async () => {
    if (preparingRef.current) return
    preparingRef.current = true; setPreparing(true); setError(null)
    try {
      for (let i = 0; i < 12; i++) {
        const res = await fetch('/api/admin/enrich/game/prepare', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 5, target: TARGET }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        if (!round) await loadNext()   // start playing as soon as rounds exist
        else { const r = await fetch('/api/admin/enrich/game'); const b = await r.json(); setStats(b.stats) }
        if (body.finished) break
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { preparingRef.current = false; setPreparing(false) }
  }

  const rerun = async () => {
    if (preparingRef.current) return
    preparingRef.current = true; setPreparing(true); setError(null)
    try {
      for (let i = 0; i < 12; i++) {
        const res = await fetch('/api/admin/enrich/game/prepare', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rerun: true, limit: 5 }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
        const r = await fetch('/api/admin/enrich/game'); const b = await r.json(); setStats(b.stats)
        if (body.finished) break
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { preparingRef.current = false; setPreparing(false) }
  }

  const decide = async (choice: string) => {
    if (!round) return
    const cleanTruth = (truth.linkedinUrl || truth.companyName || truth.jobTitle) ? truth : undefined
    setFlash(choice === 'new' ? 'New ✓' : choice === 'current' ? 'Current ✓' : choice === 'both' ? 'Both ✓' : choice === 'neither' ? 'Neither' : 'Skipped')
    try {
      await fetch('/api/admin/enrich/game', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: round.id, choice, truth: cleanTruth, method: method.trim() || undefined }),
      })
    } catch { /* non-fatal, still advance */ }
    setTruth({ linkedinUrl: '', companyName: '', jobTitle: '' }); setMethod(''); setShowTruth(false)
    setTimeout(() => setFlash(null), 900)
    await loadNext()
  }

  const btn = (label: string, choice: string, bg: string) => (
    <button onClick={() => decide(choice)} disabled={loading}
      style={{ background: bg, color: bg === '#FFFFFF' ? INK : '#FFFDFA', border: bg === '#FFFFFF' ? '2px solid #E8E4DF' : 'none', borderRadius: 9, padding: '10px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
      {label}
    </button>
  )

  const pct = stats ? Math.round((stats.labeled / Math.max(1, stats.total)) * 100) : 0

  return (
    <div>
      {/* Scoreboard */}
      {stats && stats.total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: GREEN }}>New right: {stats.newRight}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: AMBER }}>Current right: {stats.currentRight}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#9C9C9C' }}>Neither: {stats.neither}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9C9C9C' }}>{stats.labeled}/{stats.total} labeled</span>
          <div style={{ width: '100%', height: 6, background: '#EFEAE1', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: GREEN, transition: 'width .3s' }} />
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12.5, fontWeight: 600, color: '#BE3B3B', marginBottom: 12 }}>Error: {error}</p>}
      {flash && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: INK, color: CREAM, padding: '8px 20px', borderRadius: 20, fontWeight: 800, fontSize: 14, zIndex: 80 }}>{flash}</div>}

      {/* Empty / prepare state */}
      {!round && !loading && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E4DF', borderRadius: 12, padding: 28, textAlign: 'center' }}>
          {stats && stats.labeled > 0 && stats.labeled >= stats.total ? (
            <>
              <p style={{ fontSize: 15, fontWeight: 700, color: INK }}>🎉 All {stats.total} labeled — nice.</p>
              {(stats.reranScored || 0) > 0 ? (
                <p style={{ fontSize: 14, color: INK, marginTop: 8 }}>
                  Tuned resolver, re-scored against your labels: <strong style={{ color: GREEN }}>{stats.reranRight}/{stats.reranScored} correct</strong>
                  <span style={{ color: '#9C9C9C' }}> (was {stats.newRight}/{stats.scored} before the tune)</span>
                </p>
              ) : (
                <p style={{ fontSize: 13, color: '#6B6B6B', marginTop: 6 }}>Re-run the tuned resolver on the same 40 to see the lift on the exact cases you labeled (a few API credits, no re-labeling).</p>
              )}
              <button onClick={rerun} disabled={preparing}
                style={{ marginTop: 12, background: GREEN, color: '#FFFDFA', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: preparing ? 0.6 : 1 }}>
                {preparing ? `Re-running… ${stats.reranDone || 0}/${stats.labeled}` : '↻ Re-run tuned resolver on your labels'}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 15, fontWeight: 700, color: INK }}>Ready to play the last {TARGET}?</p>
              <p style={{ fontSize: 12.5, color: '#9C9C9C', margin: '6px 0 14px' }}>
                Prepare runs the new pipeline fresh on each record (Apify + up to ~{TARGET} Apollo credits, current side is free). You can start playing after the first few are ready.
              </p>
              <button onClick={prepare} disabled={preparing}
                style={{ background: INK, color: CREAM, border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: preparing ? 0.6 : 1 }}>
                {preparing ? `Preparing… ${stats?.total || 0}/${TARGET}` : `▶ Prepare & play`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Active round */}
      {round && (
        <div>
          {/* Known facts */}
          <div style={{ background: CREAM, border: '1px solid #EADFBF', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: '3px 16px' }}>
            {[['name', round.known.name], ['email', round.known.email], ['country', round.known.country], ['job level', round.known.jobLevel], ['work area', round.known.workArea]]
              .filter(([, v]) => v).map(([k, v]) => (
                <span key={k as string} style={{ fontSize: 12.5 }}><span style={{ color: '#9C7A2F' }}>{k}:</span> <strong style={{ color: INK, fontWeight: 700 }}>{v}</strong></span>
              ))}
          </div>

          {/* Two candidates */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
            <CandCard title="Current pipeline" cand={round.current} accent={AMBER} name={round.known.name} />
            <CandCard title="New pipeline" cand={round.proposed} accent={GREEN} name={round.known.name} />
          </div>

          {/* Decision */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {btn('✓ New is right', 'new', GREEN)}
            {btn('Current is right', 'current', AMBER)}
            {btn('Both right', 'both', '#546E7A')}
            {btn('Neither', 'neither', '#B3261E')}
            {btn('Skip', 'skip', '#FFFFFF')}
          </div>

          {/* Ground truth box */}
          <div style={{ border: '1px dashed #D8D2C6', borderRadius: 10, padding: 14, background: '#FBF8F2' }}>
            <button onClick={() => setShowTruth(s => !s)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: INK }}>
              {showTruth ? '▾' : '▸'} I researched this one — here&rsquo;s the real profile + how I found it
            </button>
            {showTruth && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                  <input value={truth.linkedinUrl} onChange={e => setTruth(t => ({ ...t, linkedinUrl: e.target.value }))} placeholder="real LinkedIn URL"
                    style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
                  <input value={truth.companyName} onChange={e => setTruth(t => ({ ...t, companyName: e.target.value }))} placeholder="real company"
                    style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
                  <input value={truth.jobTitle} onChange={e => setTruth(t => ({ ...t, jobTitle: e.target.value }))} placeholder="real title"
                    style={{ fontSize: 12.5, padding: '7px 9px', border: '1px solid #E8E4DF', borderRadius: 6 }} />
                </div>
                <textarea value={method} onChange={e => setMethod(e.target.value)} rows={3} placeholder="How did you find them? e.g. searched the email handle + their work area on Google, matched the company from the photo background, checked the city…"
                  style={{ width: '100%', marginTop: 8, fontSize: 12.5, padding: '8px 10px', border: '1px solid #E8E4DF', borderRadius: 6, resize: 'vertical' }} />
                <p style={{ fontSize: 11, color: '#9C9C9C', marginTop: 4 }}>Saved with whichever verdict you click. The method notes are what teach me your research heuristics.</p>
              </div>
            )}
          </div>

          {preparing && <p style={{ fontSize: 11, color: '#9C9C9C', marginTop: 10 }}>Preparing more rounds in the background… {stats?.total || 0}/{TARGET}</p>}
        </div>
      )}
    </div>
  )
}
