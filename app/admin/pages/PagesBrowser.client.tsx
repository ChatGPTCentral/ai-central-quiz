'use client'

import { useMemo, useState } from 'react'

// Every version of the result page, in one place, with a live preview and a
// link you can copy.
//
// This exists because the owner had to ask for result-page links in chat over
// and over, and got a different hand-assembled list each time. The variants are
// not a secret and they are not hard to enumerate — they were just never
// surfaced. Now every arm, stage, device and preview flag is a control here,
// and the URL is always one click from the clipboard.

const SITE = 'https://quiz.thecentral.ai'

import { RESULT_VARIANTS, type VariantMeta, type VariantResult } from '@/lib/result-variants'

type Variant = VariantMeta

const STAGES = [
  { key: 'S1_curious', label: 'Curious' },
  { key: 'S2_experimenter', label: 'Experimenter' },
  { key: 'S3_practitioner', label: 'Practitioner' },
  { key: 'S4_power_user', label: 'Power User' },
  { key: 'S5_builder', label: 'Builder' },
]

const PERSONAS = ['decision_maker', 'maker', 'operator', 'learner']

const INK = '#1A1A1A'
const MUTE = '#9C9C9C'
const LINE = '#E8E4DF'
const LATTE = '#FEF7E7'
const FULVOUS = '#E48715'

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string; title: string }> = {
  live:    { bg: '#2D6A26', fg: '#FFF',    label: 'LIVE',    title: 'A real visitor can be served this today' },
  retired: { bg: '#BE3B3B', fg: '#FFF',    label: 'RETIRED', title: 'It ran, it lost, kept only for reference' },
  preview: { bg: '#E8E4DF', fg: '#4A4A4A', label: 'PREVIEW', title: 'A toggle for looking at something. Never served on its own, so it has no conversion number' },
}

function StatusBadge({ status }: { status: string }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.preview
  return (
    <span title={st.title} style={{ fontSize: 9, fontWeight: 800, background: st.bg, color: st.fg, padding: '1px 5px', letterSpacing: '0.06em' }}>
      {st.label}
    </span>
  )
}

