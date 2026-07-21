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
export interface SeriesPoint { bucket: string; views: number; starts: number; checkout: number; completed: number; netNew: number; partial: boolean }
export type Gran = 'day' | 'week' | 'month'
export type Series = Record<Gran, SeriesPoint[]>

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
function humanizePlacement(p: string): string {
  return p.replace(/^v2_/, '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()).trim() || p
}
function PlacementThumb({ placement }: { placement: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    // Clean labeled tile for placements we haven't captured (legacy CTAs, or
    // ones that only render mid-video) — never an empty "no preview" box.
    const isV2 = placement.startsWith('v2_')
    return (
      <span title={placement} style={{ width: 138, height: 56, border: `1px solid ${isV2 ? '#CBD9E6' : '#E0DACE'}`, background: isV2 ? 'linear-gradient(135deg,#EAF2F9,#F8FBFD)' : 'linear-gradient(135deg,#F6F1E5,#FBF8F1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '0 6px' }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>🖼️</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#6B6B6B', textAlign: 'center', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{humanizePlacement(placement)}</span>
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** 'YYYY-MM-DD' / 'YYYY-MM' → readable date (parsed by hand to dodge TZ drift). */
function labelBucket(b: string, gran: Gran): string {
  if (!b) return ''
  if (gran === 'month') { const p = b.split('-'); return `${MONTHS[(+p[1] || 1) - 1]} '${p[0].slice(2)}` }
  const [, m, d] = b.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${d}`
}
/** Compact x-axis tick: day-of-month · M/D for weeks · month abbr. */
function tickLabel(b: string, gran: Gran): string {
  if (!b) return ''
  if (gran === 'month') { const m = +b.split('-')[1]; return MONTHS[(m || 1) - 1] }
  const [, m, d] = b.split('-').map(Number)
  return gran === 'day' ? String(d) : `${m}/${d}`
}
const GRAN_LABEL: Record<Gran, string> = { day: 'D', week: 'W', month: 'M' }

/** Horizontal funnel: one bar per station, width ∝ count, the count read out
 *  right before its label ("870 Landing view"). No intermediate rates. */
function FunnelBars({ stations }: { stations: { label: string; n: number; last?: boolean }[] }) {
  const top = Math.max(stations[0]?.n || 0, 1)
  const SHADES = ['#046BB1', 'rgba(4,107,177,0.82)', 'rgba(4,107,177,0.64)', 'rgba(4,107,177,0.46)']
  return (
    <div style={{ padding: '18px 24px 22px' }}>
      {stations.map((s, i) => {
        const w = Math.max((s.n / top) * 100, 1.5)
        const fill = s.last ? '#62A758' : SHADES[Math.min(i, SHADES.length - 1)]
        return (
          <div key={s.label} className="flex items-center" style={{ gap: 14, marginBottom: i < stations.length - 1 ? 11 : 0 }}>
            <span className="flex items-baseline" style={{ width: 214, flexShrink: 0, gap: 8 }}>
              <strong style={{ fontSize: 17, fontWeight: 800, color: s.last ? '#2D6A26' : INK, ...tnum }}>{s.n.toLocaleString()}</strong>
              <span style={{ fontSize: 12.5, color: '#4A4A4A', whiteSpace: 'nowrap' }}>{s.label}</span>
            </span>
            <div style={{ flex: 1, height: 26, background: TRACK, position: 'relative', minWidth: 0 }}>
              <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${w}%`, background: fill }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Funnel-step conversion trend. Own day/week/month toggle, the rate on each
 *  bar, hover for exact numbers, headline = the CURRENT period. */
function StepTrend({ title, sub, series, num, den, color, borderLeft }: {
  title: string; sub: string; series: Series
  num: (p: SeriesPoint) => number; den: (p: SeriesPoint) => number
  color: string; borderLeft: boolean
}) {
  const [gran, setGran] = useState<Gran>('week')
  const rows = series[gran].map(p => {
    const d = den(p), n = num(p)
    return { bucket: p.bucket, partial: p.partial, rate: d > 0 ? (n / d) * 100 : 0, n, d }
  })
  const max = Math.max(...rows.map(r => r.rate), 1)
  const last = rows[rows.length - 1]
  const gap = gran === 'day' ? 3 : 5
  return (
    <div style={{ padding: '15px 18px', borderTop: '1px solid #333333', borderLeft: borderLeft ? '1px solid #333333' : 'none', minWidth: 0 }}>
      <div className="flex items-start justify-between" style={{ gap: 6 }}>
        <span style={{ ...panelTitle, fontSize: 10.5 }}>{title}</span>
        <div className="inline-flex" style={{ border: '1px solid #D8D2C6', flexShrink: 0 }}>
          {(['day', 'week', 'month'] as Gran[]).map((g, i) => (
            <button key={g} onClick={() => setGran(g)} title={g} style={{ padding: '1px 6px', fontSize: 9.5, fontWeight: 800, borderLeft: i ? '1px solid #D8D2C6' : 'none', background: gran === g ? '#333333' : 'transparent', color: gran === g ? '#FFFDFA' : '#9C9C9C', cursor: 'pointer' }}>{GRAN_LABEL[g]}</button>
          ))}
        </div>
      </div>
      <div className="flex items-baseline flex-wrap" style={{ gap: 7, marginTop: 6 }}>
        <span style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: INK, ...tnum }}>{last ? `${last.rate.toFixed(1)}%` : '–'}</span>
        {last && <span style={{ fontSize: 9.5, color: MUTE, ...tnum }}>{last.n}/{last.d} · {labelBucket(last.bucket, gran)}{last.partial ? ' (so far)' : ''}</span>}
      </div>
      <div className="flex items-end" style={{ gap, height: 60, marginTop: 10, borderBottom: '1px solid #333333' }}>
        {rows.map(r => (
          <div key={r.bucket} className="flex flex-col items-center justify-end" style={{ flex: 1, height: '100%', minWidth: 0 }} title={`${labelBucket(r.bucket, gran)}${r.partial ? ' · in progress' : ''}: ${r.rate.toFixed(1)}% (${r.n}/${r.d})`}>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: '#6B6B6B', lineHeight: 1, ...tnum }}>{r.d > 0 ? Math.round(r.rate) : ''}</span>
            <div style={{ width: gran === 'day' ? '80%' : '68%', height: `${(r.rate / max) * 100}%`, minHeight: r.rate > 0 ? 2 : 0, background: color, opacity: r.partial ? 0.42 : 1, marginTop: 3 }} />
          </div>
        ))}
        {rows.length === 0 && <span style={{ fontSize: 11, color: MUTE, alignSelf: 'center', margin: '0 auto' }}>No data yet.</span>}
      </div>
      <div className="flex" style={{ gap, marginTop: 4 }}>
        {rows.map(r => <span key={r.bucket} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: MUTE, whiteSpace: 'nowrap', overflow: 'hidden', ...tnum }}>{tickLabel(r.bucket, gran)}</span>)}
      </div>
      <div style={{ fontSize: 9, color: MUTE, marginTop: 6 }}>{sub}</div>
    </div>
  )
}

