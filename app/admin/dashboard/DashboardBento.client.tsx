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
/** Plain names for the CTA placements. The raw keys are implementation detail
 *  ("v2_offer_bar"); this table is read to decide which button to keep. */
const PLACEMENT_NAME: Record<string, string> = {
  v2_offer_stack: 'Offer stack',
  v2_offer_stack_badges: 'Offer stack · pay marks',
  v2_offer_bar: 'Sticky bottom bar',
  v2_offer_bar_banner: 'Sticky bottom bar · whole strip',
  v2_video_cta: 'Under the video',
  v2_study_plan: 'Study plan',
  v2_study_plan_badges: 'Study plan · pay marks',
  v2_social_marquee: 'Reviews marquee',
  v2_fomo_notification: 'Trial notification',
  v2_embedded_fallback: 'Checkout modal · classic-checkout link',
  v2_free_win_prompt: 'Free win · prompt',
  v2_free_win_tutorial: 'Free win · tutorial',
  v2_result_pass: 'Member pass',
}
function humanizePlacement(p: string): string {
  return PLACEMENT_NAME[p]
    || p.replace(/^v2_/, '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()).trim()
    || p
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
const STEP_TABS: (Gran | 'all')[] = ['day', 'week', 'month', 'all']
const STEP_TAB_LABEL: Record<Gran | 'all', string> = { day: 'D', week: 'W', month: 'M', all: 'All' }

/** Volume matrix — the funnel repeated per period as a heat table.
 *  Rows are stations (counts, not rates); cell tint is the count relative to
 *  that station's best period, so a column reads as its own little funnel and a
 *  row reads as that station's trend. Two rate rows close it out: result-page
 *  CVR (paid ÷ completed — the north star) and full-funnel CVR (paid ÷ landing).
 *  `all` collapses to the single whole-window column. */
function VolumeMatrix({ series, gran, F }: {
  series: Series; gran: Gran | 'all'
  F: { landing: number; started: number; completed: number; checkout: number; paid: number }
}) {
  const buckets = gran === 'all' ? [] : series[gran]
  const fmt = (n: number) => n.toLocaleString()
  const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
  const pctDisp = (raw: number) => `${raw < 10 ? raw.toFixed(1) : Math.round(raw)}%`

  const stations = [
    { label: 'Landing view', pick: (p: SeriesPoint) => p.views, tot: F.landing, warm: false },
    { label: 'Quiz started', pick: (p: SeriesPoint) => p.starts, tot: F.started, warm: false },
    { label: 'Quiz completed', pick: (p: SeriesPoint) => p.completed, tot: F.completed, warm: false },
    { label: 'Checkout clicked', pick: (p: SeriesPoint) => p.checkout, tot: F.checkout, warm: false },
    { label: 'Net-new paid', pick: (p: SeriesPoint) => p.netNew, tot: F.paid, warm: true },
  ]

  // 132px station label · 104px all-window total · one 1fr per period
  const grid = `132px 104px${buckets.length ? ` repeat(${buckets.length}, 1fr)` : ''}`

  const rpAll = F.completed > 0 ? (F.paid / F.completed) * 100 : 0
  const ffAll = F.landing > 0 ? (F.paid / F.landing) * 100 : 0
  const rateRows = [
    { label: 'Result-page CVR', all: rpAll, per: (p: SeriesPoint) => (p.completed > 0 ? Math.min(100, (p.netNew / p.completed) * 100) : 0), heavy: false },
    { label: 'Full-funnel CVR', all: ffAll, per: (p: SeriesPoint) => (p.views > 0 ? Math.min(100, (p.netNew / p.views) * 100) : 0), heavy: true },
  ]

  const head: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B6B6B' }

  return (
    <div style={{ padding: '4px 20px 18px' }}>
      {/* header */}
      <div className="grid" style={{ gridTemplateColumns: grid, borderBottom: '1px solid #333333' }}>
        <span style={{ ...head, padding: '6px 0' }}>Station</span>
        <span style={{ ...head, padding: '6px 8px 6px 0', textAlign: 'right' }}>All window</span>
        {buckets.map(p => (
          <span key={p.bucket} className="truncate" style={{ ...head, padding: '6px 4px', textAlign: 'center', borderLeft: `1px solid ${ROWHAIR}` }}>
            {labelBucket(p.bucket, gran as Gran)}
          </span>
        ))}
      </div>

      {/* station rows */}
      {stations.map(s => {
        const ns = buckets.map(p => s.pick(p))
        const max = Math.max(...ns, 1)
        const base = s.warm ? '98,167,88' : '4,107,177' // asparagus for paid, azul for the rest
        return (
          <div key={s.label} className="grid items-stretch" style={{ gridTemplateColumns: grid, borderBottom: `1px solid ${ROWHAIR}` }}>
            <span className="flex items-center truncate" style={{ padding: '9px 8px 9px 0', fontSize: 10.5, fontWeight: 700, color: INK }}>{s.label}</span>
            <span className="flex items-center justify-end" style={{ padding: '9px 8px 9px 0', fontSize: 11.5, fontWeight: 800, color: INK, ...tnum }}>{fmt(s.tot)}</span>
            {ns.map((n, i) => (
              <span key={buckets[i].bucket} className="flex items-center justify-center"
                title={`${labelBucket(buckets[i].bucket, gran as Gran)}${buckets[i].partial ? ' · in progress' : ''} · ${fmt(n)}`}
                style={{ padding: '9px 2px', margin: 1, fontSize: 9.5, fontWeight: 700, color: INK, background: `rgba(${base},${(0.05 + (n / max) * 0.42).toFixed(2)})`, ...tnum }}>
                {compact(n)}
              </span>
            ))}
          </div>
        )
      })}

      {/* rate rows */}
      {rateRows.map(rr => (
        <div key={rr.label} className="grid items-center" style={{ gridTemplateColumns: grid, background: LATTE, borderBottom: rr.heavy ? '2px solid #333333' : `1px solid ${ROWHAIR}` }}>
          <span style={{ padding: '9px 8px 9px 0', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: INK }}>{rr.label}</span>
          <span style={{ padding: '9px 8px 9px 0', textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: '#B26A00', ...tnum }}>{rr.all.toFixed(rr.heavy ? 2 : 1)}%</span>
          {buckets.map(p => (
            <span key={p.bucket} style={{ padding: '9px 4px', textAlign: 'center', fontSize: 10, fontWeight: 800, color: '#B26A00', borderLeft: `1px solid ${ROWHAIR}`, ...tnum }}>
              {pctDisp(rr.per(p))}
            </span>
          ))}
        </div>
      ))}

      <div style={{ fontSize: 9.5, color: MUTE, marginTop: 10 }}>
        cell tint = count relative to that station&apos;s best period · hover a cell for the exact count
      </div>
    </div>
  )
}

export default function DashboardBento({ rows, sample, funnelEvents, placements, series, pct }: {
  rows: BentoRow[]; sample: 'launch' | 'all'; funnelEvents: FunnelEventCounts; placements: PlacementStat[]; series: Series; pct: boolean
}) {
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [trendGran, setTrendGran] = useState<Gran | 'all'>('week') // shared across all step rows

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
  // Where the people who ACTUALLY converted came into the quiz — the acquisition
  // question ("which source produces buyers", not just volume).
  const netNewSource = desc(countBy(slice.filter(r => r.netNew), r => r.utmQuiz || 'Direct / unknown'))
  const nlData = desc(countBy(slice, r => r.utmNewsletter || 'Direct / unknown'))
  const quizUtmData = desc(countBy(slice, r => r.utmQuiz || 'Direct / unknown'))

  const filtDef = stageFilter ? ladderDefs.find(d => d.key === stageFilter) : null

  // ── Canonical funnel node counts: ONE value per node, so every step CVR and
  //    the full-funnel CVR reconcile (product of steps === paid/landing).
  //    Landing/started/checkout are unique actors; completed is the submission
  //    count; paid is net-new. Completed + paid come from the SAME rows as every
  //    KPI above (whole cohort, not the stage slice). Feeds the volume matrix. ──
  const wholeNetNew = rows.filter(r => r.netNew).length
  const F = { landing: funnelEvents.landing, started: funnelEvents.started, completed: rows.length, checkout: funnelEvents.checkout, paid: wholeNetNew }
  const fullFunnelCvr = F.landing > 0 ? (F.paid / F.landing) * 100 : 0
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

      <div className="ac-bento" style={{ border: '2px solid #333333', background: '#FFFFFF' }}>
        {/* Responsive: every grid here is a fixed column count, which on a phone
            crushed each cell to ~70px. Below 900px they fold to two columns,
            below 560px to one, and the wide tables scroll inside themselves so
            the page body never scrolls sideways. */}
        <style>{`
          @media (max-width: 900px) {
            .ac-bento .ac-kpis { grid-template-columns: repeat(2, 1fr) !important; }
            .ac-bento .ac-kpis > div { border-left: none !important; border-top: 1px solid #333333; }
            .ac-bento .ac-split { grid-template-columns: 1fr !important; }
            .ac-bento .ac-split > div { border-right: none !important; border-left: none !important; }
            .ac-bento .ac-split > div + div { border-top: 1px solid #333333; }
            .ac-bento .ac-thirds { grid-template-columns: 1fr !important; }
            .ac-bento .ac-thirds > div { border-left: none !important; }
            .ac-bento .ac-money { grid-template-columns: 1fr !important; }
            .ac-bento .ac-scrollx { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            .ac-bento .ac-scrollx > * { min-width: 660px; }
          }
          @media (max-width: 560px) {
            .ac-bento .ac-kpis { grid-template-columns: 1fr !important; }
          }
        `}</style>

        {/* ── Row 1 · the top line, in the owner's reading order:
               volume → the two CVRs → the paid count → money → money per head ── */}
        <div className="grid ac-kpis" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {[
            { label: sample === 'launch' ? 'Total quiz takers' : 'Total records', v: takers.toLocaleString(), hint: stageFilter ? 'in the selected rung' : 'unique people, one shared cohort', dark: false },
            { label: 'Full-funnel CVR', v: `${fullFunnelCvr.toFixed(2)}%`, hint: `net-new ÷ ${F.landing.toLocaleString()} landing views`, dark: false },
            { label: 'Result-page CVR', v: `${cvr.toFixed(1)}%`, hint: `net-new ÷ ${takers.toLocaleString()} quiz takers · the north star`, dark: true },
            { label: 'Net-new paid', v: netNewPeople.length.toLocaleString(), hint: 'first-ever charge AFTER their quiz', dark: false },
            { label: 'Quiz revenue', v: `$${quizRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, hint: 'sum of payments from net-new people', dark: false },
            { label: 'ARPU', v: takers > 0 ? `$${(quizRevenue / takers).toFixed(2)}` : '–', hint: `quiz revenue ÷ ${takers.toLocaleString()} quiz takers`, dark: false },
          ].map((k, i) => (
            <div key={k.label} style={{ padding: '18px 18px', background: k.dark ? '#333333' : 'transparent', borderLeft: i > 0 ? '1px solid #333333' : 'none' }}>
              <div style={{ ...eyebrow, color: k.dark ? '#C9C3B8' : MUTE }}>{k.label}</div>
              <div style={{ fontSize: k.dark ? 32 : 27, fontWeight: 800, letterSpacing: '-0.03em', color: k.dark ? '#E7B02F' : INK, lineHeight: 1, marginTop: k.dark ? 10 : 12, ...tnum }}>{k.v}</div>
              <div style={{ fontSize: 10.5, color: k.dark ? 'rgba(255,253,250,0.65)' : MUTE, marginTop: 8 }}>{k.hint}</div>
            </div>
          ))}
        </div>

        {/* ── Row 2 · the funnel, per period. The static bar funnel that used to
               sit above this was redundant: the matrix's "All window" column is
               the same five numbers, so it stays as the single source. ── */}
        <div style={{ borderTop: '1px solid #333333' }}>
          <div className="flex items-center justify-between" style={{ padding: '9px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}`, gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Funnel per period · since Jul 5</span>
            <div className="inline-flex" style={{ border: '1px solid #333333', flexShrink: 0 }}>
              {STEP_TABS.map((g, i) => (
                <button key={g} onClick={() => setTrendGran(g)} style={{ padding: '3px 9px', fontSize: 11, fontWeight: 800, borderLeft: i ? '1px solid #333333' : 'none', background: trendGran === g ? '#333333' : 'transparent', color: trendGran === g ? '#FFFDFA' : '#6B6B6B', cursor: 'pointer' }}>
                  {STEP_TAB_LABEL[g]}
                </button>
              ))}
            </div>
          </div>
          {hasSeries
            ? <div className="ac-scrollx"><VolumeMatrix series={series} gran={trendGran} F={F} /></div>
            : <p style={{ padding: '16px 20px', fontSize: 12, color: MUTE }}>No time-series data in this window yet.</p>}
        </div>

        {/* ── Row 3 · ladder (the filter) · stage × conversions · where buyers came from ── */}
        <div className="grid ac-thirds" style={{ gridTemplateColumns: '1.2fr 1fr 1fr', borderTop: '1px solid #333333' }}>
          {/* Ladder: clickable vertical bars (whole cohort — it is the selector) */}
          <div style={{ padding: '18px 24px', minWidth: 0 }}>
            <div className="flex items-baseline justify-between" style={{ marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
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

          <div style={{ padding: '18px 24px', minWidth: 0, borderLeft: '1px solid #333333' }}>
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

          {/* Where the people who actually PAID came into the quiz. Volume by
              source lives in the breakdowns below; this one is buyers only. */}
          <div style={{ borderLeft: '1px solid #333333' }}>
            <HBarPanel
              title="Where net-new paid came from"
              rows={netNewSource}
              color="#62A758"
              pct={pct}
              borderLeft={false}
            />
          </div>
        </div>

        {/* ── Rows 4-6 · breakdowns ── */}
        <div className="grid ac-thirds" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
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
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Which CTA gets clicked</span>
            <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>of the people who SAW each button, how many clicked it · since Jul 5</span>
          </div>
          <div className="ac-scrollx"><div>
          <div className="grid" style={{ gridTemplateColumns: '158px 1fr 80px 76px 62px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B6B6B', borderBottom: `1px solid ${HAIR}`, padding: '0 20px' }}>
            <span style={{ padding: '8px 0' }}>Shown</span><span style={{ padding: '8px 0' }}>Button</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Saw it</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Clicked</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Rate</span>
          </div>
          {placements.length === 0 && <p style={{ padding: '10px 20px', fontSize: 12, color: MUTE }}>No placement events yet.</p>}
          {placements.map(p => (
            <div key={p.placement} className="grid items-center hover:bg-[#FEF7E7]" style={{ gridTemplateColumns: '158px 1fr 80px 76px 62px', fontSize: 12, borderBottom: `1px solid ${ROWHAIR}`, padding: '6px 20px' }}>
              <PlacementThumb placement={p.placement} />
              <span className="flex items-center" style={{ fontSize: 12, fontWeight: 600, color: INK, gap: 8, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.placement}>{humanizePlacement(p.placement)}</span>
                {bestCtr === p.placement && <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: '#E7B02F', color: '#333333', padding: '1px 6px', flexShrink: 0 }}>Best</span>}
              </span>
              <span style={{ textAlign: 'right', ...tnum }}>{p.views > 0 ? p.views.toLocaleString() : '–'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, ...tnum }}>{p.clicks.toLocaleString()}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: '#046BB1', ...tnum }}>{p.views > 0 ? `${((p.clicks / p.views) * 100).toFixed(1)}%` : '–'}</span>
            </div>
          ))}
          </div></div>
        </div>
      </div>
    </div>
  )
}
