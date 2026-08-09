'use client'

// Twelve months of cash, drawn properly.
//
// The first version was a row of unlabelled bars with a tooltip on the title
// attribute. That is fine for a sparkline and useless for money: there was no
// way to tell whether a bar was $200 or $2,000, and the owner said so.
//
// So this has the things a money chart needs and a sparkline does not:
//   - a real Y axis in dollars, with gridlines you can read a value off
//   - a real X axis in months
//   - the cumulative line, because "when do we cross X" is the actual question
//   - hover that reports the exact split, not a rounded total
//
// Stacked rather than grouped on purpose. The question is "how much arrives in
// month N", and a stack answers that at a glance while still showing where it
// came from. Grouped bars would make the reader add two numbers themselves.

import { useMemo, useState } from 'react'

const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'
const FULVOUS = '#E48715'
const GREEN = '#2E7D32'
const BLUE = '#046BB1'
const HAIR = '#E8E2D4'

export interface CashflowPoint {
  /** 0-indexed month from today. */
  m: number
  trial: number
  annual: number
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`
const usd2 = (n: number) => `$${n.toFixed(2)}`

/** Round a max up to something a human would put on an axis. */
function niceMax(v: number): number {
  if (v <= 0) return 100
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const scaled = v / mag
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10
  return step * mag
}

export default function CashflowChart({ points }: { points: CashflowPoint[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const rows = useMemo(() => {
    let cum = 0
    return points.map(p => {
      const total = p.trial + p.annual
      cum += total
      return { ...p, total, cum }
    })
  }, [points])

  // Geometry. viewBox units, so it scales to any container width.
  const W = 760
  const H = 300
  const padL = 62      // room for "$1,234"
  const padR = 56      // room for the cumulative axis
  const padT = 14
  const padB = 30

  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const maxBar = niceMax(Math.max(...rows.map(r => r.total), 1))
  const maxCum = niceMax(Math.max(...rows.map(r => r.cum), 1))

  const bw = (plotW / rows.length) * 0.62
  const xOf = (i: number) => padL + (plotW / rows.length) * (i + 0.5)
  const yBar = (v: number) => padT + plotH - (v / maxBar) * plotH
  const yCum = (v: number) => padT + plotH - (v / maxCum) * plotH

  const gridlines = [0, 0.25, 0.5, 0.75, 1]
  const cumPath = rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yCum(r.cum)}`).join(' ')

  const active = hover !== null ? rows[hover] : null
  const yearTotal = rows[rows.length - 1]?.cum ?? 0

  return (
    <div>
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: INK }}>
          12-month cashflow
        </span>
        <span style={{ fontSize: 12, color: '#4A4A4A' }}>
          year one total <strong style={{ color: GREEN, fontSize: 14 }}>{usd0(yearTotal)}</strong>
        </span>
      </div>

      <div style={{ position: 'relative', width: '100%' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block', background: '#FFFFFF', border: `1px solid ${HAIR}` }}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Monthly cash from trials and annual renewals, with the cumulative total"
        >
          {/* Y gridlines + money labels, left axis = money arriving that month */}
          {gridlines.map(g => {
            const v = maxBar * g
            const y = yBar(v)
            return (
              <g key={`g${g}`}>
                <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={g === 0 ? INK : HAIR} strokeWidth={g === 0 ? 1.5 : 1} />
                <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize="10.5" fill={MUTE}>{usd0(v)}</text>
              </g>
            )
          })}

          {/* Right axis = cumulative, so the line has its own readable scale
              instead of being squashed against the monthly bars. */}
          {gridlines.map(g => {
            const v = maxCum * g
            return (
              <text key={`c${g}`} x={W - padR + 8} y={yCum(v) + 3.5} fontSize="10.5" fill={BLUE}>{usd0(v)}</text>
            )
          })}

          {/* Hover column highlight, drawn under the bars. */}
          {hover !== null && (
            <rect
              x={xOf(hover) - (plotW / rows.length) / 2}
              y={padT}
              width={plotW / rows.length}
              height={plotH}
              fill="#FEF7E7"
            />
          )}

          {/* Stacked bars: trial at the base, annual renewals on top. */}
          {rows.map((r, i) => {
            const x = xOf(i) - bw / 2
            const hTrial = (r.trial / maxBar) * plotH
            const hAnnual = (r.annual / maxBar) * plotH
            return (
              <g key={r.m} onMouseEnter={() => setHover(i)}>
                {/* Full-height hit area so the hover does not require pixel
                    accuracy on a short bar. */}
                <rect x={xOf(i) - (plotW / rows.length) / 2} y={padT} width={plotW / rows.length} height={plotH} fill="transparent" />
                <rect x={x} y={padT + plotH - hTrial} width={bw} height={hTrial} fill={FULVOUS} />
                <rect x={x} y={padT + plotH - hTrial - hAnnual} width={bw} height={hAnnual} fill={GREEN} />
              </g>
            )
          })}

          {/* Cumulative line, on the right-hand scale. */}
          <path d={cumPath} fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinejoin="round" />
          {rows.map((r, i) => (
            <circle key={`p${r.m}`} cx={xOf(i)} cy={yCum(r.cum)} r={hover === i ? 4.5 : 2.5} fill={BLUE} />
          ))}

          {/* X axis: months */}
          {rows.map((r, i) => (
            <text key={`x${r.m}`} x={xOf(i)} y={H - 10} textAnchor="middle" fontSize="10.5" fill={hover === i ? RICH : MUTE} fontWeight={hover === i ? 700 : 400}>
              {r.m + 1}
            </text>
          ))}
        </svg>

        {/* Readout. Sits below rather than floating, so it never covers the
            bars and never runs off the edge on a narrow screen. */}
        <div
          className="flex items-baseline flex-wrap"
          style={{ gap: 16, padding: '10px 12px', border: `1px solid ${HAIR}`, borderTop: 'none', background: active ? '#FEF7E7' : '#FBFAF7', minHeight: 42 }}
        >
          {active ? (
            <>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: INK }}>
                Month {active.m + 1}
              </span>
              <span style={{ fontSize: 12.5, color: '#4A4A4A' }}>
                trials <strong style={{ color: FULVOUS }}>{usd2(active.trial)}</strong>
              </span>
              <span style={{ fontSize: 12.5, color: '#4A4A4A' }}>
                renewals <strong style={{ color: GREEN }}>{usd2(active.annual)}</strong>
              </span>
              <span style={{ fontSize: 12.5, color: '#4A4A4A' }}>
                that month <strong style={{ color: RICH }}>{usd2(active.total)}</strong>
              </span>
              <span style={{ fontSize: 12.5, color: '#4A4A4A', marginLeft: 'auto' }}>
                cumulative <strong style={{ color: BLUE }}>{usd0(active.cum)}</strong>
              </span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: MUTE }}>Hover a month for the exact split.</span>
          )}
        </div>
      </div>

      <div className="flex items-center flex-wrap" style={{ gap: 16, marginTop: 9, fontSize: 11, color: '#6B6B6B' }}>
        <span className="inline-flex items-center" style={{ gap: 6 }}><span style={{ width: 10, height: 10, background: FULVOUS }} /> trials, left axis</span>
        <span className="inline-flex items-center" style={{ gap: 6 }}><span style={{ width: 10, height: 10, background: GREEN }} /> annual renewals, left axis</span>
        <span className="inline-flex items-center" style={{ gap: 6 }}><span style={{ width: 14, height: 3, background: BLUE }} /> cumulative, right axis</span>
      </div>
    </div>
  )
}
