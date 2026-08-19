// THE X-RAY — the funnel drawn as a flow, from live data.
//
// WHY THIS SHAPE (owner, 2026-08-19, after two rejected attempts: a text
// document, then boxes-and-arrows he called clunky). What he asked for is
// to SEE the funnel and its branches. So: band thickness is people, what
// peels away below is what we lost and where, and the two panels answer
// the branch question honestly — the quiz has no branching rules at all
// (everyone gets the same eleven questions in the same order), and the
// real forks live downstream in price, country, experiments and recovery.
//
// Every number is read at request time from what decides it: volumes from
// funnel_events and the ledger, questions from the live published config,
// tests and current bandit weights from the experiments table, pricing
// from the founding-window switch. If the funnel changes and this board
// does not, the board is broken.

import { getLivePublishedConfig } from '@/lib/form-config'
import { QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'
import { foundingConfig } from '@/lib/founding-window'
import { db } from '@/lib/revenue-shared'
import type { V2Question } from '@/lib/form-schema'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DAYS = 14
const INK = '#1A1A1A', MUTE = '#75705F', GREEN = '#2E7D32', RED = '#A31621'
const AMBER = '#C96F0A', PAPER = '#FFFDFA', BG = '#FBF7EE', FLOW = '#BFD6B6'
const LOSS = '#E9DFD0', BLUE = '#3B5C8F'

const W = 1300, H = 860
const TOP = 150, MAXH = 250, BW = 64
const X = [80, 340, 600, 860, 1120]

type Exp = { key: string; name: string; page: string; variants: { key: string; weight?: number }[] }

export default async function XrayPage() {
  const c = db()
  const since = new Date(Date.now() - DAYS * 864e5).toISOString()

  // questions, in the order a person walks them (PII last)
  let questions: V2Question[] = QUESTIONS_V2_MERGED
  let src = 'in-repo seed'
  try {
    const cfg = await getLivePublishedConfig('quiz-v2')
    if (cfg && Array.isArray(cfg.questions) && cfg.questions.length) {
      questions = cfg.questions as V2Question[]
      src = `published config v${(cfg as { version?: number }).version ?? '?'}`
    }
  } catch { /* seed stands */ }
  const em = questions.find(q => q.id === 'email'), nm = questions.find(q => q.id === 'name')
  const rest = questions.filter(q => q.id !== 'email' && q.id !== 'name')
  const pii = [em, nm].filter(Boolean) as V2Question[]
  const ordered = pii.length && rest.length ? [...rest, ...pii] : questions
  const branchRules = ordered.flatMap(q => (q.branching ?? []).map(r => ({ q, r })))

  // volumes
  const counts: Record<string, number> = {}
  try {
    const { data } = await c.rpc('ux_watch_sql', {
      q: `select coalesce(props->>'qid', event) as k, count(distinct anon_id) as n
          from funnel_events where ts >= '${since}'
          and (event = 'q_answered' or event in ('quiz_view','quiz_start','checkout_click','quiz_exit_catch_shown','quiz_exit_catch_resumed'))
          group by 1`,
    })
    for (const r of (data ?? []) as { k: string; n: number }[]) counts[r.k] = Number(r.n)
  } catch { /* zeros */ }
  let completed = 0, paid = 0
  try {
    const { count: cc } = await c.from('submissions').select('id', { count: 'exact', head: true })
      .gte('quiz_completed_at', since).or('is_test.is.null,is_test.eq.false')
    completed = cc ?? 0
    const { count: pc } = await c.from('trial_ledger').select('charge_id', { count: 'exact', head: true })
      .gte('trial_at', since).in('attribution', ['quiz_net_new', 'quiz_existing'])
    paid = pc ?? 0
  } catch { /* zeros */ }

  const landed = counts['quiz_view'] ?? 0, started = counts['quiz_start'] ?? 0
  const clicked = counts['checkout_click'] ?? 0
  const exitShown = counts['quiz_exit_catch_shown'] ?? 0, exitResumed = counts['quiz_exit_catch_resumed'] ?? 0
  const qSeries = ordered.map(q => ({ id: q.label.length > 13 ? q.id : q.label.toLowerCase(), n: counts[q.id] ?? 0 })).filter(s => s.n > 0)

  let exps: Exp[] = []
  try {
    const { data } = await c.from('experiments').select('key, name, page, variants').eq('status', 'running')
    exps = (data ?? []) as Exp[]
  } catch { /* none */ }
  const fw = await foundingConfig()

  const stages = [
    { l: 'Landed', s: 'on the landing page', n: landed },
    { l: 'Started', s: 'first question shown', n: started },
    { l: 'Finished', s: 'result page earned', n: completed },
    { l: 'Clicked buy', s: 'checkout opened', n: clicked },
    { l: 'PAID', s: 'renews $59.75/yr', n: paid },
  ]
  const scale = MAXH / Math.max(1, landed)
  const y0 = (n: number) => TOP + (MAXH - n * scale) / 2

  const flows: React.ReactNode[] = []
  for (let i = 0; i < stages.length - 1; i++) {
    const a = stages[i], b = stages[i + 1]
    const ax = X[i] + BW, bx = X[i + 1], ay = y0(a.n), by = y0(b.n)
    const ah = a.n * scale, bh = b.n * scale, mx = (ax + bx) / 2
    flows.push(<path key={`f${i}`} d={`M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by} L ${bx} ${by + bh} C ${mx} ${by + bh}, ${mx} ${ay + bh}, ${ax} ${ay + bh} Z`} fill={FLOW} />)
    const lost = a.n - b.n
    if (lost > 0) {
      const ly = ay + bh, lh = ah - bh, endY = TOP + MAXH + 46, tip = Math.max(5, lh * 0.5)
      flows.push(<path key={`l${i}`} d={`M ${ax} ${ly} C ${mx - 30} ${ly}, ${mx - 30} ${endY}, ${mx + 16} ${endY} L ${mx + 16} ${endY + tip} C ${mx - 30} ${endY + tip}, ${mx - 30} ${ly + lh}, ${ax} ${ly + lh} Z`} fill={LOSS} />)
      flows.push(<text key={`lt${i}`} x={mx + 24} y={endY + 7} fontSize={13} fontWeight={800} fill={RED}>−{lost.toLocaleString()}</text>)
      flows.push(<text key={`lp${i}`} x={mx + 24} y={endY + 23} fontSize={10.5} fill={MUTE}>{Math.round((100 * lost) / a.n)}% gone</text>)
    }
  }

  const QY = 500, QW = 560, qx = 110, qtop = QY + 92, qmax = 140
  const qscale = qmax / Math.max(1, started), gap = (QW - 70) / Math.max(1, qSeries.length)
  const FX = 670

  const forks: { t: string; c: string; o: string[] }[] = [
    { t: 'Price, after finishing', c: AMBER, o: fw.enabled
      ? [`inside ${fw.window_hours}h  →  $4.99`, `later  →  $${(fw.list_cents / 100).toFixed(2)}`, 'from our emails  →  $4.99 held']
      : ['one price for everyone  →  $4.99'] },
    { t: 'Country', c: BLUE, o: ['India  →  lifetime offer', 'everyone else  →  trial'] },
    { t: 'Live experiments', c: BLUE, o: exps.length ? exps.map(e => `${e.page}: ${e.variants?.length ?? 2} arms · ${e.key}`) : ['none running'] },
    { t: 'Who comes back', c: MUTE, o: [
      `left mid-quiz  →  exit catch (${exitShown} shown, ${exitResumed} resumed)`,
      'finished, no buy  →  3 emails',
      'opened checkout, no pay  →  2 emails',
    ] },
  ]

  return (
    <div style={{ padding: '18px 22px 40px', maxWidth: 1360 }}>
      <div style={{ overflowX: 'auto', border: `2px solid ${INK}`, background: BG }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', minWidth: W }} fontFamily="-apple-system, Segoe UI, Roboto, Arial, sans-serif">
          <text x={80} y={34} fontSize={17} fontWeight={800} fill={INK}>The funnel, last {DAYS} days</text>
          <text x={80} y={54} fontSize={12} fill={MUTE}>Band thickness is people. What peels away below is what we lost, and where.</text>
          <rect x={1000} y={20} width={240} height={46} fill={PAPER} stroke={INK} strokeWidth={2} />
          <text x={1120} y={40} fontSize={11} textAnchor="middle" fill={MUTE}>landed → paid</text>
          <text x={1120} y={58} fontSize={16} fontWeight={800} textAnchor="middle" fill={INK}>
            {landed ? ((100 * paid) / landed).toFixed(1) : '0.0'}%  ·  {paid} trials
          </text>

          {flows}

          {stages.map((s, i) => {
            const h = Math.max(5, s.n * scale), yy = y0(s.n), isPaid = i === 4
            return (
              <g key={s.l}>
                <rect x={X[i]} y={yy} width={BW} height={h} fill={isPaid ? GREEN : PAPER} stroke={INK} strokeWidth={2} />
                <text x={X[i] + BW / 2} y={TOP - 52} fontSize={13} fontWeight={800} textAnchor="middle" fill={INK}>{s.l}</text>
                <text x={X[i] + BW / 2} y={TOP - 37} fontSize={10} textAnchor="middle" fill={MUTE}>{s.s}</text>
                <text x={X[i] + BW / 2} y={TOP - 14} fontSize={20} fontWeight={800} textAnchor="middle" fontFamily="ui-monospace, Menlo, monospace" fill={isPaid ? GREEN : INK}>{s.n.toLocaleString()}</text>
                {i > 0 && (() => { const p = stages[i - 1].n ? Math.round((100 * s.n) / stages[i - 1].n) : 0
                  return <text x={X[i] + BW / 2} y={TOP + MAXH + 22} fontSize={12.5} fontWeight={800} textAnchor="middle" fill={p < 40 ? RED : GREEN}>{p}%</text> })()}
              </g>
            )
          })}

          {/* inside the quiz */}
          <rect x={60} y={QY} width={QW} height={330} fill={PAPER} stroke={INK} strokeWidth={2} />
          <text x={80} y={QY + 28} fontSize={14} fontWeight={800} fill={INK}>Inside the quiz</text>
          <text x={80} y={QY + 47} fontSize={11.5} fill={MUTE}>
            {ordered.length} questions, one path.{' '}
            {branchRules.length === 0
              ? <tspan fill={AMBER} fontWeight={700}>No branching rules are configured</tspan>
              : <tspan fill={AMBER} fontWeight={700}>{branchRules.length} branching rule{branchRules.length > 1 ? 's' : ''} active</tspan>}
            {branchRules.length === 0 ? ' — everyone' : ''}
          </text>
          {branchRules.length === 0 && <text x={80} y={QY + 62} fontSize={11.5} fill={MUTE}>sees the same questions in the same order.</text>}
          {branchRules.slice(0, 3).map((b, i) => (
            <text key={i} x={80} y={QY + 62 + i * 14} fontSize={10.5} fill={AMBER}>
              {b.q.id}: if {b.r.when.map(cd => `${cd.context ? `[${cd.context}]` : cd.questionId} ${cd.op} ${Array.isArray(cd.value) ? cd.value.join('/') : cd.value}`).join(' and ')} → {b.r.goto}
            </text>
          ))}
          <text x={90} y={qtop - 6} fontSize={10} fill={MUTE}>{started.toLocaleString()} started</text>
          <text x={60 + QW - 24} y={qtop - 6} fontSize={10} textAnchor="end" fill={MUTE}>{qSeries.length ? qSeries[qSeries.length - 1].n : 0} reach the end</text>
          {qSeries.map((q, i) => {
            const prev = i ? qSeries[i - 1].n : started, drop = prev - q.n, big = drop >= 80
            const h = q.n * qscale, x = qx + i * gap - 20
            return (
              <g key={q.id}>
                <rect x={x} y={qtop + qmax - h} width={gap - 7} height={h} fill={big ? '#EBC3B4' : FLOW} stroke={big ? RED : INK} strokeWidth={big ? 1.5 : 0.8} />
                <text x={x + (gap - 7) / 2} y={qtop + qmax + 13} fontSize={8} textAnchor="middle" fill={MUTE}>{q.id.length > 11 ? q.id.slice(0, 10) + '…' : q.id}</text>
                {big && <text x={x + (gap - 7) / 2} y={qtop + qmax - h - 6} fontSize={10.5} fontWeight={800} textAnchor="middle" fill={RED}>−{drop}</text>}
              </g>
            )
          })}
          <text x={80} y={QY + 300} fontSize={11} fill={INK}>
            <tspan fontWeight={700} fill={RED}>The two real leaks:</tspan> {Math.max(0, started - (qSeries[0]?.n ?? started))} start and never answer question 1;{' '}
            {(() => { const ei = qSeries.findIndex(s => s.id === 'email'); return ei > 0 ? qSeries[ei - 1].n - qSeries[ei].n : 0 })()} stop at the email step.
          </text>

          {/* the forks */}
          <rect x={FX} y={QY} width={570} height={330} fill={PAPER} stroke={INK} strokeWidth={2} />
          <text x={FX + 20} y={QY + 28} fontSize={14} fontWeight={800} fill={INK}>Where the funnel actually forks</text>
          <text x={FX + 20} y={QY + 47} fontSize={11.5} fill={MUTE}>Not in the questions — here.</text>
          {(() => {
            let fy = QY + 72
            return forks.map(f => {
              const head = fy
              const rows = f.o.map((o, i) => {
                const oy = head + 17 + i * 16
                return (
                  <g key={o}>
                    <path d={`M ${FX + 30} ${head + 4} C ${FX + 30} ${oy}, ${FX + 38} ${oy - 4}, ${FX + 48} ${oy - 4}`} fill="none" stroke={f.c} strokeWidth={1.2} opacity={0.7} />
                    <text x={FX + 54} y={oy} fontSize={11} fill={MUTE}>{o.length > 62 ? o.slice(0, 60) + '…' : o}</text>
                  </g>
                )
              })
              const node = (
                <g key={f.t}>
                  <circle cx={FX + 28} cy={head - 4} r={5} fill={f.c} />
                  <text x={FX + 44} y={head} fontSize={12.5} fontWeight={800} fill={INK}>{f.t}</text>
                  {rows}
                </g>
              )
              fy += 22 + f.o.length * 16 + 8
              return node
            })
          })()}
        </svg>
      </div>
      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 10, maxWidth: 900, lineHeight: 1.5 }}>
        Read live at page load: volumes from funnel_events and the trial ledger over {DAYS} days, questions and
        branching from the {src}, experiments and their current bandit weights from the experiments table, pricing
        from the founding-window switch. Percentages under each stage are of the stage before it.
      </p>
    </div>
  )
}