export default function DashboardBento({ rows, sample, funnelEvents, placements, series, pct }: {
  rows: BentoRow[]; sample: 'launch' | 'all'; funnelEvents: FunnelEventCounts; placements: PlacementStat[]; series: Series; pct: boolean
}) {
  const [stageFilter, setStageFilter] = useState<string | null>(null)

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
  const hasSeries = series.week.length > 0 || series.day.length > 0

  const bestCtr = placements.reduce<string | null>((best, p) => {
    if (!p.views || !p.clicks) return best
    const ctr = p.clicks / p.views
    const bp = placements.find(x => x.placement === best)
    return !bp || !bp.views || ctr > bp.clicks / bp.views ? p.placement : best
  }, null)

  return (
    <div>
      {/* Active filter chip (the N/% toggle now lives in the page header) */}
      {filtDef && (
        <div className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
          <button onClick={() => setStageFilter(null)} className="inline-flex items-center" style={{ gap: 8, border: '1px solid #E48715', background: LATTE, color: '#B26A00', padding: '4px 10px', fontSize: 11.5, fontWeight: 700 }}>
            {filtDef.emoji} {filtDef.label} · {(ladderCounts.get(filtDef.key) || 0).toLocaleString()} people <span style={{ fontSize: 12 }}>✕</span>
          </button>
        </div>
      )}

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
            <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>count then stage, bar length ∝ people · completed + paid share the KPIs&rsquo; rows (whole cohort, the rung filter doesn&rsquo;t apply to page events)</span>
          </div>
          <FunnelBars stations={stations} />
        </div>

        {/* ── Row 2b · step conversions over time ── */}
        <div style={{ borderTop: '1px solid #333333' }}>
          <div className="flex items-baseline justify-between" style={{ padding: '12px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}` }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Progression · each funnel step over time</span>
            <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>are we getting better? big number = current period · toggle day / week / month · hover a bar for the exact rate</span>
          </div>
          {hasSeries ? (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <StepTrend title="Landing → Start" sub="quiz starts ÷ landing views" series={series} num={p => p.starts} den={p => p.views} color="#046BB1" borderLeft={false} />
              <StepTrend title="Start → Complete" sub="result page shown ÷ quiz starts" series={series} num={p => p.completed} den={p => p.starts} color="#3B4C99" borderLeft />
              <StepTrend title="Complete → Checkout" sub="checkout clicks ÷ result shown" series={series} num={p => p.checkout} den={p => p.completed} color="#E48715" borderLeft />
              <StepTrend title="Checkout → Paid" sub="net-new paid ÷ checkout clicks · paid lags" series={series} num={p => p.netNew} den={p => p.checkout} color="#62A758" borderLeft />
            </div>
          ) : (
            <p style={{ padding: '16px 24px', fontSize: 12, color: MUTE }}>No time-series data in this window yet.</p>
          )}
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
