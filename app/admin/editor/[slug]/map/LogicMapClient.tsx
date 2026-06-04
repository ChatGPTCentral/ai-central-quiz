'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { V2Question } from '@/lib/form-schema'

interface Props {
  slug: string
  questions: V2Question[]
  liveVersion: number | null
  draftVersion: number | null
}

const NODE_W = 320
const NODE_H = 56
const ROW_GAP = 32
const LEFT_PAD = 80
const TOP_PAD = 56
const RIGHT_LANE = LEFT_PAD + NODE_W + 60   // x of the branching lane (right of nodes)
const ACCENT = '#046BB1'
const LINEAR_COLOR = '#D5D2CD'

// Hash a question id to a stable color from a small palette for branching edges.
const EDGE_PALETTE = ['#046BB1', '#E48715', '#62A758', '#3B4C99', '#38A7AD', '#E7B02F']
function edgeColor(qId: string): string {
  let h = 0
  for (let i = 0; i < qId.length; i++) h = (h * 31 + qId.charCodeAt(i)) >>> 0
  return EDGE_PALETTE[h % EDGE_PALETTE.length]
}

export default function LogicMapClient({ slug, questions, liveVersion, draftVersion }: Props) {
  const router = useRouter()
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)

  const total = questions.length
  const height = TOP_PAD + total * (NODE_H + ROW_GAP) + 80
  const width = RIGHT_LANE + 100

  const nodes = useMemo(() => {
    const reachable = computeReachable(questions)
    return questions.map((q, i) => ({
      q,
      idx: i,
      x: LEFT_PAD,
      y: TOP_PAD + i * (NODE_H + ROW_GAP),
      reachable: reachable.has(q.id),
    }))
  }, [questions])

  const headerLabel = useMemo(() => {
    if (draftVersion && draftVersion > (liveVersion ?? 0)) return `Draft v${draftVersion}`
    if (liveVersion) return `Live v${liveVersion}`
    return 'No version'
  }, [draftVersion, liveVersion])

  // Linear edges (gray) connecting consecutive questions — except where
  // upstream has a branching rule whose first matching path bypasses next.
  // We always draw the linear path; branching rules are layered on top.
  const linearPaths: { from: number; to: number }[] = []
  for (let i = 0; i < total - 1; i++) {
    linearPaths.push({ from: i, to: i + 1 })
  }

  // Branching edges
  const branchEdges: { from: number; to: number | 'end'; ruleIdx: number; sourceId: string }[] = []
  for (let i = 0; i < total; i++) {
    const q = questions[i]
    if (!q.branching) continue
    for (let r = 0; r < q.branching.length; r++) {
      const rule = q.branching[r]
      const targetIdx = rule.goto === 'end' ? 'end' : questions.findIndex(x => x.id === rule.goto)
      if (targetIdx !== 'end' && (targetIdx === -1 || targetIdx <= i)) continue
      branchEdges.push({ from: i, to: targetIdx, ruleIdx: r, sourceId: q.id })
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#FFFDFA]">
      <header className="px-6 py-3 border-b border-[#E8E4DF] bg-white flex items-center gap-4">
        <Link href={`/admin/editor/${slug}`} className="text-xs text-[#9C9C9C] hover:text-[#333333]">← Back to editor</Link>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">{slug} · Logic map</span>
        <span className="text-xs text-[#333333] font-semibold ml-auto">{headerLabel}</span>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <svg width={width} height={height} className="bg-white rounded-xl shadow-sm border border-[#E8E4DF]">
          {/* Linear edges */}
          {linearPaths.map(p => {
            const fromN = nodes[p.from]
            const toN = nodes[p.to]
            const x1 = fromN.x + NODE_W / 2
            const y1 = fromN.y + NODE_H
            const y2 = toN.y
            return (
              <line
                key={`linear-${p.from}-${p.to}`}
                x1={x1} y1={y1} x2={x1} y2={y2}
                stroke={LINEAR_COLOR}
                strokeWidth={2}
                strokeDasharray="0"
              />
            )
          })}

          {/* Branching edges */}
          {branchEdges.map((e, idx) => {
            const fromN = nodes[e.from]
            const color = edgeColor(e.sourceId)
            // Source: right side of source node
            const x1 = fromN.x + NODE_W
            const y1 = fromN.y + NODE_H / 2
            // Target: top of target node, or end marker
            let x2: number
            let y2: number
            if (e.to === 'end') {
              x2 = LEFT_PAD + NODE_W + 16
              y2 = TOP_PAD + total * (NODE_H + ROW_GAP) + 24
            } else {
              const toN = nodes[e.to]
              x2 = toN.x + NODE_W
              y2 = toN.y + NODE_H / 2
            }
            // Bezier curve out to the RIGHT_LANE then back in
            const lane = RIGHT_LANE + (idx % 3) * 14
            const path = `M ${x1} ${y1} C ${lane} ${y1}, ${lane} ${y2}, ${x2} ${y2}`
            const key = `branch-${e.from}-${e.to}-${e.ruleIdx}`
            const rule = questions[e.from].branching![e.ruleIdx]
            return (
              <g key={key}>
                <path
                  d={path}
                  stroke={color}
                  strokeWidth={hoveredEdge === key ? 3 : 2}
                  fill="none"
                  markerEnd="url(#arrow)"
                  onMouseEnter={() => setHoveredEdge(key)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  className="cursor-pointer transition-all"
                />
                {hoveredEdge === key && (
                  <text x={lane + 8} y={(y1 + y2) / 2} fill={color} fontSize={11} fontWeight={600}>
                    {summarizeRule(rule, questions)}
                  </text>
                )}
              </g>
            )
          })}

          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>

          {/* Question nodes */}
          {nodes.map(n => {
            const stepNum = n.idx + 1
            return (
              <g
                key={n.q.id}
                transform={`translate(${n.x}, ${n.y})`}
                onClick={() => router.push(`/admin/editor/${slug}?q=${n.q.id}`)}
                className="cursor-pointer"
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill={n.reachable ? 'white' : '#FEF2F2'}
                  stroke={n.reachable ? '#E8E4DF' : '#FCA5A5'}
                  strokeWidth={1.5}
                  className="hover:stroke-[#046BB1] transition-colors"
                />
                <text x={14} y={22} fontSize={11} fontWeight={700} fill={ACCENT}>{stepNum}</text>
                <text x={32} y={22} fontSize={11} fill="#9C9C9C" fontFamily="ui-monospace, monospace">{n.q.id}</text>
                <text x={14} y={42} fontSize={12} fontWeight={500} fill="#333333">
                  {n.q.label.length > 44 ? n.q.label.slice(0, 44) + '…' : n.q.label}
                </text>
                {n.q.branching && n.q.branching.length > 0 && (
                  <circle cx={NODE_W - 16} cy={16} r={6} fill={edgeColor(n.q.id)} />
                )}
                {!n.reachable && (
                  <text x={NODE_W - 50} y={42} fontSize={10} fontWeight={700} fill="#DC2626">UNREACHABLE</text>
                )}
              </g>
            )
          })}

          {/* End marker */}
          <g transform={`translate(${LEFT_PAD}, ${TOP_PAD + total * (NODE_H + ROW_GAP)})`}>
            <rect width={NODE_W} height={36} rx={10} fill="#333333" />
            <text x={NODE_W / 2} y={22} fontSize={11} fontWeight={700} fill="white" textAnchor="middle">END · submit</text>
          </g>
        </svg>

        <div className="mt-6 max-w-xl text-xs text-[#9C9C9C] space-y-2">
          <p><span className="inline-block w-3 h-0.5 bg-[#D5D2CD] align-middle mr-2" /> Linear flow — fall through when no rule matches</p>
          <p><span className="inline-block w-3 h-0.5 bg-[#046BB1] align-middle mr-2" /> Branching jump — hover for the rule</p>
          <p><span className="inline-block w-3 h-3 rounded-full bg-[#FEF2F2] border border-[#FCA5A5] align-middle mr-2" /> Red node = unreachable</p>
        </div>
      </div>
    </div>
  )
}

function summarizeRule(rule: { when: { questionId: string; op: string; value: string | string[] }[]; goto: string }, qs: V2Question[]): string {
  const c = rule.when[0]
  if (!c) return ''
  const refQ = qs.find(x => x.id === c.questionId)
  const refLabel = refQ?.label.slice(0, 18) || c.questionId
  const opTxt = c.op === 'eq' ? '=' : c.op === 'neq' ? '≠' : c.op
  const valTxt = Array.isArray(c.value) ? c.value.join(',') : c.value
  const more = rule.when.length > 1 ? ` (+${rule.when.length - 1})` : ''
  return `${refLabel} ${opTxt} ${valTxt}${more} → ${rule.goto === 'end' ? 'END' : (qs.find(x => x.id === rule.goto)?.label.slice(0, 14) || rule.goto)}`
}

// Compute reachable question ids by walking forward from index 0,
// following branching rules in a worst-case fan-out.
function computeReachable(questions: V2Question[]): Set<string> {
  const reachable = new Set<string>()
  const visit = (idx: number) => {
    if (idx < 0 || idx >= questions.length) return
    const q = questions[idx]
    if (reachable.has(q.id)) return
    reachable.add(q.id)
    // Default: linear next
    visit(idx + 1)
    // Plus any branching targets
    if (q.branching) {
      for (const r of q.branching) {
        if (r.goto === 'end') continue
        const t = questions.findIndex(x => x.id === r.goto)
        if (t > idx) visit(t)
      }
    }
  }
  visit(0)
  return reachable
}
