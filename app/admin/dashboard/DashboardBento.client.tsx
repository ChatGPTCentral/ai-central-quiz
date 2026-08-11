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
  /** No Stripe charge EVER before the quiz, then bought. A new customer. */
  netNew: boolean
  /** THE NORTH STAR (owner, 2026-08-10): the quiz produced a trial from this
   *  person, whether they were new to us or an existing customer buying
   *  another trial. netNew is a strict subset. */
  quizTrial: boolean
}
export interface FunnelEventCounts { landing: number; started: number; checkout: number }
export interface PlacementStat { placement: string; views: number; clicks: number; sales: number; revenue: number }
export interface SeriesPoint {
  bucket: string
  /** Whether client instrumentation covered this period. The quiz launched
   *  Jul 5 but the first funnel_event is Jul 9, so early buckets have no event
   *  data — 'none' renders "–" rather than a lying 0. */
  eventsCovered: 'none' | 'partial' | 'full'
  views: number; starts: number; checkout: number; completed: number
  netNew: number
  /** Trials the quiz cannot claim at all, bucketed on CHARGE date. */
  otherPaid: number
  /** Trials the quiz DID earn from people who had paid us before, so they are
   *  not net-new customers. Bucketed on QUIZ date, like net-new. */
  quizExistingPaid: number
  /** Money from this cohort's net-new buyers, bucketed on QUIZ date. */
  revenue: number
  /** The revenue split, from REAL Stripe charges (stripe_charges mirror).
   *  net = $4.99 trials from net-new people, on the QUIZ-date clock (the
   *  cohort owns the sale). The other three sit on the CHARGE-date clock. */
  revenueNet: number
  revenueQuizExisting: number
  revenueNotQuiz: number
  revenueAnnual: number
  /** What the conversion money is made of: [cents, count] pairs. A conversion
   *  is a $59.75 annual OR the $49.75 half of a lifetime bundle, so the hover
   *  states the real mix instead of dividing by an assumed price. */
  annualParts: [number, number][]
  revenueOther: number
  /** Completions and paid restricted to days that had client tracking, so a
   *  partially-instrumented period's step rates are computed over the window
   *  that was actually measured instead of mixing tracked and untracked days. */
  cleanCompleted: number
  cleanNetNew: number
  /** Trials whose renewal date has passed, from the ledger. */
  matureTrials: number
  /** Of those, how many were really billed the annual. */
  billedAnnual: number
  partial: boolean
}
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

/** The "All window" column. Declared once so every row renders it identically:
 *  centred like the period columns beside it, and carrying the same solid rule
 *  on its left edge. When each row styled its own copy the rule broke wherever
 *  a row was added later without it. */
const totalCol: React.CSSProperties = {
  textAlign: 'center',
  borderLeft: '2px solid #1A1A1A',
  padding: '0 8px',
}

/** Stage x quiz conversions column template. One constant so the header and
 *  the rows can never drift apart, which they did when ARPU was added. */
const GRID_STAGE = 'minmax(96px,1.2fr) 38px 38px 46px 58px 56px'
/** CTA placements column template, shared by its header and rows. */
const GRID_CTA = '158px 1fr 70px 66px 56px 56px 68px'
/** Source economics columns, shared by its header and rows. */
const GRID_SRC = 'minmax(150px,1fr) 74px 62px 74px 84px 74px'

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
  const start = `${MONTHS[(m || 1) - 1]} ${d}`
  // A week column covers seven days, so it is labelled with both ends. Naming
  // only the Monday made "Jun 29" look like a day that predates launch, when
  // it is the week Jul 5 launched inside (owner, 2026-08-10).
  if (gran === 'week') {
    const e = new Date(`${b}T00:00:00Z`)
    e.setUTCDate(e.getUTCDate() + 6)
    const em = e.getUTCMonth(), ed = e.getUTCDate()
    return `${start} - ${em === (m || 1) - 1 ? ed : `${MONTHS[em]} ${ed}`}`
  }
  return start
}
const STEP_TABS: (Gran | 'all')[] = ['day', 'week', 'month', 'all']
const STEP_TAB_LABEL: Record<Gran | 'all', string> = { day: 'D', week: 'W', month: 'M', all: 'All' }

/** Volume matrix — the funnel repeated per period as a heat table.
 *  Rows are stations (counts, not rates); cell tint is the count relative to
 *  that station's best period, so a column reads as its own little funnel and a
 *  row reads as that station's trend. Two rate rows close it out: result-page
 *  CVR (paid ÷ completed — the north star) and full-funnel CVR (paid ÷ landing).
 *  `all` collapses to the single whole-window column. */