export default function PagesBrowser({ results }: { results: Record<string, VariantResult[]> }) {
  const [variant, setVariant] = useState<Variant>(RESULT_VARIANTS[0])
  const [stage, setStage] = useState('S2_experimenter')
  const [persona, setPersona] = useState('decision_maker')
  const [name, setName] = useState('Marco')
  const [score, setScore] = useState('62')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [internal, setInternal] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const url = useMemo(() => {
    const p = new URLSearchParams()
    if (name) p.set('name', name)
    if (score) p.set('score', score)
    p.set('persona', persona)
    p.set('stage', stage)
    for (const [k, v] of Object.entries(variant.params)) p.set(k, v)
    // Default ON: opening a preview should never be able to move a live
    // experiment. The owner's test clicks were a real risk to the numbers.
    if (internal) p.set('internal', '1')
    return `${SITE}/result?${p.toString()}`
  }, [name, score, persona, stage, variant, internal])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard blocked */ }
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${active ? INK : LINE}`,
    background: active ? INK : '#FFF', color: active ? LATTE : INK,
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 20, alignItems: 'start' }}>
      {/* ── controls ── */}
      <div style={{ border: `2px solid ${INK}`, background: '#FFF', padding: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', color: FULVOUS, textTransform: 'uppercase' }}>
          Version
        </div>
        {/* Grouped, and retired ones collapsed. Owner's call: archive rather
            than delete, because a variant that lost still carries the evidence
            for WHY we stopped, and deleting it means re-running the argument in
            three months. Kept out of the way, not out of reach. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {RESULT_VARIANTS.filter(v => v.status !== 'retired').map(v => (
            <button
              key={v.key}
              onClick={() => setVariant(v)}
              style={{
                textAlign: 'left', padding: '8px 10px', cursor: 'pointer',
                border: `2px solid ${variant.key === v.key ? INK : LINE}`,
                background: variant.key === v.key ? LATTE : '#FFF',
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {v.label}
                <StatusBadge status={v.status} />
              </div>
              <div style={{ fontSize: 11, color: MUTE, marginTop: 2, lineHeight: 1.35 }}>{v.note}</div>
              {/* What it actually DID. A preview has no arm, so it correctly
                  shows nothing rather than a misleading zero. */}
              {(results[v.key] || []).map(r => (
                <div key={r.experiment} style={{ marginTop: 5, fontSize: 10.5, color: '#4A4A4A', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', color: MUTE }}>{r.experiment}</span>
                  <span>{r.exposures.toLocaleString()} saw</span>
                  <span>{r.clickPct.toFixed(1)}% clicked</span>
                  <span style={{ fontWeight: 800, color: r.paidPct >= 5 ? '#2D6A26' : r.paidPct > 0 ? '#B26A00' : '#BE3B3B' }}>
                    {r.paidPct.toFixed(2)}% paid
                  </span>
                  {r.won && <span style={{ fontSize: 9, fontWeight: 800, background: '#E7B02F', color: '#333', padding: '0 4px' }}>WON</span>}
                </div>
              ))}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowArchived(v => !v)}
          style={{
            marginTop: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
            background: 'none', border: 'none', padding: '6px 0',
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', color: MUTE, textTransform: 'uppercase',
          }}
        >
          {showArchived ? '▾' : '▸'} Archived · {RESULT_VARIANTS.filter(v => v.status === 'retired').length} that lost
        </button>
        {showArchived && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {RESULT_VARIANTS.filter(v => v.status === 'retired').map(v => (
              <button
                key={v.key}
                onClick={() => setVariant(v)}
                style={{
                  textAlign: 'left', padding: '8px 10px', cursor: 'pointer', opacity: 0.85,
                  border: `2px solid ${variant.key === v.key ? INK : LINE}`,
                  background: variant.key === v.key ? LATTE : '#FBFAF7',
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 800, color: INK, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {v.label}
                  <StatusBadge status={v.status} />
                </div>
                <div style={{ fontSize: 11, color: MUTE, marginTop: 2, lineHeight: 1.35 }}>{v.note}</div>
                {(results[v.key] || []).map(r => (
                  <div key={r.experiment} style={{ marginTop: 5, fontSize: 10.5, color: '#4A4A4A', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', color: MUTE }}>{r.experiment}</span>
                    <span>{r.exposures.toLocaleString()} saw</span>
                    <span>{r.clickPct.toFixed(1)}% clicked</span>
                    <span style={{ fontWeight: 800, color: r.paidPct >= 5 ? '#2D6A26' : r.paidPct > 0 ? '#B26A00' : '#BE3B3B' }}>
                      {r.paidPct.toFixed(2)}% paid
                    </span>
                  </div>
                ))}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', color: FULVOUS, textTransform: 'uppercase' }}>
          Who sees it
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {STAGES.map(s => (
            <button key={s.key} onClick={() => setStage(s.key)} style={chip(stage === s.key)}>{s.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
          {PERSONAS.map(p => (
            <button key={p} onClick={() => setPersona(p)} style={chip(persona === p)}>{p.replace('_', ' ')}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="name"
            style={{ flex: 1, minWidth: 0, border: `2px solid ${LINE}`, padding: '6px 8px', fontSize: 12.5 }} />
          <input value={score} onChange={e => setScore(e.target.value)} placeholder="score"
            style={{ width: 64, border: `2px solid ${LINE}`, padding: '6px 8px', fontSize: 12.5 }} />
        </div>

        <div style={{ marginTop: 16, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', color: FULVOUS, textTransform: 'uppercase' }}>
          Preview
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
          <button onClick={() => setDevice('desktop')} style={chip(device === 'desktop')}>Desktop</button>
          <button onClick={() => setDevice('mobile')} style={chip(device === 'mobile')}>Mobile</button>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 11.5, color: INK, lineHeight: 1.4 }}>
            <strong>Don&rsquo;t count my clicks</strong>
            <span style={{ color: MUTE, display: 'block' }}>
              Adds <code>internal=1</code>. Leave this on — a handful of test clicks can move an experiment arm by several points.
            </span>
          </span>
        </label>

        <div style={{ marginTop: 14, border: `2px solid ${INK}`, background: LATTE, padding: 10 }}>
          <div style={{ fontSize: 10.5, fontFamily: 'monospace', wordBreak: 'break-all', color: INK, lineHeight: 1.4 }}>{url}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={copy} style={{ ...chip(false), background: INK, color: LATTE, border: `2px solid ${INK}` }}>
              {copied ? 'copied ✓' : 'copy link'}
            </button>
            <a href={url} target="_blank" rel="noreferrer" style={{ ...chip(false), textDecoration: 'none', display: 'inline-block' }}>
              open ↗
            </a>
          </div>
        </div>
      </div>

      {/* ── live preview ── */}
      <div style={{ border: `2px solid ${INK}`, background: '#F4F1EC', padding: 14, display: 'flex', justifyContent: 'center' }}>
        <iframe
          key={url + device}
          src={url}
          title="Result page preview"
          style={{
            width: device === 'mobile' ? 390 : '100%',
            maxWidth: device === 'mobile' ? 390 : 1280,
            height: 780,
            border: `2px solid ${INK}`,
            background: '#FFF',
          }}
        />
      </div>
    </div>
  )
}
