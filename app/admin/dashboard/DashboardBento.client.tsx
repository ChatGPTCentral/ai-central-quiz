'use client'

// Dashboard bento (redesign 2a): one framed plate — KPI row with the
// inverted north-star cell, the AI adoption ladder as the FILTER (click a
// rung and every KPI + all 9 breakdowns recompute for that segment), the
// Stage × quiz conversions table, and 9 hard-edge breakdown charts.
// Pure client-side state over the pre-fetched rows; no refetch per click.

import { useMemo, useState } from 'react'
import { STAGES } from '@/lib/segmentation-v2'
import { countryFlag } from '@/lib/country-flags'
import { COMPANY_SIZE_ORDER } from '@/lib/enrichment/standardize'

export interface BentoRow {
  stage: string
  age: string | null
  sex: string | null
  country: string | null
  industry: string | null
  role: string | null
  size: string | null
  utmQuiz: string | null
  utmNewsletter: string | null
  ltv: number
  netNew: boolean
}

const INK = '#1A1A1A'
const MUTE = '#9C9C9C'
const HAIR = '#E8E2D4'
const ROWHAIR = '#F1ECE2'
const TRACK = '#F1ECE0'
const LATTE = '#FEF7E7'

const AGE_ORDER = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+']
const SEX_ORDER = ['Male', 'Female']

const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTE }
const panelTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: INK }
const tnum: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

function countBy(rows: BentoRow[], pick: (r: BentoRow) => string | null | undefined): { label: string; value: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const v = pick(r)
    if (!v) continue
    m.set(v, (m.get(v) || 0) + 1)
  }
  return Array.from(m.entries()).map(([label, value]) => ({ label, value }))
}