function VolumeMatrix({ series, gran, F, lifetimeSplits, quizRepeatTrials, preWindowAnnuals }: {
  series: Series; gran: Gran | 'all'
  F: { landing: number; started: number; completed: number; checkout: number; paid: number; otherPaid: number; quizExistingPaid: number }
  lifetimeSplits: number
  quizRepeatTrials: number
  preWindowAnnuals: number
}) {
  const buckets = gran === 'all' ? [] : series[gran]
  const fmt = (n: number) => n.toLocaleString()
  const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
  const pctDisp = (raw: number) => `${raw < 10 ? raw.toFixed(1) : Math.round(raw)}%`

  // Step-to-step rate: the share of the PREVIOUS station that made it here.
  // Clamped to 100 like the summary rows below — a step rate over 100% means
  // the two stations are counted over different windows, not that more people
  // arrived than left.
  const step = (n: number, d: number) => (d > 0 ? Math.min(100, (n / d) * 100) : 0)

  // Each station carries the conversion OUT of it, rendered as a thin row
  // directly underneath, so the column multiplies as you read down:
  //   1,819 → 73% → 1,319 → 72% → 944 → 33% → 312 → …
  // Every rate sits between the two counts it relates, which is why it hangs
  // off the SOURCE station rather than the destination.
  const stations: {
    label: string
    pick: (p: SeriesPoint) => number
    tot: number
    warm: boolean
    note?: string
    out?: { label: string; all: number; per: (p: SeriesPoint) => number }
    /** "of which" rows: the parts this station is made of, rendered indented
     *  underneath it. They sum to the station, so the eye can check it. */
    breakdown?: { label: string; pick: (p: SeriesPoint) => number; tot: number; note?: string }[]
    /** Render like the All Revenue row: it is a total, not a station. */
    summary?: boolean
  }[] = [
    {
      label: 'Landing view', pick: (p: SeriesPoint) => p.views, tot: F.landing, warm: false,
      out: { label: 'landing → started', all: step(F.started, F.landing), per: p => step(p.starts, p.views) },
    },
    {
      label: 'Quiz started', pick: (p: SeriesPoint) => p.starts, tot: F.started, warm: false,
      out: { label: 'started → completed', all: step(F.completed, F.started), per: p => step(p.cleanCompleted, p.starts) },
    },
    {
      label: 'Quiz completed', pick: (p: SeriesPoint) => p.completed, tot: F.completed, warm: false,
      out: { label: 'completed → clicked', all: step(F.checkout, F.completed), per: p => step(p.checkout, p.cleanCompleted) },
    },
    {
      label: 'Checkout clicked', pick: (p: SeriesPoint) => p.checkout, tot: F.checkout, warm: false,
      // The step out of checkout is measured against the QUIZ-earned trials
      // only. The people who never took the quiz never passed through this
      // station, so including them would inflate a rate with buyers the
      // funnel never touched.
      out: {
        label: 'clicked → trial (quiz)',
        all: step(F.paid + F.quizExistingPaid, F.checkout),
        per: p => step(p.cleanNetNew + p.quizExistingPaid, p.checkout),
      },
    },
    {
      // The funnel's terminal station: every trial sold, then what it is made
      // of. The three parts sum to this row, so the breakdown can be checked
      // by eye rather than trusted.
      label: 'ALL TRIALS',
      pick: (p: SeriesPoint) => p.netNew + p.quizExistingPaid + p.otherPaid,
      tot: F.paid + F.quizExistingPaid + F.otherPaid,
      warm: true, summary: true,
      note: 'every trial sold in the period. The two quiz rows below sit on the QUIZ clock and the third on the CHARGE clock, so this counts trials rather than one single instant.',
      breakdown: [
        { label: 'net-new (the north star)', pick: (p: SeriesPoint) => p.netNew, tot: F.paid,
          note: 'took the quiz, then bought, and had never paid us before. By QUIZ date, so a late converter restates the week they took it.' },
        { label: 'quiz, existing customer', pick: (p: SeriesPoint) => p.quizExistingPaid, tot: F.quizExistingPaid,
          note: 'took the quiz and then bought, but had paid us before — the quiz earned the trial, not a new customer. By QUIZ date.' },
        { label: 'not from the quiz', pick: (p: SeriesPoint) => p.otherPaid, tot: F.otherPaid,
          note: 'never took the quiz, or took it only after paying. By CHARGE date. Same classification as the revenue rows, so count × $4.99 always equals them.' },
      ],
    },

  ]

  // 156px station label (wide enough for "Quiz New Trials Revenue") ·
  // 104px all-window total · one column per period with a FLOOR: bare 1fr
  // shrinks 21 day columns to unreadable slivers that never overflow, so the
  // scroll container had nothing to scroll. minmax gives day view a real
  // width and the wrapper's overflow-x takes over.
  // Label · one column per period · the row TOTAL last, because it is a sum
  // of everything to its left and reads naturally at the end of the row
  // rather than interrupting the time series at the start of it.
  const grid = `156px${buckets.length ? ` repeat(${buckets.length}, minmax(46px, 1fr))` : ''} 108px`

  const rpAll = F.completed > 0 ? (F.paid / F.completed) * 100 : 0
  const ffAll = F.landing > 0 ? (F.paid / F.landing) * 100 : 0
  // Trial to annual, counted ONLY on trials whose bill date has passed. A trial
  // from last week has not failed to convert, it is not due, and counting it
  // would drag every recent column to zero and make the row worthless.
  const matureAll = buckets.reduce((a: number, p: SeriesPoint) => a + p.matureTrials, 0)
  const billedAll = buckets.reduce((a: number, p: SeriesPoint) => a + p.billedAnnual, 0)
  // The revenue split rows sum REAL Stripe charges from the mirror, not the
  // per-person LTV aggregate the old single Revenue row used. Each row names
  // its clock, because two adjacent rows on unstated different clocks is
  // exactly what produced the "24 vs 23" confusion.
  const sumOf = (f: (p: SeriesPoint) => number) => buckets.reduce((a: number, p: SeriesPoint) => a + f(p), 0)
  const revAll = (p: SeriesPoint) => p.revenueNet + p.revenueQuizExisting + p.revenueNotQuiz + p.revenueAnnual + p.revenueOther
  // `unit` = the single price a row is made of; it powers the hover arithmetic
  // ("6 × $4.99 = $29.94") so any cell can be checked against Stripe by eye.
  const rateRows: { label: string; all: number; per: (p: SeriesPoint) => number; heavy: boolean; money?: boolean; count?: boolean; sub?: string; unit?: number; parts?: (p: SeriesPoint) => [number, number][] }[] = [
    { label: 'Result-page CVR', all: rpAll, per: (p: SeriesPoint) => (p.completed > 0 ? Math.min(100, (p.netNew / p.completed) * 100) : 0), heavy: false },
    { label: 'Full-funnel CVR', all: ffAll, per: (p: SeriesPoint) => (p.views > 0 ? Math.min(100, (p.netNew / p.views) * 100) : 0), heavy: true },
    {
      label: 'Quiz New Trials Revenue', money: true, heavy: false, unit: 4.99,
      sub: 'ONE $4.99 trial per net-new person (their first), by QUIZ date. Includes the $4.99 inside $54.74 lifetime bundles; repeat $4.99s from the same person sit in Other Revenue.',
      all: sumOf(p => p.revenueNet), per: (p: SeriesPoint) => p.revenueNet,
    },
    {
      label: 'Quiz Existing Trials Revenue', money: true, heavy: false, unit: 4.99,
      sub: 'ONE $4.99 trial per person who took the quiz and then bought, but had paid us before — quiz-earned, not a new customer. By QUIZ date.',
      all: sumOf(p => p.revenueQuizExisting), per: (p: SeriesPoint) => p.revenueQuizExisting,
    },
    {
      label: 'Other New Trials Revenue', money: true, heavy: false, unit: 4.99,
      sub: 'ONE $4.99 trial per person who never took the quiz (or took it after paying), by CHARGE date. Includes the $4.99 inside $54.74 lifetime bundles; repeats sit in Other Revenue.',
      all: sumOf(p => p.revenueNotQuiz), per: (p: SeriesPoint) => p.revenueNotQuiz,
    },
    {
      label: 'Converted Trials Revenue', money: true, heavy: false,
      parts: (p: SeriesPoint) => p.annualParts,
      sub: '$59.75 annual renewals only, restated to the WEEK OF THE TRIAL that earned them. The $49.75 half of a $54.74 lifetime bundle is NOT an annual and sits in Other Revenue. Recent columns fill in as their trials mature about a month later.',
      all: sumOf(p => p.revenueAnnual), per: (p: SeriesPoint) => p.revenueAnnual,
    },
    {
      // heavy = the break line the owner asked for between row 4 and All revenue.
      label: 'Other Revenue', money: true, heavy: true,
      sub: '$49.75 lifetime options (the second half of a $54.74 bundle), repeat $4.99s (double-subscriptions), legacy annual prices, $7.99 subs, odd amounts, non-USD. By CHARGE date.',
      all: sumOf(p => p.revenueOther), per: (p: SeriesPoint) => p.revenueOther,
    },
    {
      label: 'All Revenue', money: true, heavy: true,
      sub: 'rows 1-4, every dollar Stripe collected minus refunds',
      all: sumOf(revAll), per: revAll,
    },
    {
      label: 'Trial → annual',
      all: matureAll > 0 ? (billedAll / matureAll) * 100 : 0,
      per: (p: SeriesPoint) => (p.matureTrials > 0 ? Math.min(100, (p.billedAnnual / p.matureTrials) * 100) : 0),
      heavy: false,
    },
  ]

  const head: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B6B6B' }

  return (
    <div style={{ padding: '4px 20px 18px' }}>
      {/* header */}
      <div className="grid" style={{ gridTemplateColumns: grid, borderBottom: '1px solid #333333' }}>
        <span style={{ ...head, padding: '6px 0' }}>Station</span>
        {buckets.map(p => (
          <span key={p.bucket} className="truncate" style={{ ...head, padding: '6px 4px', textAlign: 'center', borderLeft: `1px solid ${ROWHAIR}` }}>
            {labelBucket(p.bucket, gran as Gran)}
          </span>
        ))}
        <span style={{ ...head, ...totalCol, padding: '6px 8px' }}>All window</span>
      </div>

      {/* station rows */}
      {stations.map(s => {
        const ns = buckets.map(p => s.pick(p))
        // Landing / started / checkout come from client events. Before Jul 9
        // there are none, so those cells must read "–" (not measured) rather
        // than 0 (measured as nobody) — the distinction the owner needed when
        // the launch-week column looked empty.
        const fromEvents = s.label === 'Landing view' || s.label === 'Quiz started' || s.label === 'Checkout clicked'
        return (
          <div key={s.label}>
            <div className="grid items-stretch" style={{
              gridTemplateColumns: grid,
              background: s.summary ? '#F3F8F3' : undefined,
              borderTop: s.summary ? `2px solid ${INK}` : undefined,
              borderBottom: s.out ? 'none' : `1px solid ${ROWHAIR}`,
            }}>
              <span className="flex items-center truncate" title={s.note}
                style={{ padding: '9px 8px 9px 0', fontSize: s.summary ? 10 : 10.5, fontWeight: s.summary ? 800 : 700,
                         textTransform: s.summary ? 'uppercase' : undefined, letterSpacing: s.summary ? '0.08em' : undefined,
                         color: INK }}>{s.label}</span>
              {ns.map((n, i) => {
                const cov = buckets[i].eventsCovered
                const blind = fromEvents && cov === 'none'
                const thin = fromEvents && cov === 'partial'
                return (
                  <span key={buckets[i].bucket} className="flex items-center justify-center"
                    title={
                      blind ? `${labelBucket(buckets[i].bucket, gran as Gran)} · not measured — client tracking only started 9 Jul, four days after launch`
                      : thin ? `${labelBucket(buckets[i].bucket, gran as Gran)} · ${fmt(n)}, UNDERSTATED — tracking started mid-period (9 Jul)`
                      : `${labelBucket(buckets[i].bucket, gran as Gran)}${buckets[i].partial ? ' · in progress' : ''} · ${fmt(n)}`
                    }
                    style={{ padding: '9px 4px', fontSize: 10, fontWeight: s.summary ? 800 : 700, color: blind ? MUTE : INK, borderLeft: `1px solid ${ROWHAIR}`, ...tnum }}>
                    {blind ? '–' : thin ? `${compact(n)}*` : compact(n)}
                  </span>
                )
              })}
              <span className="flex items-center justify-center" style={{ ...totalCol, padding: '9px 8px', fontSize: 11.5, fontWeight: 800, color: INK, ...tnum }}>{fmt(s.tot)}</span>
            </div>

            {/* "Of which" — the parts this station is made of, indented so the
                eye reads them as a breakdown rather than as more stations.
                They sum to the row above, which is the point. */}
            {s.breakdown?.map(b => (
              <div key={b.label} className="grid items-center" style={{ gridTemplateColumns: grid, borderBottom: `1px solid ${ROWHAIR}` }}>
                <span className="truncate" title={b.note}
                  style={{ padding: '6px 8px 6px 16px', fontSize: 10, fontWeight: 700, color: '#4A4A4A' }}>
                  ↳ of which {b.label}
                </span>
                {buckets.map(p => (
                  <span key={p.bucket} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 9.5, fontWeight: 700, color: '#4A4A4A', borderLeft: `1px solid ${ROWHAIR}`, ...tnum }}>
                    {compact(b.pick(p))}
                  </span>
                ))}
                <span style={{ ...totalCol, padding: '6px 8px', fontSize: 10.5, fontWeight: 800, color: '#4A4A4A', ...tnum }}>
                  {fmt(b.tot)}
                </span>
              </div>
            ))}

            {/* The step OUT of this station, sitting between the two counts it
                relates. Deliberately lighter than the two summary rates at the
                bottom: those are the headline numbers, these are the diagnostic
                that says which single step lost the people. */}
            {s.out && (
              <div className="grid items-center" style={{ gridTemplateColumns: grid, borderBottom: `1px solid ${ROWHAIR}` }}>
                <span className="truncate" style={{ padding: '5px 8px 6px 10px', fontSize: 9.5, fontWeight: 700, color: MUTE, letterSpacing: '0.02em' }}>
                  ↳ {s.out.label}
                </span>
                {buckets.map(p => {
                  // A rate whose numerator or denominator was never measured
                  // is not a rate. Blank it rather than print a fiction.
                  // Only a period with NO instrumentation at all is unmeasurable.
                  // A PARTIAL period (tracking started partway through, e.g. Jul
                  // 2026: 22 of 31 days) still has a real, if understated, rate —
                  // blanking it hid a whole month and answered a question nobody
                  // asked. It now shows with a * and says why.
                  const usesEvents = fromEvents || s.label === 'Quiz completed' || s.label === 'Checkout clicked'
                  const dead = usesEvents && p.eventsCovered === 'none'
                  const thinRate = usesEvents && p.eventsCovered === 'partial'
                  return (
                    <span key={p.bucket}
                      title={
                        dead ? 'not measurable — client tracking started 9 Jul'
                        : thinRate ? 'UNDERSTATED — tracking started partway through this period, so the denominator is short'
                        : undefined
                      }
                      style={{ padding: '5px 4px 6px', textAlign: 'center', fontSize: 9.5, fontWeight: 700, color: '#6B6B6B', borderLeft: `1px solid ${ROWHAIR}`, ...tnum }}>
                      {dead ? '–' : `${pctDisp(s.out!.per(p))}${thinRate ? '*' : ''}`}
                    </span>
                  )
                })}
                <span style={{ ...totalCol, padding: '5px 8px 6px', fontSize: 10.5, fontWeight: 800, color: '#6B6B6B', ...tnum }}>
                  {pctDisp(s.out.all)}
                </span>
              </div>
            )}
          </div>
        )
      })}

      {/* rate rows. `money` renders dollars instead of a percentage, and
          `Trial → annual` counts ONLY trials whose bill date has passed. */}
      {rateRows.map(rr => {
        const money = 'money' in rr && rr.money === true
        // Owner's display choice (2026-08-10): whole dollars on the face for
        // readability, exact cents ALWAYS on hover. The underlying sums stay
        // penny-true to Stripe; only the rendering rounds.
        const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        // The hover arithmetic must be TRUE, not plausible. A row whose money
        // comes at one price shows count × price; a row that mixes prices (a
        // conversion can be a $59.75 annual or the $49.75 half of a lifetime
        // bundle) lists what it is actually made of. Dividing a mixed total by
        // one assumed price produced "1 × $59.75 = $49.75" — arithmetic that
        // contradicts itself in the same sentence (owner, 2026-08-11).
        const arithOf = (v: number, parts?: [number, number][]) => {
          if (parts && parts.length) {
            const sum = parts.reduce((a, [c, n]) => a + (c / 100) * n, 0)
            return `${parts.map(([c, n]) => `${n} × $${(c / 100).toFixed(2)}`).join(' + ')} = $${sum.toFixed(2)}`
          }
          if (rr.unit) {
            const n = v / rr.unit
            // Only claim a count when the total really is that many units.
            if (Math.abs(n - Math.round(n)) < 0.005) return `${Math.round(n)} × $${rr.unit.toFixed(2)} = $${v.toFixed(2)}`
          }
          return `$${v.toFixed(2)} exact`
        }
        return (
          <div key={rr.label} className="grid items-center" style={{ gridTemplateColumns: grid, background: money ? '#F3F8F3' : rr.count ? '#F3F8F3' : LATTE, borderBottom: rr.heavy ? '2px solid #333333' : `1px solid ${ROWHAIR}` }}>
            <span style={{ padding: '9px 8px 9px 0', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: INK }}>
              {rr.label}
              {rr.label === 'Trial → annual' && (
                <span title={`Only counts the ${matureAll} trials whose annual bill date has already passed. A trial from last week is not due yet, so counting it would drag the column to zero.`} style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#6B6B6B', textTransform: 'none', letterSpacing: 0 }}>
                  · {matureAll} due
                </span>
              )}
              {rr.sub && (
                <span title={rr.sub} style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, color: '#6B6B6B', textTransform: 'none', letterSpacing: 0, cursor: 'help' }}>
                  ⓘ
                </span>
              )}
            </span>
            {buckets.map(p => {
              const v = rr.per(p)
              // Grayscale shading, and ONLY on the plain conversion-rate rows.
              // The colour scale on every cell made the table hard to read
              // (owner); the headline rows keep their colour instead, which is
              // what the eye should land on first.
              const shade = !money && !rr.count && !rr.heavy && rr.label !== 'Trial → annual'
                ? `rgba(26,26,26,${(0.03 + Math.min(1, v / 100) * 0.16).toFixed(3)})`
                : undefined
              return (
                <span key={p.bucket}
                  title={money ? `${labelBucket(p.bucket, gran as Gran)} · ${arithOf(v, rr.parts?.(p))}` : undefined}
                  style={{ padding: '9px 4px', textAlign: 'center', fontSize: 10, fontWeight: 800,
                           color: money ? '#2E7D32' : rr.count ? INK : '#B26A00',
                           background: shade, borderLeft: `1px solid ${ROWHAIR}`, ...tnum }}>
                  {money ? usd(v) : rr.count ? fmt(v) : (rr.label === 'Trial → annual' && p.matureTrials === 0 ? '–' : pctDisp(v))}
                </span>
              )
            })}
            <span title={money ? arithOf(rr.all, rr.parts ? buckets.flatMap(rr.parts).reduce((acc, [c, n]) => {
              const i = acc.findIndex(a => a[0] === c)
              if (i >= 0) acc[i] = [c, acc[i][1] + n]; else acc.push([c, n])
              return acc
            }, [] as [number, number][]).sort((a, b) => b[0] - a[0]) : undefined) : undefined} style={{ ...totalCol, padding: '9px 8px', fontSize: 11.5, fontWeight: 800, color: money ? '#2E7D32' : rr.count ? INK : '#B26A00', ...tnum }}>
              {money ? usd(rr.all) : rr.count ? fmt(rr.all) : `${rr.all.toFixed(rr.heavy ? 2 : 1)}%`}
            </span>
          </div>
        )
      })}

      {/* The people-vs-charges reconciliation, stated where the confusion
          happens. On 2026-08-10 the owner saw Net-new paid 8 against 6×$4.99
          and correctly refused to trust it; the ledger must explain itself
          here, not in a chat. */}
      {(lifetimeSplits > 0 || quizRepeatTrials > 0 || preWindowAnnuals > 0) && (
        <div style={{ fontSize: 10, color: '#6B6B6B', marginTop: 10, lineHeight: 1.55, maxWidth: 760 }}>
          <strong style={{ color: INK }}>How the trials rows reconcile:</strong>{' '}
          {lifetimeSplits > 0 && (
            <> {lifetimeSplits} charge{lifetimeSplits === 1 ? '' : 's'} of $54.74 (the LIFETIME upsell: $4.99 paid trial
            + $49.75 lifetime option instead of the $59.75/year renewal) {lifetimeSplits === 1 ? 'is' : 'are'} split
            accordingly — the $4.99 sits in the trials row, the $49.75 in Other Revenue.</>
          )}
          {quizRepeatTrials > 0 && <> {quizRepeatTrials} {quizRepeatTrials === 1 ? 'person' : 'people'} subscribed twice — only their FIRST $4.99 counts as a trial here, the extras sit in Other Revenue, so trials revenue always equals people × $4.99.</>}
          {preWindowAnnuals > 0 && (
            <> {preWindowAnnuals} × $59.75 (${(preWindowAnnuals * 59.75).toLocaleString(undefined, { maximumFractionDigits: 0 })}) belong
            to trial cohorts OLDER than this window (found via the trials sheet) and are not shown in any column — a recent week
            must never display conversions it could not have produced yet.</>
          )}
          {' '}Every cell reconciles to Stripe to the cent — hover it for the arithmetic.
        </div>
      )}
      {buckets.some(p => p.eventsCovered !== 'full') && (
        <div style={{ fontSize: 10, color: '#6B6B6B', marginTop: 8, lineHeight: 1.55, maxWidth: 760 }}>
          <strong style={{ color: INK }}>&ldquo;–&rdquo; means not measured, not zero.</strong> Client tracking started 9 Jul, four days
          after launch, so landing views, quiz starts and checkout clicks do not exist before then. Completions and paid
          come from the database and are complete throughout. A <strong style={{ color: INK }}>*</strong> marks a period
          where tracking started partway through — July 2026 has 22 of its 31 days — so those counts and rates are real
          but understated, and they are shown rather than hidden.
        </div>
      )}
      <div style={{ fontSize: 9.5, color: MUTE, marginTop: 6 }}>
        hover a cell for its exact figure · the light grey shading appears only on step-conversion rows, so the
        headline rows stay the ones your eye lands on
      </div>
    </div>
  )
}

