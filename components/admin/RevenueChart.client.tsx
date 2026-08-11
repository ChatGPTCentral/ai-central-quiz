'use client'

// Trials since inception, coloured by era, with cumulative earnings over them.
//
// Two questions in one picture: how many people started a trial each month
// (the bars, coloured by which pricing era they landed in), and what the
// account has earned in total by that point (the line). The line is cumulative
// so it only ever rises; a flattening line means the trials of that period are
// not converting, which is the thing worth noticing.
//
// Earnings here are what the TRIALS produced — the trial payment plus whatever
// annual or lifetime followed — credited to the month the trial started, so a
// month's bar and its share of the line describe the same cohort.

import { useState } from 'react'
import { fmtMonth, fmtMonthShort } from '@/lib/dates'

export interface ChartPoint {
  month: string          // YYYY-MM
  trials: number
  gross: number          // dollars produced by that month's cohort
  era: number
}
export interface ChartEra { era: number; code: string; name: string; color: string }

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'

export default function RevenueChart({ points, eras }: { points: ChartPoint[]; eras: ChartEra[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (points.length === 0) return null

  const colorOf = (era: number) => eras.find(e => e.era === era)?.color ?? '#9AA7B0'
  const codeOf = (era: number) => eras.find(e => e.era === era)?.code ?? String(era)

  // Cumulative earnings, running left to right.
  let run = 0
  const cum = points.map(p => (run += p.gross))
  const maxTrials = Math.max(...points.map(p => p.trials), 1)
  const maxCum = Math.max(...cum, 1)

  const W = 1000, H = 300, PADL = 52, PADR = 62, PADB = 42, PADT = 14
  const plotW = W - PADL - PADR, plotH = H - PADT - PADB
  const bw = plotW / points.length
  const x = (i: number) => PADL + i * bw
  const yBar = (v: number) => PADT + plotH - (v / maxTrials) * plotH
  const yCum = (v: number) => PADT + plotH - (v / maxCum) * plotH

  // The cumulative line, as an area so it reads as accumulated money.
  const linePts = cum.map((v, i) => `${x(i) + bw / 2},${yCum(v)}`).join(' ')
  const areaPts = `${PADL + bw / 2},${PADT + plotH} ${linePts} ${x(points.length - 1) + bw / 2},${PADT + plotH}`

  const usd = (n: number) => `$${Math.round(n).toLocaleString()}`
  const h = hover !== null ? points[hover] : null

  return (
    <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '14px 16px' }}>
      <div className="flex items-baseline flex-wrap" style={{ gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Trials a month, and everything they have earned</span>
        <span style={{ fontSize: 11, color: MUTE }}>bars = trials started · line = cumulative earnings from those trials</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
           aria-label="Trials per month by era with cumulative earnings">
        {/* horizontal guides */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={PADL} x2={W - PADR} y1={PADT + plotH * (1 - f)} y2={PADT + plotH * (1 - f)}
                  stroke="#EFEAE0" strokeWidth={1} />
            <text x={PADL - 8} y={PADT + plotH * (1 - f) + 3.5} textAnchor="end"
                  fontSize={9.5} fill={MUTE}>{Math.round(maxTrials * f)}</text>
            <text x={W - PADR + 8} y={PADT + plotH * (1 - f) + 3.5} textAnchor="start"
                  fontSize={9.5} fill="#2E7D32">{usd(maxCum * f)}</text>
          </g>
        ))}

        {/* bars, one per month, coloured by era */}
        {points.map((p, i) => (
          <rect key={p.month}
                x={x(i) + 1} y={yBar(p.trials)} width={Math.max(1, bw - 2)} height={PADT + plotH - yBar(p.trials)}
                fill={colorOf(p.era)} opacity={hover === null || hover === i ? 0.95 : 0.45}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <title>{`${fmtMonth(p.month)} · ${p.trials} trials · ${usd(p.gross)} earned`}</title>
          </rect>
        ))}

        {/* cumulative earnings */}
        <polygon points={areaPts} fill="#2E7D32" opacity={0.08} />
        <polyline points={linePts} fill="none" stroke="#2E7D32" strokeWidth={2.5} />
        {h && (
          <circle cx={x(hover!) + bw / 2} cy={yCum(cum[hover!])} r={4} fill="#2E7D32" stroke="#FFFDFA" strokeWidth={2} />
        )}

        {/* month labels, thinned so they never collide */}
        {points.map((p, i) => (
          i % Math.ceil(points.length / 14) === 0 ? (
            <text key={p.month} x={x(i) + bw / 2} y={H - PADB + 15} textAnchor="middle" fontSize={9} fill={MUTE}>
              {fmtMonthShort(p.month)}
            </text>
          ) : null
        ))}
      </svg>

      {/* readout under the plot, so hovering never covers the data */}
      <div style={{ fontSize: 11.5, color: h ? INK : MUTE, marginTop: 6, minHeight: 18 }}>
        {h ? (
          <>
            <strong>{fmtMonth(h.month)}</strong> · era {codeOf(h.era)} · <strong>{h.trials}</strong> trials ·
            {' '}{usd(h.gross)} earned by that cohort · {usd(cum[hover!])} cumulative
          </>
        ) : 'hover a month for its numbers'}
      </div>

      <div className="flex flex-wrap" style={{ gap: 12, marginTop: 10 }}>
        {eras.map(e => (
          <span key={e.era} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: MUTE }}>
            <span style={{ width: 11, height: 11, background: e.color, display: 'inline-block' }} />
            <strong style={{ color: INK }}>{e.code}</strong> {e.name}
          </span>
        ))}
      </div>
    </div>
  )
}
