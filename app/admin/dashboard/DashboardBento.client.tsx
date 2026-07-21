'use client'

// Dashboard bento v2 — owner feedback round:
//   KPI order: quiz takers · net-new subscribers · CVR net-new · quiz revenue
//   Global numbers ↔ percentages toggle for every chart
//   Adoption ladder back to a clickable VERTICAL bar chart (it is the filter)
//   Stage × conversions LEFT of the ladder · Sex vertical · Company size and
//   Age vertical with a dotted normal-distribution overlay · Age grouped by
//   generation (under 25 / 26-45 / 46-65 / over 65) · plain-language UTM
//   titles · the funnel lives HERE now (one Jul-5 window, quiz-completed and
//   net-new come from the same rows as every other number on the page) ·
//   CTA placements table with a thumbnail of the component that was shown.

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
export interface FunnelEventCounts { landing: number; started: number; checkout: number }
export interface PlacementStat { placement: string; views: number; clicks: number }

const INK = '#1A1A1A'
const MUTE = '#9C9C9C'
const HAIR = '#E8E2D4'
const ROWHAIR = '#F1ECE2'
const TRACK = '#F1ECE0'
const LATTE = '#FEF7E7'

const GENERATIONS = ['under 25', '26-45', '46-65', 'over 65'] as const
function generationOf(bracket: string): string | null {
  switch (bracket) {
    case '18-25': return 'under 25'
    case '26-35': case '36-45': return '26-45'
    case '46-55': case '56-65': return '46-65'
    case '65+': return 'over 65'
    default: return null
  }
}

const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTE }
const panelTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: INK }
const tnum: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

/** CTA placement thumbnail — the actual component shown, screenshotted into
 *  public/admin-placements/<placement>.png. Falls back to a clean "no preview"
 *  tile for placements we haven't captured (or that only render mid-video). */
function PlacementThumb({ placement }: { placement: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span style={{ width: 138, height: 56, border: '1px dashed #C9C2B4', background: '#FBF7EE', color: '#B7B0A4', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        no preview
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/admin-placements/${placement}.png`}
      alt={placement}
      style={{ width: 138, height: 56, objectFit: 'cover', objectPosition: 'top', border: '1px solid #C9C2B4', background: TRACK }}
      onError={() => setFailed(true)}
    />
  )
}

function countBy(rows: BentoRow[], pick: (r: BentoRow) => string | null | undefined): { label: string; value: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const v = pick(r)
    if (!v) continue
    m.set(v, (m.get(v) || 0) + 1)
  }
  return Array.from(m.entries()).map(([label, value]) => ({ label, value }))
}

/** Dotted gaussian overlay fit to the bars (mean/σ over ordinal positions). */
function NormalCurve({ data, height }: { data: { value: number }[]; height: number }) {
  if (data.length < 2) return null
  const total = data.reduce((a, b) => a + b.value, 0)
  if (total === 0) return null
  const mean = data.reduce((a, b, i) => a + i * b.value, 0) / total
  const variance = data.reduce((a, b, i) => a + b.value * (i - mean) ** 2, 0) / total
  const sd = Math.sqrt(variance) || 0.5
  const maxV = Math.max(...data.map(d => d.value), 1)
  const W = 100
  const pts: string[] = []
  for (let x = 0; x <= 60; x++) {
    const pos = (x / 60) * (data.length - 1)
    const y = Math.exp(-((pos - mean) ** 2) / (2 * sd * sd))
    const px = ((pos + 0.5) / data.length) * W
    const py = height - y * maxV / maxV * (height - 14)
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`)
  }
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <polyline points={pts.join(' ')} fill="none" stroke="#333333" strokeWidth="1.4" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.65" />
    </svg>
  )
}

