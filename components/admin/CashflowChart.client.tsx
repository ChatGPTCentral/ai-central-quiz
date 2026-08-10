'use client'

// Monthly cash: what happened, then what we expect.
//
// The first version was a row of unlabelled bars with a title-attribute
// tooltip. Fine for a sparkline, useless for money: there was no way to read a
// value off it. This has what a money chart needs — a dollar axis, a month
// axis, the cumulative line on its own scale, and hover that reports the exact
// split.
//
// The line between actual and forecast is drawn honestly, because the whole
// value of the chart is knowing which half is real:
//   actual    settled months, solid
//   partial   recent months still filling in. A trial bills its annual a month
//             later, so the last two months ALWAYS look weak. Faded, not
//             hidden, because hiding them would make the series end abruptly
//             and invite the reader to think we stopped selling.
//   forecast  outlined and dotted, never solid. It has not happened.

import { useMemo, useState } from 'react'

const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'
const FULVOUS = '#E48715'
const GREEN = '#2E7D32'
const BLUE = '#046BB1'
const HAIR = '#E8E2D4'

export interface CashPoint {
  month: string
  trials: number
  revenue: number
  /** Forecast only: the same month priced at the MEASURED rate, so the chart
   *  can draw belief and history as two diverging lines. */
  revenueAlt?: number
  kind: 'actual' | 'partial' | 'forecast'
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`

/** Round a max up to something a human would put on an axis. */
function niceMax(v: number): number {
  if (v <= 0) return 100
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const s = v / mag
  const step = s <= 1 ? 1 : s <= 2 ? 2 : s <= 2.5 ? 2.5 : s <= 5 ? 5 : 10
  return step * mag
}

function label(month: string): string {
  const [y, m] = month.split('-')
  return `${['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][Number(m) - 1]}${y.slice(2)}`
}

export default function CashflowChart({ points, assumedPct, measuredPct }: {
  points: CashPoint[]
  /** Year-1 rate the primary forecast uses (the owner's model). */
  assumedPct?: number
  /** Year-1 rate the alt line uses (the sheet's mature months). */
  measuredPct?: number | null
}) {
  const [hover, setHover] = useState<number | null>(null)

  const rows = useMemo(() => {
    let cum = 0
    let cumAlt = 0
    return points.map(p => {
      cum += p.revenue
      // The alt series shares history with the primary one and only diverges
      // where an alternative revenue exists, i.e. in the forecast.
      cumAlt += p.revenueAlt ?? p.revenue
      return { ...p, cum, cumAlt }
    })
  }, [points])

  const W = 900
  const H = 320
  const padL = 66
  const padR = 60
  const padT = 14
  const padB = 34
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const maxBar = niceMax(Math.max(...rows.map(r => r.revenue), 1))
  const maxCum = niceMax(Math.max(...rows.map(r => Math.max(r.cum, r.cumAlt)), 1))
  const bw = Math.max(4, (plotW / rows.length) * 0.62)
  const xOf = (i: number) => padL + (plotW / rows.length) * (i + 0.5)
  const yBar = (v: number) => padT + plotH - (v / maxBar) * plotH
  const yCum = (v: number) => padT + plotH - (v / maxCum) * plotH

  const grid = [0, 0.25, 0.5, 0.75, 1]
  const firstForecast = rows.findIndex(r => r.kind === 'forecast')
  const hasAlt = rows.some(r => r.revenueAlt !== undefined && Math.abs((r.revenueAlt ?? 0) - r.revenue) > 0.5)

  // Two separate cumulative paths so the forecast half can be dashed. They
  // overlap by one point, otherwise the line breaks at the boundary.
  const realRows = firstForecast === -1 ? rows : rows.slice(0, firstForecast)
  const fcRows = firstForecast === -1 ? [] : rows.slice(Math.max(0, firstForecast - 1))
  const pathOf = (rs: typeof rows, offset: number) =>
    rs.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i + offset)} ${yCum(r.cum)}`).join(' ')

  const active = hover !== null ? rows[hover] : null
  const totalReal = realRows.length ? realRows[realRows.length - 1].cum : 0
  const totalAll = rows.length ? rows[rows.length - 1].cum : 0

  return (
    <div>
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: INK }}>
          Cashflow · actuals and forecast
        </span>
        <span style={{ fontSize: 12, color: '#4A4A4A' }}>
          banked <strong style={{ color: GREEN, fontSize: 14 }}>{usd0(totalReal)}</strong>
          <span style={{ color: MUTE }}> · projected to </span>
          <strong style={{ color: BLUE, fontSize: 14 }}>{usd0(totalAll)}</strong>
        </span>
      </div>

      <div style={{ position: 'relative', width: '100%' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block', background: '#FFFFFF', border: `1px solid ${HAIR}` }}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Monthly revenue, actual then forecast, with the cumulative total"
        >
          <defs>
            {/* Hatch marks forecast bars as not-yet-real at a glance, without
                relying on colour alone. */}
            <pattern id="fc" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#FFFFFF" />
              <line x1="0" y1="0" x2="0" y2="6" stroke={BLUE} strokeWidth="2.5" opacity="0.45" />
            </pattern>
          </defs>

          {grid.map(g => {
            const y = yBar(maxBar * g)
            return (
              <g key={`g${g}`}>
                <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={g === 0 ? INK : HAIR} strokeWidth={g === 0 ? 1.5 : 1} />
                <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize="10.5" fill={MUTE}>{usd0(maxBar * g)}</text>
              </g>
            )
          })}
          {grid.map(g => (
            <text key={`c${g}`} x={W - padR + 8} y={yCum(maxCum * g) + 3.5} fontSize="10.5" fill={BLUE}>{usd0(maxCum * g)}</text>
          ))}

          {/* The boundary between what happened and what we expect. */}
          {firstForecast > 0 && (
            <g>
              <line
                x1={xOf(firstForecast) - (plotW / rows.length) / 2}
                x2={xOf(firstForecast) - (plotW / rows.length) / 2}
                y1={padT} y2={padT + plotH}
                stroke={RICH} strokeWidth="1.5" strokeDasharray="4 4"
              />
              <text x={xOf(firstForecast) - (plotW / rows.length) / 2 + 5} y={padT + 11} fontSize="9.5" fontWeight="700" fill={RICH}>
                forecast →
              </text>
            </g>
          )}

          {hover !== null && (
            <rect x={xOf(hover) - (plotW / rows.length) / 2} y={padT} width={plotW / rows.length} height={plotH} fill="#FEF7E7" />
          )}

          {rows.map((r, i) => {
            const h = (r.revenue / maxBar) * plotH
            const fill = r.kind === 'forecast' ? 'url(#fc)' : r.kind === 'partial' ? '#F3C99A' : FULVOUS
            return (
              <g key={r.month} onMouseEnter={() => setHover(i)}>
                <rect x={xOf(i) - (plotW / rows.length) / 2} y={padT} width={plotW / rows.length} height={plotH} fill="transparent" />
                <rect
                  x={xOf(i) - bw / 2} y={padT + plotH - h} width={bw} height={h}
                  fill={fill}
                  stroke={r.kind === 'forecast' ? BLUE : 'none'}
                  strokeWidth={r.kind === 'forecast' ? 1 : 0}
                  strokeDasharray={r.kind === 'forecast' ? '3 2' : undefined}
                />
              </g>
            )
          })}

          <path d={pathOf(realRows, 0)} fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinejoin="round" />
          {fcRows.length > 1 && (
            <path
              d={pathOf(fcRows, Math.max(0, firstForecast - 1))}
              fill="none" stroke={BLUE} strokeWidth="2.5" strokeDasharray="6 4" strokeLinejoin="round" opacity="0.8"
            />
          )}
          {/* The measured-rate line. Only drawn where it actually differs, so
              when assumption == history the chart stays one clean line. */}
          {fcRows.length > 1 && hasAlt && (
            <path
              d={fcRows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i + Math.max(0, firstForecast - 1))} ${yCum(r.cumAlt)}`).join(' ')}
              fill="none" stroke={GREEN} strokeWidth="2" strokeDasharray="2 4" strokeLinejoin="round" opacity="0.9"
            />
          )}
          {rows.map((r, i) => (
            <circle key={`p${r.month}`} cx={xOf(i)} cy={yCum(r.cum)} r={hover === i ? 4.5 : 2}
              fill={r.kind === 'forecast' ? '#FFFFFF' : BLUE} stroke={BLUE} strokeWidth={r.kind === 'forecast' ? 1.5 : 0} />
          ))}

          {rows.map((r, i) => (
            // Every other label when crowded, so months stay readable.
            (rows.length <= 18 || i % 2 === 0) && (
              <text key={`x${r.month}`} x={xOf(i)} y={H - 12} textAnchor="middle" fontSize="9.5"
                fill={hover === i ? RICH : MUTE} fontWeight={hover === i ? 700 : 400}>
                {label(r.month)}
              </text>
            )
          ))}
        </svg>

        <div
          className="flex items-baseline flex-wrap"
          style={{ gap: 16, padding: '10px 12px', border: `1px solid ${HAIR}`, borderTop: 'none', background: active ? '#FEF7E7' : '#FBFAF7', minHeight: 42 }}
        >
          {active ? (
            <>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: INK }}>
                {active.month}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', background: active.kind === 'forecast' ? BLUE : active.kind === 'partial' ? '#B26A00' : GREEN, color: '#FFF' }}>
                {active.kind === 'forecast' ? 'FORECAST' : active.kind === 'partial' ? 'STILL FILLING IN' : 'ACTUAL'}
              </span>
              <span style={{ fontSize: 12.5, color: '#4A4A4A' }}>trials <strong style={{ color: RICH }}>{active.trials.toLocaleString()}</strong></span>
              <span style={{ fontSize: 12.5, color: '#4A4A4A' }}>revenue <strong style={{ color: FULVOUS }}>{usd0(active.revenue)}</strong></span>
              <span style={{ fontSize: 12.5, color: '#4A4A4A', marginLeft: 'auto' }}>
                cumulative <strong style={{ color: BLUE }}>{usd0(active.cum)}</strong>
                {active.kind === 'forecast' && hasAlt && active.cumAlt !== active.cum && (
                  <span> · at measured <strong style={{ color: GREEN }}>{usd0(active.cumAlt)}</strong></span>
                )}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: MUTE }}>Hover a month for trials, revenue and the running total.</span>
          )}
        </div>
      </div>

      <div className="flex items-center flex-wrap" style={{ gap: 16, marginTop: 9, fontSize: 11, color: '#6B6B6B' }}>
        <span className="inline-flex items-center" style={{ gap: 6 }}><span style={{ width: 10, height: 10, background: FULVOUS }} /> actual</span>
        <span className="inline-flex items-center" style={{ gap: 6 }}><span style={{ width: 10, height: 10, background: '#F3C99A' }} /> still filling in</span>
        <span className="inline-flex items-center" style={{ gap: 6 }}><span style={{ width: 10, height: 10, background: '#FFF', border: `1px dashed ${BLUE}` }} /> forecast</span>
        <span className="inline-flex items-center" style={{ gap: 6 }}>
          <span style={{ width: 16, height: 3, background: BLUE }} />
          cumulative{assumedPct !== undefined ? ` · your model ${Math.round(assumedPct * 100)}%` : ''}
        </span>
        {hasAlt && measuredPct != null && (
          <span className="inline-flex items-center" style={{ gap: 6 }}>
            <span style={{ width: 16, height: 3, background: GREEN, opacity: 0.9 }} />
            at measured {(measuredPct * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}