/** Horizontal hard-bar list (label 120px / bar / tabular count). */
function HBarPanel({ title, rows, color, borderLeft }: { title: string; rows: { label: string; value: number }[]; color: string; borderLeft: boolean }) {
  const total = rows.reduce((a, b) => a + b.value, 0)
  const max = Math.max(...rows.map(r => r.value), 1)
  return (
    <div style={{ padding: '18px 24px', borderTop: '1px solid #333333', borderLeft: borderLeft ? '1px solid #333333' : 'none', minWidth: 0 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
        <span style={panelTitle}>{title}</span>
        <span style={{ fontSize: 10.5, color: MUTE, ...tnum }}>N = {total.toLocaleString()}</span>
      </div>
      <div className="flex flex-col" style={{ gap: 8 }}>
        {rows.length === 0 && <span style={{ fontSize: 11.5, color: MUTE }}>No data in this slice.</span>}
        {rows.map(r => (
          <div key={r.label} className="flex items-center" style={{ gap: 10, fontSize: 11.5 }}>
            <span style={{ width: 120, flexShrink: 0, color: '#4A4A4A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.label}>{r.label}</span>
            <span style={{ flex: 1, height: 11, background: TRACK, position: 'relative' }}>
              <span style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${(r.value / max) * 100}%`, background: color }} />
            </span>
            <span style={{ width: 36, textAlign: 'right', fontWeight: 700, ...tnum }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DashboardBento({ rows, sample }: { rows: BentoRow[]; sample: 'launch' | 'all' }) {
  const [stageFilter, setStageFilter] = useState<string | null>(null)

  // Whole-cohort ladder (the selector never filters itself).
  const ladderDefs = useMemo(() => [STAGES.find(s => s.key === 'unknown')!, ...STAGES.filter(s => s.key !== 'unknown')], [])
  const ladderCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.stage, (m.get(r.stage) || 0) + 1)
    return m
  }, [rows])
  const ladderMax = Math.max(...ladderDefs.map(d => ladderCounts.get(d.key) || 0), 1)

  // The filtered slice everything else reads from.
  const slice = useMemo(() => (stageFilter ? rows.filter(r => r.stage === stageFilter) : rows), [rows, stageFilter])

  // ── KPIs ──
  const takers = slice.length
  const netNewPaid = slice.filter(r => r.netNew)
  const revenueAssoc = slice.filter(r => r.ltv > 0).length
  const cvr = takers > 0 ? (netNewPaid.length / takers) * 100 : 0
  const assocPct = takers > 0 ? (revenueAssoc / takers) * 100 : 0
  const netNewRevenue = netNewPaid.reduce((a, b) => a + b.ltv, 0)

  // ── Breakdowns (all on the slice) ──
  const fixedOrder = (data: { label: string; value: number }[], order: string[]) =>
    order.map(l => ({ label: l, value: data.find(d => d.label === l)?.value || 0 })).filter(d => d.value > 0)
  const desc = (data: { label: string; value: number }[], top = 6) => [...data].sort((a, b) => b.value - a.value).slice(0, top)

  const ageData = fixedOrder(countBy(slice, r => r.age), AGE_ORDER)
  const sexData = fixedOrder(countBy(slice, r => r.sex), SEX_ORDER)
  const geoData = desc(countBy(slice, r => r.country)).map(d => ({ ...d, label: `${countryFlag(d.label)} ${d.label}` }))
  const industryData = desc(countBy(slice, r => r.industry))
  const roleData = desc(countBy(slice, r => r.role))
  const sizeData = COMPANY_SIZE_ORDER
    .map(l => ({ label: l, value: countBy(slice, r => r.size).find(d => d.label === l)?.value || 0 }))
    .filter(d => d.value > 0)
  const paidChannel = desc(countBy(slice, r => (r.ltv > 0 ? (r.utmNewsletter || r.utmQuiz || 'Direct') : null)))
  const nlData = desc(countBy(slice, r => r.utmNewsletter || 'Direct / unknown'))
  const quizUtmData = desc(countBy(slice, r => r.utmQuiz || 'Direct / unknown'))

  const ageMax = Math.max(...ageData.map(a => a.value), 1)
  const filtDef = stageFilter ? ladderDefs.find(d => d.key === stageFilter) : null

  return (
    <div>
      {/* Active-filter chip lives next to the page title; rendered here so the
          state stays in one component — the page slots it via absolute layout */}
      {filtDef && (
        <button
          onClick={() => setStageFilter(null)}
          className="inline-flex items-center"
          style={{ gap: 8, border: '1px solid #E48715', background: LATTE, color: '#B26A00', padding: '4px 10px', fontSize: 11.5, fontWeight: 700, marginBottom: 12 }}
        >
          {filtDef.emoji} {filtDef.label} · {(ladderCounts.get(filtDef.key) || 0).toLocaleString()} people <span style={{ fontSize: 12 }}>✕</span>
        </button>
      )}

      <div style={{ border: '2px solid #333333', background: '#FFFFFF' }}>
        {/* ── Row 1 · KPI cells ── */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div style={{ padding: '20px 24px', background: '#333333' }}>
            <div style={{ ...eyebrow, color: '#C9C3B8' }}>CVR · quiz → paid</div>
            <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', color: '#E7B02F', lineHeight: 1, marginTop: 10, ...tnum }}>{cvr.toFixed(1)}%</div>
            <div style={{ fontSize: 11, color: 'rgba(255,253,250,0.65)', marginTop: 8 }}>{netNewPaid.length} paid first time after their quiz</div>
          </div>
          {[
            { label: sample === 'launch' ? 'Quiz-takers' : 'Records', v: takers.toLocaleString(), hint: stageFilter ? 'in the selected rung' : (sample === 'launch' ? 'unique people since launch' : 'all rows in scope') },
            { label: 'Revenue-associated', v: `${assocPct.toFixed(1)}%`, hint: `${revenueAssoc.toLocaleString()} with any Stripe revenue` },
            { label: 'Net-new revenue', v: `$${netNewRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, hint: 'LTV of people who paid after the quiz' },
          ].map(k => (
            <div key={k.label} style={{ padding: '20px 24px', borderLeft: '1px solid #333333' }}>
              <div style={eyebrow}>{k.label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: INK, lineHeight: 1, marginTop: 12, ...tnum }}>{k.v}</div>
              <div style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>{k.hint}</div>
            </div>
          ))}
        </div>

        {/* ── Row 2 · ladder (the filter) + stage table ── */}
        <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', borderTop: '1px solid #333333' }}>
          <div style={{ padding: '18px 24px', minWidth: 0 }}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: 14 }}>
              <span style={panelTitle}>AI adoption ladder</span>
              <span style={{ fontSize: 10.5, color: '#B26A00', fontWeight: 700 }}>click a rung to focus every chart</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', border: '1px solid #333333' }}>
              {ladderDefs.map((def, i) => {
                const count = ladderCounts.get(def.key) || 0
                const pct = rows.length > 0 ? (count / rows.length) * 100 : 0
                const selected = stageFilter === def.key
                const dimmed = stageFilter !== null && !selected
                return (
                  <button
                    key={def.key}
                    onClick={() => setStageFilter(selected ? null : def.key)}
                    className="text-left transition-colors"
                    style={{
                      padding: '12px 14px 14px',
                      borderLeft: i > 0 ? '1px solid #333333' : 'none',
                      borderTop: `3px solid ${selected ? '#E48715' : 'transparent'}`,
                      background: selected ? LATTE : 'transparent',
                      opacity: dimmed ? 0.35 : 1,
                      minWidth: 0,
                    }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.background = LATTE }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{def.emoji} {def.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: INK, marginTop: 6, ...tnum }}>{count.toLocaleString()}</div>
                    <div style={{ fontSize: 10.5, color: MUTE, marginTop: 1, ...tnum }}>{pct.toFixed(0)}%</div>
                    <div style={{ height: 6, background: TRACK, marginTop: 8 }}>
                      <div style={{ height: '100%', width: `${(count / ladderMax) * 100}%`, background: def.color }} />
                    </div>
                  </button>
                )
              })}
            </div>
            <div style={{ fontSize: 10.5, color: MUTE, marginTop: 10 }}>Counts stay whole-cohort; the selected rung filters everything else. Money is measured per rung, never an input.</div>
          </div>

          <div style={{ padding: '18px 24px', borderLeft: '1px solid #333333', minWidth: 0 }}>
            <div style={{ ...panelTitle, marginBottom: 12 }}>Stage × quiz conversions</div>
            <div className="grid" style={{ gridTemplateColumns: 'minmax(104px,1.3fr) 44px 44px 52px 64px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B6B6B', borderBottom: `1px solid ${HAIR}` }}>
              <span style={{ padding: '5px 0 5px 6px' }}>Stage</span>
              <span style={{ padding: '5px 0', textAlign: 'right' }}>N</span>
              <span style={{ padding: '5px 0', textAlign: 'right' }}>Net</span>
              <span style={{ padding: '5px 0', textAlign: 'right' }}>CVR</span>
              <span style={{ padding: '5px 0', textAlign: 'right' }}>Revenue</span>
            </div>
            {ladderDefs.map(def => {
              const sRows = rows.filter(r => r.stage === def.key)
              const paying = sRows.filter(r => r.netNew)
              const revenue = paying.reduce((a, b) => a + b.ltv, 0)
              const conv = sRows.length > 0 ? (paying.length / sRows.length) * 100 : 0
              return (
                <div key={def.key} className="grid items-center" style={{ gridTemplateColumns: 'minmax(104px,1.3fr) 44px 44px 52px 64px', fontSize: 11.5, borderBottom: `1px solid ${ROWHAIR}`, background: stageFilter === def.key ? LATTE : 'transparent' }}>
                  <span className="flex items-center" style={{ padding: '6px 0 6px 6px', fontWeight: 700, gap: 7, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ width: 7, height: 7, background: def.color, flexShrink: 0 }} />{def.emoji} {def.label}
                  </span>
                  <span style={{ padding: '6px 0', textAlign: 'right', ...tnum }}>{sRows.length}</span>
                  <span style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, ...tnum }}>{paying.length}</span>
                  <span style={{ padding: '6px 0', textAlign: 'right', color: '#046BB1', fontWeight: 700, ...tnum }}>{conv.toFixed(1)}%</span>
                  <span style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#62A758', ...tnum }}>${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Rows 3-5 · nine breakdowns, all on the slice ── */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {/* Age — vertical hard bars */}
          <div style={{ padding: '18px 24px', borderTop: '1px solid #333333', minWidth: 0 }}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
              <span style={panelTitle}>Age</span>
              <span style={{ fontSize: 10.5, color: MUTE, ...tnum }}>N = {ageData.reduce((a, b) => a + b.value, 0).toLocaleString()}</span>
            </div>
            <div className="flex items-end" style={{ gap: 10, height: 118, borderBottom: '1px solid #333333', padding: '0 2px' }}>
              {ageData.map(a => (
                <div key={a.label} className="flex flex-col items-center justify-end" style={{ flex: 1, height: '100%' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, ...tnum }}>{a.value}</span>
                  <div style={{ width: '70%', height: `${(a.value / ageMax) * 82}%`, background: '#3B4C99', marginTop: 4 }} />
                </div>
              ))}
              {ageData.length === 0 && <span style={{ fontSize: 11.5, color: MUTE, alignSelf: 'center', margin: '0 auto' }}>No data in this slice.</span>}
            </div>
            <div className="flex" style={{ marginTop: 6 }}>
              {ageData.map(a => <span key={a.label} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#6B6B6B' }}>{a.label}</span>)}
            </div>
          </div>

          <HBarPanel title="Sex" rows={sexData} color="#E26F8E" borderLeft />
          <HBarPanel title="Geography" rows={geoData} color="#2D8879" borderLeft />
          <HBarPanel title="Industry" rows={industryData} color="#62A758" borderLeft={false} />
          <HBarPanel title="Role" rows={roleData} color="#046BB1" borderLeft />
          <HBarPanel title="Company size" rows={sizeData} color="#E7B02F" borderLeft />
          <HBarPanel title="Paid · channel" rows={paidChannel} color="#BE3B3B" borderLeft={false} />
          <HBarPanel title="Newsletter · Beehiiv UTM" rows={nlData} color="#3B4C99" borderLeft />
          <HBarPanel title="Quiz · landing UTM" rows={quizUtmData} color="#E48715" borderLeft />
        </div>
      </div>
    </div>
  )
}