export default function DashboardBento({ rows, sample, funnelEvents, placements, series, pct, otherPaid, quizExistingPaid, lifetimeSplits, quizRepeatTrials, preWindowAnnuals }: {
  rows: BentoRow[]; sample: 'launch' | 'all'; funnelEvents: FunnelEventCounts; placements: PlacementStat[]; series: Series; pct: boolean
  /** First-ever Stripe charges since launch the quiz cannot claim. Feeds the
   *  "Not from the quiz" station in the volume matrix. */
  otherPaid: number
  quizExistingPaid: number
  /** People-vs-charges reconciliation facts, rendered under the matrix. */
  lifetimeSplits: number
  quizRepeatTrials: number
  preWindowAnnuals: number
}) {
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [trendGran, setTrendGran] = useState<Gran | 'all'>('week') // shared across all step rows

  // Owner call, twice. 'unknown' and 'S0_unaware' are structurally empty, not
  // just rare: ZERO rows across every classified submission, verified again
  // 2026-08-09. You cannot be unaware of AI while voluntarily taking an AI
  // quiz, and 'unknown' only exists for CRM rows that never took one. Two
  // permanently blank columns on the ladder made the chart harder to read and
  // two permanently blank rows in the table below it read as missing data.
  const ladderDefs = useMemo(
    () => STAGES.filter(s => s.key !== 'unknown' && s.key !== 'S0_unaware'),
    [],
  )
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
  // THE NORTH STAR: trials the quiz produced, new customers AND existing ones
  // buying another trial (owner's definition, 2026-08-10).
  const quizTrialPeople = slice.filter(r => r.quizTrial)
  const cvr = takers > 0 ? (quizTrialPeople.length / takers) * 100 : 0
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
  const F = { landing: funnelEvents.landing, started: funnelEvents.started, completed: rows.length, checkout: funnelEvents.checkout, paid: wholeNetNew, otherPaid, quizExistingPaid }
  const fullFunnelCvr = F.landing > 0 ? (F.paid / F.landing) * 100 : 0
  const hasSeries = series.week.length > 0 || series.day.length > 0

  const bestCtr = placements.reduce<string | null>((best, p) => {
    if (!p.views || !p.clicks) return best
    const ctr = p.clicks / p.views
    const bp = placements.find(x => x.placement === best)
    return !bp || !bp.views || ctr > bp.clicks / bp.views ? p.placement : best
  }, null)
  // Source economics, moved here from /admin/ads at the owner's request.
  //
  // It belongs on the dashboard because it answers "where do buyers come from
  // and what is one taker from there worth", which is a dashboard question, not
  // an advertising one. The ads page keeps it too, priced against spend; here
  // it is unpriced, so a free source and a paid source can be compared on the
  // only thing they share, what a taker is worth.
  const sourceEconomics = useMemo(() => {
    const m = new Map<string, { takers: number; paid: number; revenue: number }>()
    for (const r of rows) {
      const k = r.utmQuiz || '(direct)'
      const e = m.get(k) || { takers: 0, paid: 0, revenue: 0 }
      e.takers++
      if (r.netNew) { e.paid++; e.revenue += r.ltv }
      m.set(k, e)
    }
    return Array.from(m.entries())
      .map(([source, v]) => ({
        source,
        ...v,
        buyRate: v.takers > 0 ? (v.paid / v.takers) * 100 : 0,
        // ARPU over EVERY taker, not just buyers: this is what one more visitor
        // from that source is worth, which is the number you would bid with.
        arpu: v.takers > 0 ? v.revenue / v.takers : 0,
      }))
      .filter(r => r.takers >= 5)
      .sort((a, b) => b.arpu - a.arpu || b.takers - a.takers)
  }, [rows])

  // The button that SELLS, which is not always the button that gets clicked.
  // Badging the top click rate as "Best" was quietly wrong: the click-quality
  // guardrail already caught an arm winning on clicks while selling less.
  const bestSeller = placements.reduce<string | null>((best, p) => {
    if (!p.sales) return best
    const bp = placements.find(x => x.placement === best)
    return !bp || p.sales > bp.sales ? p.placement : best
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
            { label: sample === 'launch' ? 'Total quiz takers' : 'Total records', v: takers.toLocaleString(), hint: stageFilter ? 'in the selected stage' : 'unique people, one shared cohort', dark: false },
            { label: 'Full-funnel CVR', v: `${fullFunnelCvr.toFixed(2)}%`, hint: `net-new ÷ ${F.landing.toLocaleString()} landing views`, dark: false },
            { label: 'Quiz → trial CVR', v: `${cvr.toFixed(1)}%`, hint: `quiz-earned trials ÷ ${takers.toLocaleString()} quiz takers · the north star`, dark: true },
            { label: 'Quiz-earned trials', v: quizTrialPeople.length.toLocaleString(), hint: `${netNewPeople.length} new customers + ${quizTrialPeople.length - netNewPeople.length} existing buying another trial`, dark: false },
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
            ? <div className="ac-scrollx"><VolumeMatrix series={series} gran={trendGran} F={F} lifetimeSplits={lifetimeSplits} quizRepeatTrials={quizRepeatTrials} preWindowAnnuals={preWindowAnnuals} /></div>
            : <p style={{ padding: '16px 20px', fontSize: 12, color: MUTE }}>No time-series data in this window yet.</p>}
        </div>

        {/* ── Row 3 · ladder (the filter) · stage × conversions · where buyers came from.
               Equal thirds, so the column dividers line up with the breakdowns
               grid below and the whole bento reads on one vertical rhythm. ── */}
        <div className="grid ac-thirds" style={{ gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid #333333' }}>
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
            <div className="grid" style={{ gridTemplateColumns: GRID_STAGE, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B6B6B', borderBottom: `1px solid ${HAIR}` }}>
              <span style={{ padding: '5px 0 5px 6px' }}>Stage</span>
              <span style={{ padding: '5px 0', textAlign: 'right' }}>N</span>
              <span style={{ padding: '5px 0', textAlign: 'right' }}>Net</span>
              <span style={{ padding: '5px 0', textAlign: 'right' }}>CVR</span>
              <span style={{ padding: '5px 0', textAlign: 'right' }}>Revenue</span>
              <span style={{ padding: '5px 0', textAlign: 'right' }} title="Revenue divided by every taker at this stage, not just the buyers. What one more taker of this stage is worth.">ARPU</span>
            </div>
            {ladderDefs.map(def => {
              const sRows = rows.filter(r => r.stage === def.key)
              const paying = sRows.filter(r => r.netNew)
              const revenue = paying.reduce((a, b) => a + b.ltv, 0)
              const conv = sRows.length > 0 ? (paying.length / sRows.length) * 100 : 0
              return (
                <div key={def.key} className="grid items-center" style={{ gridTemplateColumns: GRID_STAGE, fontSize: 11.5, borderBottom: `1px solid ${ROWHAIR}`, background: stageFilter === def.key ? LATTE : 'transparent' }}>
                  <span className="flex items-center" style={{ padding: '6px 0 6px 6px', fontWeight: 700, gap: 7, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ width: 7, height: 7, background: def.color, flexShrink: 0 }} />{def.emoji} {def.label}
                  </span>
                  <span style={{ padding: '6px 0', textAlign: 'right', ...tnum }}>{sRows.length}</span>
                  <span style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, ...tnum }}>{paying.length}</span>
                  <span style={{ padding: '6px 0', textAlign: 'right', color: '#046BB1', fontWeight: 700, ...tnum }}>{conv.toFixed(1)}%</span>
                  <span style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#62A758', ...tnum }}>${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#B26A00', ...tnum }}>{sRows.length > 0 ? `$${(revenue / sRows.length).toFixed(2)}` : '-'}</span>
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

        {/* ── Source economics · what one taker from each source is worth ── */}
        <div style={{ borderTop: '1px solid #333333' }}>
          <div className="flex items-baseline justify-between" style={{ padding: '12px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}`, gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>What a taker is worth, by source</span>
            <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>ARPU is revenue ÷ ALL takers, so it is what one more visitor is worth · sources under 5 takers hidden</span>
          </div>
          <div className="ac-scrollx"><div>
            <div className="grid" style={{ gridTemplateColumns: GRID_SRC, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B6B6B', borderBottom: `1px solid ${HAIR}`, padding: '0 20px' }}>
              <span style={{ padding: '8px 0' }}>Source</span>
              <span style={{ padding: '8px 0', textAlign: 'right' }}>Takers</span>
              <span style={{ padding: '8px 0', textAlign: 'right' }}>Paid</span>
              <span style={{ padding: '8px 0', textAlign: 'right' }}>Buy rate</span>
              <span style={{ padding: '8px 0', textAlign: 'right' }}>Revenue</span>
              <span style={{ padding: '8px 0', textAlign: 'right' }}>ARPU</span>
            </div>
            {sourceEconomics.length === 0 && <p style={{ padding: '10px 20px', fontSize: 12, color: MUTE }}>No source data in this window.</p>}
            {sourceEconomics.map(r => (
              <div key={r.source} className="grid items-center hover:bg-[#FEF7E7]" style={{ gridTemplateColumns: GRID_SRC, fontSize: 12, borderBottom: `1px solid ${ROWHAIR}`, padding: '6px 20px' }}>
                <span style={{ fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.source}>{r.source}</span>
                <span style={{ textAlign: 'right', ...tnum }}>{r.takers.toLocaleString()}</span>
                <span style={{ textAlign: 'right', fontWeight: 700, ...tnum }}>{r.paid.toLocaleString()}</span>
                <span style={{ textAlign: 'right', fontWeight: 700, color: '#046BB1', ...tnum }}>{r.buyRate.toFixed(1)}%</span>
                <span style={{ textAlign: 'right', ...tnum }}>${r.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span style={{ textAlign: 'right', fontWeight: 800, color: r.arpu > 0 ? '#62A758' : MUTE, ...tnum }}>${r.arpu.toFixed(2)}</span>
              </div>
            ))}
          </div></div>
        </div>

        {/* ── Row 7 · CTA placements with the component that was shown ── */}
        <div style={{ borderTop: '1px solid #333333' }}>
          <div className="flex items-baseline justify-between" style={{ padding: '12px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}` }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Which CTA gets clicked</span>
            <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>of the people who SAW each button, how many clicked it · since Jul 5</span>
          </div>
          <div className="ac-scrollx"><div>
          <div className="grid" style={{ gridTemplateColumns: GRID_CTA, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B6B6B', borderBottom: `1px solid ${HAIR}`, padding: '0 20px' }}>
            <span style={{ padding: '8px 0' }}>Shown</span><span style={{ padding: '8px 0' }}>Button</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Saw it</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Clicked</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Rate</span><span style={{ padding: '8px 0', textAlign: 'right' }} title="Net-new paid among the people who clicked THIS button">Sold</span><span style={{ padding: '8px 0', textAlign: 'right' }} title="Revenue from the people who clicked this button">Revenue</span>
          </div>
          {placements.length === 0 && <p style={{ padding: '10px 20px', fontSize: 12, color: MUTE }}>No placement events yet.</p>}
          {placements.map(p => (
            <div key={p.placement} className="grid items-center hover:bg-[#FEF7E7]" style={{ gridTemplateColumns: GRID_CTA, fontSize: 12, borderBottom: `1px solid ${ROWHAIR}`, padding: '6px 20px' }}>
              <PlacementThumb placement={p.placement} />
              <span className="flex items-center" style={{ fontSize: 12, fontWeight: 600, color: INK, gap: 8, minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.placement}>{humanizePlacement(p.placement)}</span>
                {bestSeller === p.placement && <span title="Most net-new sales, not most clicks" style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: '#62A758', color: '#FFFFFF', padding: '1px 6px', flexShrink: 0 }}>Sells</span>}
                {bestCtr === p.placement && <span title="Highest click rate. Clicks are not sales, see the Sold column." style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: '#E7B02F', color: '#333333', padding: '1px 6px', flexShrink: 0 }}>Clicks</span>}
              </span>
              <span style={{ textAlign: 'right', ...tnum }}>{p.views > 0 ? p.views.toLocaleString() : '–'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, ...tnum }}>{p.clicks.toLocaleString()}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: '#046BB1', ...tnum }}>{p.views > 0 ? `${((p.clicks / p.views) * 100).toFixed(1)}%` : '–'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: p.sales > 0 ? '#62A758' : MUTE, ...tnum }}>{p.sales > 0 ? p.sales.toLocaleString() : '–'}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: p.revenue > 0 ? '#62A758' : MUTE, ...tnum }}>{p.revenue > 0 ? `$${p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '–'}</span>
            </div>
          ))}
          </div></div>
        </div>
      </div>
    </div>
  )
}
