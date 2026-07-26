import { STAGES } from '@/lib/segmentation-v2'

// Tachometer/speedometer gauge for the hero: the six stages as arc
// segments sized PROPORTIONALLY to their real population share (the
// aheadPct boundaries from lib/readiness-type.ts), needle at the person's
// percentile. Weeks rule: the next rung is always ≈1 wk away, the k-th
// next rung min(k, 5) wks. Pure SVG, server-renderable.

const BOUNDARIES: { key: string; from: number; to: number }[] = [
  { key: 'S0_unaware', from: 0, to: 40 },
  { key: 'S1_curious', from: 40, to: 62 },
  { key: 'S2_experimenter', from: 62, to: 76 },
  { key: 'S3_practitioner', from: 76, to: 86 },
  { key: 'S4_power_user', from: 86, to: 93 },
  { key: 'S5_builder', from: 93, to: 100 },
]

const CX = 210
const CY = 190
const R = 150
const STROKE = 30

/** Percentile (0-100) → point on the semicircle (180° sweep, left→right). */
function pt(pct: number, r: number): { x: number; y: number } {
  const theta = Math.PI - (pct / 100) * Math.PI
  return { x: CX + r * Math.cos(theta), y: CY - r * Math.sin(theta) }
}

function arcPath(fromPct: number, toPct: number, r: number): string {
  const a = pt(fromPct, r)
  const b = pt(toPct, r)
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

export function StageGauge({ stageKey, aheadPct }: { stageKey?: string | null; aheadPct: number }) {
  const rungs = STAGES.filter(s => s.key !== 'unknown')
  const currentIdx = Math.max(0, rungs.findIndex(s => s.key === stageKey))
  const needle = Math.min(99, Math.max(1, aheadPct))
  const needleTip = pt(needle, R - STROKE / 2 - 8)
  const needleTag = pt(needle, R + 30)

  return (
    <div className="mx-auto" style={{ maxWidth: 560 }}>
      <svg viewBox="0 0 420 258" role="img" aria-label={`You are ahead of ${aheadPct}% of people`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        {/* Track */}
        <path d={arcPath(0, 100, R)} fill="none" stroke="#EDE8DF" strokeWidth={STROKE} strokeLinecap="butt" />

        {/* Proportional stage segments. The band the person landed in is the
            hero of this chart: it gets a wider arc, full colour, a dark outline
            and soft glow, while everything ahead of them stays faded — so "you
            are HERE, and there is road above you" reads in one glance. */}
        <defs>
          <filter id="rungGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={rungs[currentIdx]?.color || '#E48715'} floodOpacity="0.55" />
          </filter>
        </defs>
        {BOUNDARIES.map((b, i) => {
          const def = rungs[i]
          const passed = i < currentIdx
          const isCurrent = i === currentIdx
          const from = b.from + 0.35
          const to = b.to - 0.35
          if (isCurrent) {
            return (
              <g key={b.key} filter="url(#rungGlow)">
                {/* dark casing so the live band reads as a raised, selected slice */}
                <path d={arcPath(from, to, R)} fill="none" stroke="#1A1A1A" strokeWidth={STROKE + 14} strokeLinecap="butt" />
                <path d={arcPath(from, to, R)} fill="none" stroke={def.color} strokeWidth={STROKE + 8} strokeLinecap="butt" />
              </g>
            )
          }
          return (
            <path
              key={b.key}
              d={arcPath(from, to, R)}
              fill="none"
              stroke={def.color}
              strokeOpacity={passed ? 0.92 : 0.22}
              strokeWidth={STROKE}
              strokeLinecap="butt"
            />
          )
        })}

        {/* Segment labels (+ weeks for future rungs) */}
        {BOUNDARIES.map((b, i) => {
          const def = rungs[i]
          const mid = (b.from + b.to) / 2
          const lp = pt(mid, R + 34)
          const stepsAhead = i - currentIdx
          const weeks = stepsAhead > 0 ? Math.min(stepsAhead, 5) : 0
          const anchor = mid < 38 ? 'end' : mid > 62 ? 'start' : 'middle'
          return (
            <g key={`l-${b.key}`}>
              <text
                x={lp.x} y={lp.y}
                textAnchor={anchor}
                style={{
                  fontSize: stepsAhead === 0 ? 13.5 : 12,
                  fontWeight: stepsAhead === 0 ? 800 : 700,
                  fill: stepsAhead > 0 ? '#9C9C9C' : '#1A1A1A',
                  letterSpacing: 0.3,
                }}
              >
                {def.label}
              </text>
              {stepsAhead > 0 && (
                <text
                  x={lp.x} y={lp.y + 13}
                  textAnchor={anchor}
                  style={{ fontSize: 10.5, fontWeight: 600, fill: '#C4BDB2' }}
                >
                  ≈{weeks} wk{weeks === 1 ? '' : 's'}
                </text>
              )}
            </g>
          )
        })}

        {/* Needle */}
        <line x1={CX} y1={CY} x2={needleTip.x} y2={needleTip.y} stroke="#1A1A1A" strokeWidth={5} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={11} fill="#1A1A1A" />
        <circle cx={CX} cy={CY} r={4.5} fill="#FEF7E7" />

        {/* YOU tag near the needle tip */}
        <g transform={`translate(${needleTag.x}, ${needleTag.y})`}>
          <rect x={-24} y={-13} width={48} height={21} rx={10.5} fill="#1A1A1A" />
          <text x={0} y={2} textAnchor="middle" style={{ fontSize: 11, fontWeight: 800, fill: '#FEF7E7', letterSpacing: 1 }}>YOU</text>
        </g>

        {/* Scale endpoints */}
        <text x={CX - R} y={CY + 24} textAnchor="middle" style={{ fontSize: 10, fill: '#C4BDB2', fontWeight: 600 }}>0%</text>
        <text x={CX + R} y={CY + 24} textAnchor="middle" style={{ fontSize: 10, fill: '#C4BDB2', fontWeight: 600 }}>100%</text>
      </svg>
    </div>
  )
}