/** Vertical hard-bar chart, optional normal-curve overlay, N/% aware. */
function VBarPanel({ title, data, color, pct, borderLeft, curve, note, height = 118 }: {
  title: string; data: { label: string; value: number }[]; color: string
  pct: boolean; borderLeft: boolean; curve?: boolean; note?: string; height?: number
}) {
  const total = data.reduce((a, b) => a + b.value, 0)
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ padding: '18px 24px', borderTop: '1px solid #333333', borderLeft: borderLeft ? '1px solid #333333' : 'none', minWidth: 0 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
        <span style={panelTitle}>{title}</span>
        <span style={{ fontSize: 10.5, color: MUTE, ...tnum }}>N = {total.toLocaleString()}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div className="flex items-end" style={{ gap: 10, height, borderBottom: '1px solid #333333', padding: '0 2px' }}>
          {data.map(d => (
            <div key={d.label} className="flex flex-col items-center justify-end" style={{ flex: 1, height: '100%', minWidth: 0 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, ...tnum }}>
                {pct ? `${total > 0 ? Math.round((d.value / total) * 100) : 0}%` : d.value}
              </span>
              <div style={{ width: '70%', height: `${(d.value / max) * (100 - 18)}%`, background: color, marginTop: 4 }} />
            </div>
          ))}
          {data.length === 0 && <span style={{ fontSize: 11.5, color: MUTE, alignSelf: 'center', margin: '0 auto' }}>No data in this slice.</span>}
        </div>
        {curve && <NormalCurve data={data} height={height} />}
      </div>
      <div className="flex" style={{ marginTop: 6 }}>
        {data.map(d => <span key={d.label} className="truncate" style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#6B6B6B' }} title={d.label}>{d.label}</span>)}
      </div>
      {note && <div style={{ fontSize: 10, color: MUTE, marginTop: 6 }}>{note}</div>}
    </div>
  )
}

/** Horizontal hard-bar list, N/% aware. */
function HBarPanel({ title, rows, color, pct, borderLeft }: { title: string; rows: { label: string; value: number }[]; color: string; pct: boolean; borderLeft: boolean }) {
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
              <span style={{ position: 'absolute', inset: '0 auto 0 0', width: `${(r.value / max) * 100}%`, background: color }} />
            </span>
            <span style={{ width: 42, textAlign: 'right', fontWeight: 700, ...tnum }}>
              {pct ? `${total > 0 ? Math.round((r.value / total) * 100) : 0}%` : r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DashboardBento({ rows, sample, funnelEvents, placements }: {
  rows: BentoRow[]; sample: 'launch' | 'all'; funnelEvents: FunnelEventCounts; placements: PlacementStat[]
}) {
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [pct, setPct] = useState(true) // percentages by default (owner pref)

  const ladderDefs = useMemo(() => [STAGES.find(s => s.key === 'unknown')!, ...STAGES.filter(s => s.key !== 'unknown')], [])
  const ladderCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.stage, (m.get(r.stage) || 0) + 1)
    return m
  }, [rows])
  const ladderMax = Math.max(...ladderDefs.map(d => ladderCounts.get(d.key) || 0), 1)

  const slice = useMemo(() => (stageFilter ? rows.filter(r => r.stage === stageFilter) : rows), [rows, stageFilter])

  // ── KPIs (owner's order) ──
  const takers = slice.length
  const netNewPeople = slice.filter(r => r.netNew)
  const cvr = takers > 0 ? (netNewPeople.length / takers) * 100 : 0
  const quizRevenue = netNewPeople.reduce((a, b) => a + b.ltv, 0)

  // ── Breakdowns on the slice ──
  const desc = (data: { label: string; value: number }[], top = 6) => [...data].sort((a, b) => b.value - a.value).slice(0, top)
  const genderData = ['Male', 'Female'].map(l => ({ label: l, value: countBy(slice, r => r.sex).find(d => d.label === l)?.value || 0 })).filter(d => d.value > 0)
  const ageGenData = GENERATIONS.map(g => ({ label: g, value: slice.filter(r => r.age && generationOf(r.age) === g).length }))
  const sizeData = COMPANY_SIZE_ORDER.map(l => ({ label: l, value: countBy(slice, r => r.size).find(d => d.label === l)?.value || 0 }))
  const geoData = desc(countBy(slice, r => r.country)).map(d => ({ ...d, label: `${countryFlag(d.label)} ${d.label}` }))
  const industryData = desc(countBy(slice, r => r.industry))
  const roleData = desc(countBy(slice, r => r.role))
  const paidChannel = desc(countBy(slice, r => (r.ltv > 0 ? (r.utmNewsletter || r.utmQuiz || 'Direct') : null)))
  const nlData = desc(countBy(slice, r => r.utmNewsletter || 'Direct / unknown'))
  const quizUtmData = desc(countBy(slice, r => r.utmQuiz || 'Direct / unknown'))

  const filtDef = stageFilter ? ladderDefs.find(d => d.key === stageFilter) : null

  // ── Funnel stations: one Jul-5 window; completed + paid come from the SAME
  //    rows as every KPI above (whole cohort, not the stage slice). ──
  const wholeNetNew = rows.filter(r => r.netNew).length
  const stations = [
    { label: 'Landing view', n: funnelEvents.landing, last: false },
    { label: 'Quiz started', n: funnelEvents.started, last: false },
    { label: 'Quiz completed', n: rows.length, last: false },
    { label: 'Checkout clicked', n: funnelEvents.checkout, last: false },
    { label: 'Net-new paid', n: wholeNetNew, last: true },
  ]
  const FX = [20, 272, 524, 776, 1028]
  const FCY = 120
  const fMax = Math.max(...stations.map(s => s.n), 1)
  const fh = stations.map(s => Math.sqrt(s.n) / Math.sqrt(fMax) * 150)
  const F_FILLS = ['rgba(4,107,177,0.85)', 'rgba(4,107,177,0.6)', 'rgba(4,107,177,0.38)', 'rgba(4,107,177,0.22)']
  const segs = stations.slice(0, -1).map((s, i) => {
    const x1 = FX[i] + 10, x2 = FX[i + 1]
    return {
      pts: `${x1},${(FCY - fh[i] / 2).toFixed(1)} ${x2},${(FCY - fh[i + 1] / 2).toFixed(1)} ${x2},${(FCY + fh[i + 1] / 2).toFixed(1)} ${x1},${(FCY + fh[i] / 2).toFixed(1)}`,
      fill: F_FILLS[i], midX: (x1 + x2) / 2,
      rate: s.n > 0 ? (stations[i + 1].n / s.n) * 100 : 0,
      darkLabel: i >= 2,
    }
  })

  const bestCtr = placements.reduce<string | null>((best, p) => {
    if (!p.views || !p.clicks) return best
    const ctr = p.clicks / p.views
    const bp = placements.find(x => x.placement === best)
    return !bp || !bp.views || ctr > bp.clicks / bp.views ? p.placement : best
  }, null)

  return (
    <div>
      {/* Toggle row + active filter chip */}
      <div className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
        <div className="inline-flex" style={{ border: '1px solid #333333' }}>
          <button onClick={() => setPct(false)} style={{ padding: '5px 12px', fontSize: 11.5, fontWeight: 700, background: !pct ? '#333333' : 'transparent', color: !pct ? '#FFFDFA' : '#6B6B6B' }}>Numbers</button>
          <button onClick={() => setPct(true)} style={{ padding: '5px 12px', fontSize: 11.5, fontWeight: 700, borderLeft: '1px solid #333333', background: pct ? '#333333' : 'transparent', color: pct ? '#FFFDFA' : '#6B6B6B' }}>Percentages</button>
        </div>
        {filtDef && (
          <button onClick={() => setStageFilter(null)} className="inline-flex items-center" style={{ gap: 8, border: '1px solid #E48715', background: LATTE, color: '#B26A00', padding: '4px 10px', fontSize: 11.5, fontWeight: 700 }}>
            {filtDef.emoji} {filtDef.label} · {(ladderCounts.get(filtDef.key) || 0).toLocaleString()} people <span style={{ fontSize: 12 }}>✕</span>
          </button>
        )}
      </div>

      <div style={{ border: '2px solid #333333', background: '#FFFFFF' }}>
        {/* ── Row 1 · KPIs in the owner's order ── */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { label: sample === 'launch' ? 'Total quiz takers' : 'Total records', v: takers.toLocaleString(), hint: stageFilter ? 'in the selected rung' : 'unique people, one shared cohort', dark: false },
            { label: 'Net-new subscribers', v: netNewPeople.length.toLocaleString(), hint: 'first-ever charge AFTER their quiz', dark: false },
            { label: 'CVR · net new', v: `${cvr.toFixed(1)}%`, hint: 'net-new ÷ quiz takers (the north star)', dark: true },
            { label: 'Quiz revenue', v: `$${quizRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, hint: 'sum of payments from net-new people', dark: false },
          ].map((k, i) => (
            <div key={k.label} style={{ padding: '20px 24px', background: k.dark ? '#333333' : 'transparent', borderLeft: i > 0 ? '1px solid #333333' : 'none' }}>
              <div style={{ ...eyebrow, color: k.dark ? '#C9C3B8' : MUTE }}>{k.label}</div>
              <div style={{ fontSize: k.dark ? 36 : 30, fontWeight: 800, letterSpacing: '-0.03em', color: k.dark ? '#E7B02F' : INK, lineHeight: 1, marginTop: k.dark ? 10 : 12, ...tnum }}>{k.v}</div>
              <div style={{ fontSize: 11, color: k.dark ? 'rgba(255,253,250,0.65)' : MUTE, marginTop: 8 }}>{k.hint}</div>
            </div>
          ))}
        </div>

        {/* ── Row 2 · funnel (same cohort, one clock) ── */}
        <div style={{ borderTop: '1px solid #333333' }}>
          <div className="flex items-baseline justify-between" style={{ padding: '12px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}` }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>The funnel · everything since Jul 5</span>
            <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>completed + paid come from the same rows as the KPIs · band height on a square-root scale · whole cohort (the rung filter doesn&rsquo;t apply to page events)</span>
          </div>
          {/* Capped width + shorter viewBox so the funnel reads as a compact
              diagram, not a full-bleed hero. */}
          <div style={{ padding: '12px 20px 4px', maxWidth: 780, margin: '0 auto' }}>
            <svg viewBox="0 0 1060 210" style={{ width: '100%', display: 'block' }} preserveAspectRatio="xMidYMid meet">
              {segs.map((g, i) => <polygon key={i} points={g.pts} fill={g.fill} />)}
              {stations.map((s, i) => (
                <rect key={i} x={FX[i]} y={(FCY - fh[i] / 2 - 6).toFixed(1)} width={10} height={(fh[i] + 12).toFixed(1)} fill={s.last ? '#62A758' : '#333333'} />
              ))}
              {stations.map((s, i) => {
                const end = i === stations.length - 1
                return (
                  <g key={`t${i}`}>
                    <text x={end ? 1038 : FX[i]} y={14} textAnchor={end ? 'end' : 'start'} fill={MUTE} style={{ font: '700 10px Inter,sans-serif', letterSpacing: '0.06em' }}>{s.label}</text>
                    <text x={end ? 1038 : FX[i]} y={34} textAnchor={end ? 'end' : 'start'} fill={s.last ? '#62A758' : INK} style={{ font: '800 18px Inter,sans-serif' }}>{s.n.toLocaleString()}</text>
                  </g>
                )
              })}
              {segs.map((g, i) => (
                <g key={`r${i}`}>
                  <text x={g.midX} y={FCY + 5} textAnchor="middle" fill={g.darkLabel ? '#046BB1' : '#FFFDFA'} style={{ font: '800 13px Inter,sans-serif' }}>{g.rate.toFixed(0)}%</text>
                  <text x={g.midX} y={FCY + 21} textAnchor="middle" fill={g.darkLabel ? '#6B6B6B' : 'rgba(255,253,250,0.75)'} style={{ font: '500 9px Inter,sans-serif' }}>continue</text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* ── Row 3 · Stage × conversions LEFT · ladder bar chart RIGHT ── */}
        <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', borderTop: '1px solid #333333' }}>
          <div style={{ padding: '18px 24px', minWidth: 0 }}>
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

          {/* Ladder: clickable vertical bars (whole cohort — it is the selector) */}
          <div style={{ padding: '18px 24px', borderLeft: '1px solid #333333', minWidth: 0 }}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: 14 }}>
              <span style={panelTitle}>AI adoption ladder</span>
              <span style={{ fontSize: 10.5, color: '#B26A00', fontWeight: 700 }}>click a bar to focus every chart</span>
            </div>
            <div className="flex items-end" style={{ gap: 8, height: 170, borderBottom: '1px solid #333333', padding: '0 2px' }}>
              {ladderDefs.map(def => {
                const count = ladderCounts.get(def.key) || 0
                const share = rows.length > 0 ? (count / rows.length) * 100 : 0
                const selected = stageFilter === def.key
                const dimmed = stageFilter !== null && !selected
                return (
                  <button
                    key={def.key}
                    onClick={() => setStageFilter(selected ? null : def.key)}
                    className="flex flex-col items-center justify-end"
                    style={{ flex: 1, height: '100%', minWidth: 0, opacity: dimmed ? 0.35 : 1, background: selected ? LATTE : 'transparent', borderTop: `3px solid ${selected ? '#E48715' : 'transparent'}` }}
                    title={`${def.label} · ${count.toLocaleString()}`}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, ...tnum }}>{pct ? `${Math.round(share)}%` : count.toLocaleString()}</span>
                    <div style={{ width: '68%', height: `${(count / ladderMax) * 74}%`, background: def.color, marginTop: 4 }} />
                  </button>
                )
              })}
            </div>
            <div className="flex" style={{ marginTop: 6 }}>
              {ladderDefs.map(def => (
                <span key={def.key} className="truncate" style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: '#6B6B6B' }} title={def.label}>{def.emoji} {def.label}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Rows 4-6 · breakdowns ── */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <VBarPanel title="Age" data={ageGenData} color="#3B4C99" pct={pct} borderLeft={false} curve note="grouped by generation · dotted line = fitted normal distribution" />
          <VBarPanel title="Sex" data={genderData} color="#E26F8E" pct={pct} borderLeft />
          <HBarPanel title="Geography" rows={geoData} color="#2D8879" pct={pct} borderLeft />
          <HBarPanel title="Industry" rows={industryData} color="#62A758" pct={pct} borderLeft={false} />
          <HBarPanel title="Role" rows={roleData} color="#046BB1" pct={pct} borderLeft />
          <VBarPanel title="Company size" data={sizeData} color="#E7B02F" pct={pct} borderLeft curve note="dotted line = fitted normal distribution" />
          <HBarPanel title="What's the source of subscribers?" rows={nlData} color="#3B4C99" pct={pct} borderLeft={false} />
          <HBarPanel title="What's the source of quiz takers?" rows={quizUtmData} color="#E48715" pct={pct} borderLeft />
          <HBarPanel title="What's the source of paid subs?" rows={paidChannel} color="#BE3B3B" pct={pct} borderLeft />
        </div>

        {/* ── Row 7 · CTA placements with the component that was shown ── */}
        <div style={{ borderTop: '1px solid #333333' }}>
          <div className="flex items-baseline justify-between" style={{ padding: '12px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}` }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>CTA view → click by placement</span>
            <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>unique viewers vs clickers, since Jul 5</span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '158px 1fr 80px 76px 62px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B6B6B', borderBottom: `1px solid ${HAIR}`, padding: '0 20px' }}>
            <span style={{ padding: '8px 0' }}>Shown</span><span style={{ padding: '8px 0' }}>Placement</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Viewers</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Clickers</span><span style={{ padding: '8px 0', textAlign: 'right' }}>CTR</span>
          </div>
          {placements.length === 0 && <p style={{ padding: '10px 20px', fontSize: 12, color: MUTE }}>No placement events yet.</p>}
          {placements.map(p => (
            <div key={p.placement} className="grid items-center hover:bg-[#FEF7E7]" style={{ gridTemplateColumns: '158px 1fr 80px 76px 62px', fontSize: 12, borderBottom: `1px solid ${ROWHAIR}`, padding: '6px 20px' }}>
              <PlacementThumb placement={p.placement} />
              <span className="flex items-center" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: INK, gap: 8, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.placement}</span>
                {bestCtr === p.placement && <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: '#E7B02F', color: '#333333', padding: '1px 6px', flexShrink: 0 }}>Best</span>}
              </span>
              <span style={{ textAlign: 'right', ...tnum }}>{p.views > 0 ? p.views.toLocaleString() : '–'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, ...tnum }}>{p.clicks.toLocaleString()}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: '#046BB1', ...tnum }}>{p.views > 0 ? `${((p.clicks / p.views) * 100).toFixed(1)}%` : '–'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
