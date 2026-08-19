// THE X-RAY — the funnel as a board, drawn from live data.
//
// WHY IT EXISTS (owner, 2026-08-19): "over the last 2 weeks we shipped many
// things and now it's hard to track where we are", then, of the first
// version: "it's a lot of text, I was expecting a Miro or whiteboard with
// the branches". So this is a canvas: boxes, arrows, and the real numbers
// ON the arrows, because a map that shows where people leave is a decision
// tool and a map that only shows structure is wallpaper.
//
// Every value is read at request time from whatever decides it: questions
// and branching from the live published form config, per-step volumes from
// funnel_events, running tests and their current bandit weights from the
// experiments table, the price switch from app_settings. If the funnel
// changes and this board does not, the board is broken.

import { getLivePublishedConfig } from '@/lib/form-config'
import { QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'
import { foundingConfig } from '@/lib/founding-window'
import { db } from '@/lib/revenue-shared'
import type { V2Question } from '@/lib/form-schema'
import XrayCanvas from '@/components/admin/XrayCanvas.client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const INK = '#1A1A1A'
const MUTE = '#75705F'
const HAIR = '#DED7C7'
const PAPER = '#FFFDFA'
const LATTE = '#FEF7E7'
const GREEN = '#2E7D32'
const AMBER = '#C96F0A'
const RED = '#A31621'
const BLUE = '#3B5C8F'

const WINDOW_DAYS = 14

type Exp = { key: string; name: string; page: string; status: string; variants: { key: string; weight?: number }[]; primary_metric: string | null }

// ── board geometry ──
const W = 1180
const NODE_W = 250
const SPINE_X = 300
const BRANCH_X = 700
const LEAK_X = 20

export default async function XrayPage() {
  // 1 · the questions, in the order a person actually walks them
  let questions: V2Question[] = QUESTIONS_V2_MERGED
  let src = 'in-repo seed'
  try {
    const cfg = await getLivePublishedConfig('quiz-v2')
    if (cfg && Array.isArray(cfg.questions) && cfg.questions.length) {
      questions = cfg.questions as V2Question[]
      src = `published config v${(cfg as { version?: number }).version ?? '?'}`
    }
  } catch { /* seed stands */ }
  const email = questions.find(q => q.id === 'email')
  const name = questions.find(q => q.id === 'name')
  const rest = questions.filter(q => q.id !== 'name' && q.id !== 'email')
  const pii = [email, name].filter(Boolean) as V2Question[]
  const ordered = pii.length && rest.length ? [...rest, ...pii] : questions

  // 2 · live volumes
  const c = db()
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString()
  const counts: Record<string, number> = {}
  let landed = 0, started = 0, completed = 0, clicked = 0, trials = 0, exitShown = 0, exitResumed = 0, formReady = 0
  try {
    const { data } = await c.rpc('ux_watch_sql', {
      q: `select coalesce(props->>'qid', event) as k, count(distinct anon_id) as n
          from funnel_events
          where ts >= '${since}'
            and (event = 'q_answered' or event in ('quiz_view','quiz_start','result_view','checkout_click','checkout_form_ready','quiz_exit_catch_shown','quiz_exit_catch_resumed'))
          group by 1`,
    })
    for (const r of (data ?? []) as { k: string; n: number }[]) counts[r.k] = Number(r.n)
    landed = counts['quiz_view'] ?? 0
    started = counts['quiz_start'] ?? 0
    clicked = counts['checkout_click'] ?? 0
    formReady = counts['checkout_form_ready'] ?? 0
    exitShown = counts['quiz_exit_catch_shown'] ?? 0
    exitResumed = counts['quiz_exit_catch_resumed'] ?? 0
  } catch { /* board still draws, counts just read 0 */ }
  try {
    const { count } = await c.from('submissions').select('id', { count: 'exact', head: true })
      .gte('quiz_completed_at', since).or('is_test.is.null,is_test.eq.false')
    completed = count ?? 0
    const { count: t } = await c.from('trial_ledger').select('charge_id', { count: 'exact', head: true })
      .gte('trial_at', since).in('attribution', ['quiz_net_new', 'quiz_existing'])
    trials = t ?? 0
  } catch { /* ignore */ }

  // 3 · what is being tested, and the price switch
  let exps: Exp[] = []
  try {
    const { data } = await c.from('experiments').select('key, name, page, status, variants, primary_metric').eq('status', 'running')
    exps = (data ?? []) as Exp[]
  } catch { /* ignore */ }
  const testOn = (p: string) => exps.filter(e => (e.page || '').replace(/^\//, '') === p)
  const fw = await foundingConfig()

  // ── node model ──
  type Node = { id: string; x: number; y: number; w: number; h: number; title: string; sub?: string; n?: number; kind: 'stage' | 'q' | 'leak' | 'fork'; test?: string; note?: string }
  const nodes: Node[] = []
  const edges: { from: string; to: string; label?: string; kind?: 'main' | 'leak' | 'branch' | 'loop' }[] = []
  let y = 30
  const push = (nd: Omit<Node, 'x' | 'y' | 'w' | 'h'> & { x?: number; w?: number; h?: number }) => {
    const node: Node = { x: nd.x ?? SPINE_X, y, w: nd.w ?? NODE_W, h: nd.h ?? 58, ...nd } as Node
    nodes.push(node); y += node.h + 30
    return node
  }

  const landingTests = testOn('landing').map(e => e.key).join(' · ')
  push({ id: 'landing', title: 'Landing', sub: 'quiz.thecentral.ai', n: landed, kind: 'stage', test: landingTests })
  push({ id: 'start', title: 'Quiz started', sub: 'question-first entry', n: started, kind: 'stage' })

  const quizTests = testOn('quiz').map(e => e.key).join(' · ')
  ordered.forEach((q, i) => {
    const nd = push({
      id: `q-${q.id}`, kind: 'q', h: 52,
      title: `${i + 1}. ${q.label.length > 46 ? q.label.slice(0, 44) + '…' : q.label}`,
      sub: q.dbColumn ? `→ ${q.dbColumn}` : q.type,
      n: counts[q.id],
      test: i === 0 && quizTests ? quizTests : undefined,
      note: q.branching?.length ? `${q.branching.length} branch${q.branching.length > 1 ? 'es' : ''}` : undefined,
    })
    if (q.branching?.length) {
      q.branching.forEach((r, ri) => {
        const bid = `b-${q.id}-${ri}`
        nodes.push({
          id: bid, x: BRANCH_X, y: nd.y, w: 300, h: 52, kind: 'fork',
          title: r.goto === 'end' ? 'jump to the end' : `jump to “${r.goto}”`,
          sub: r.when.map(cd => `${cd.context ? `[${cd.context}]` : cd.questionId} ${cd.op} ${Array.isArray(cd.value) ? cd.value.join('/') : cd.value}`).join(' and '),
        })
        edges.push({ from: `q-${q.id}`, to: bid, kind: 'branch' })
      })
    }
  })

  const calc = push({ id: 'calc', title: 'Building what you earned', sub: '3-second completion beat', n: completed, kind: 'stage' })
  const resultTests = testOn('result').map(e => e.key).join(' · ')
  push({
    id: 'result', title: 'Result page', sub: 'hero → plan → OFFER → proof → pass', n: counts['result_view'], kind: 'stage', h: 66,
    test: resultTests,
    note: fw.enabled ? `$4.99 for ${fw.window_hours}h, then $${(fw.list_cents / 100).toFixed(2)}` : 'flat $4.99',
  })
  push({ id: 'click', title: 'Buy clicked', sub: 'embedded Stripe modal', n: clicked, kind: 'stage' })
  push({ id: 'form', title: 'Payment form ready', sub: 'wallets or card', n: formReady, kind: 'stage' })
  push({ id: 'paid', title: 'PAID TRIAL', sub: 'renews $59.75/yr at day 28', n: trials, kind: 'stage', h: 62 })

  // leaks and loops, in the left lane
  const exitY = nodes.find(n => n.id === 'q-email')?.y ?? 400
  nodes.push({ id: 'exitcatch', x: LEAK_X, y: exitY - 120, w: 232, h: 60, kind: 'leak', title: 'Mid-quiz exit catch', sub: `${exitShown} shown · ${exitResumed} resumed`, n: undefined })
  edges.push({ from: 'exitcatch', to: 'start', kind: 'loop', label: 'resumes' })
  nodes.push({ id: 'partial', x: LEAK_X, y: exitY - 40, w: 232, h: 56, kind: 'leak', title: 'Partial lead saved', sub: 'a valid email alone is kept' })
  const clickNode = nodes.find(n => n.id === 'click')!
  nodes.push({ id: 'ckrec', x: LEAK_X, y: clickNode.y, w: 232, h: 60, kind: 'leak', title: 'Checkout recovery email', sub: 'opened, did not pay → 2 emails' })
  edges.push({ from: 'click', to: 'ckrec', kind: 'leak' })
  const calcNode = nodes.find(n => n.id === 'calc')!
  nodes.push({ id: 'passrec', x: BRANCH_X, y: calcNode.y + 40, w: 300, h: 60, kind: 'leak', title: 'Post-quiz sequence (3 emails)', sub: 'pass · week 1 · the stage above · holds $4.99' })
  edges.push({ from: 'calc', to: 'passrec', kind: 'leak' })
  const resultNode = nodes.find(n => n.id === 'result')!
  nodes.push({ id: 'pricefork', x: BRANCH_X, y: resultNode.y - 8, w: 300, h: 96, kind: 'fork',
    title: fw.enabled ? 'Which price this person sees' : 'One price for everyone',
    sub: fw.enabled
      ? `inside ${fw.window_hours}h of finishing → $4.99 · later → $${(fw.list_cents / 100).toFixed(2)} · arriving from our emails → $4.99 held`
      : '$4.99 flat' })
  edges.push({ from: 'result', to: 'pricefork', kind: 'branch' })

  // main spine edges with real conversion labels
  const seq = ['landing', 'start', ...ordered.map(q => `q-${q.id}`), 'calc', 'result', 'click', 'form', 'paid']
  for (let i = 0; i < seq.length - 1; i++) {
    const a = nodes.find(n => n.id === seq[i])!, b = nodes.find(n => n.id === seq[i + 1])!
    let label: string | undefined
    if (typeof a.n === 'number' && typeof b.n === 'number' && a.n > 0) {
      const pct = Math.round((b.n / a.n) * 100)
      const lost = a.n - b.n
      label = lost > 0 ? `${pct}% · −${lost}` : `${pct}%`
    }
    edges.push({ from: a.id, to: b.id, label, kind: 'main' })
  }

  const H = y + 40
  const nodeById = (id: string) => nodes.find(n => n.id === id)!
  const fill = (k: Node['kind']) => (k === 'q' ? PAPER : k === 'leak' ? '#F4EFE3' : k === 'fork' ? LATTE : PAPER)
  const stroke = (k: Node['kind']) => (k === 'leak' ? MUTE : k === 'fork' ? AMBER : INK)

  return (
    <div style={{ padding: '20px 24px 40px', maxWidth: 1320 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK, margin: 0 }}>X-ray</h1>
      <p style={{ fontSize: 13, color: MUTE, margin: '6px 0 14px', maxWidth: 860, lineHeight: 1.5 }}>
        The whole funnel as it stands, drawn from live data: questions and branches from the {src}, volumes from the
        last {WINDOW_DAYS} days, tests and their current weights from the experiments table, pricing from the founding
        window. Numbers on the arrows are people, and what percentage of the step above them carried on.
      </p>

      <XrayCanvas width={W} height={H}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          <defs>
            <marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 z" fill={INK} />
            </marker>
            <marker id="ar-l" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 z" fill={MUTE} />
            </marker>
            <marker id="ar-b" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 z" fill={AMBER} />
            </marker>
          </defs>

          {edges.map((e, i) => {
            const a = nodeById(e.from), b = nodeById(e.to)
            const isMain = e.kind === 'main'
            const col = e.kind === 'branch' ? AMBER : e.kind === 'main' ? INK : MUTE
            let d: string
            if (isMain) {
              const x = a.x + a.w / 2
              d = `M ${x} ${a.y + a.h} L ${x} ${b.y}`
            } else {
              const ax = a.x + (b.x > a.x ? a.w : 0), ay = a.y + a.h / 2
              const bx = b.x + (b.x > a.x ? 0 : b.w), by = b.y + b.h / 2
              const mx = (ax + bx) / 2
              d = `M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`
            }
            return (
              <g key={i}>
                <path d={d} fill="none" stroke={col} strokeWidth={isMain ? 2 : 1.5}
                  strokeDasharray={e.kind === 'leak' || e.kind === 'loop' ? '5 4' : undefined}
                  markerEnd={e.kind === 'branch' ? 'url(#ar-b)' : isMain ? 'url(#ar)' : 'url(#ar-l)'} />
                {e.label && (
                  <>
                    <rect x={a.x + a.w / 2 + 6} y={a.y + a.h + 3} width={e.label.length * 6.4 + 10} height={17} fill={PAPER} stroke={HAIR} />
                    <text x={a.x + a.w / 2 + 11} y={a.y + a.h + 15} fontSize={11} fontFamily="ui-monospace, Menlo, monospace" fill={e.label.includes('−') ? RED : GREEN}>{e.label}</text>
                  </>
                )}
              </g>
            )
          })}

          {nodes.map(n => (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} fill={fill(n.kind)} stroke={stroke(n.kind)}
                strokeWidth={n.kind === 'q' ? 1.5 : 2} strokeDasharray={n.kind === 'leak' ? '5 4' : undefined} />
              {n.id === 'paid' && <rect x={n.x} y={n.y} width={5} height={n.h} fill={GREEN} />}
              {n.id === 'result' && <rect x={n.x} y={n.y} width={5} height={n.h} fill={AMBER} />}
              <text x={n.x + 14} y={n.y + 21} fontSize={n.kind === 'q' ? 12 : 13.5} fontWeight={n.kind === 'q' ? 500 : 800} fill={INK}>{n.title}</text>
              {n.sub && <text x={n.x + 14} y={n.y + (n.kind === 'q' ? 37 : 38)} fontSize={10.5} fill={MUTE}>{n.sub.length > 52 ? n.sub.slice(0, 50) + '…' : n.sub}</text>}
              {typeof n.n === 'number' && (
                <text x={n.x + n.w - 12} y={n.y + 22} fontSize={13} fontWeight={800} textAnchor="end" fontFamily="ui-monospace, Menlo, monospace" fill={n.id === 'paid' ? GREEN : INK}>{n.n.toLocaleString()}</text>
              )}
              {n.note && <text x={n.x + n.w - 12} y={n.y + n.h - 9} fontSize={10} textAnchor="end" fill={AMBER}>{n.note}</text>}
              {n.test && (
                <>
                  <rect x={n.x + 14} y={n.y + n.h - 20} width={Math.min(n.w - 28, n.test.length * 5.6 + 12)} height={15} fill={BLUE} />
                  <text x={n.x + 20} y={n.y + n.h - 9} fontSize={9.5} fill="#FFFDFA" fontFamily="ui-monospace, Menlo, monospace">{n.test.length > 38 ? n.test.slice(0, 36) + '…' : n.test}</text>
                </>
              )}
            </g>
          ))}
        </svg>
      </XrayCanvas>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 12, fontSize: 11.5, color: MUTE }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, border: `2px solid ${INK}`, background: PAPER, verticalAlign: -2 }} /> the path</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, border: `2px solid ${AMBER}`, background: LATTE, verticalAlign: -2 }} /> a fork (branch or price)</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, border: `2px dashed ${MUTE}`, background: '#F4EFE3', verticalAlign: -2 }} /> catch and recovery</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: BLUE, verticalAlign: -2 }} /> live experiment</span>
        <span style={{ color: RED }}>−n = people lost at that step</span>
      </div>
    </div>
  )
}
