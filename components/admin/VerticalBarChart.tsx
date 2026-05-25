'use client'

import { useState, useMemo } from 'react'
import { PALETTE } from '@/lib/palette'

export interface BarDatum {
  label: string
  value: number
}

interface Props {
  title: string
  subtitle?: string
  data: BarDatum[]
  /** Categories in fixed left→right order. Missing labels render as 0. */
  orderedLabels: string[]
  uniformColor?: string
  /** Default toggle mode. */
  defaultMode?: 'count' | 'percent'
  /** Curve color. */
  curveColor?: string
}

/**
 * Vertical bar chart with a smooth density curve overlaid on the bar tops.
 *
 * X-axis: ordered categories (Age brackets, Company-size buckets, …).
 * Y-axis: count or % of total. Density line connects each bar's top center
 * with a Catmull-Rom-ish spline.
 */
export default function VerticalBarChart({
  title, subtitle, data, orderedLabels, uniformColor, defaultMode = 'count', curveColor,
}: Props) {
  const [mode, setMode] = useState<'count' | 'percent'>(defaultMode)

  const { rows, total, max } = useMemo(() => {
    const lookup = new Map(data.map(d => [d.label, d.value]))
    const rows = orderedLabels.map(l => ({ label: l, value: lookup.get(l) || 0 }))
    const total = rows.reduce((a, b) => a + b.value, 0)
    const max = Math.max(...rows.map(r => r.value), 1)
    return { rows, total, max }
  }, [data, orderedLabels])

  const color = uniformColor || PALETTE.azul
  const stroke = curveColor || PALETTE.persianRed

  // SVG geometry — viewBox is normalized so we can stretch it.
  const N = rows.length
  const VB_W = 100
  const VB_H = 100
  // Bar layout inside viewBox
  const PAD_X = 4               // gutter on each side
  const usableW = VB_W - PAD_X * 2
  const slotW = usableW / N
  const barW = slotW * 0.6

  // Compute bar tops + curve points
  const points = rows.map((r, i) => {
    const cx = PAD_X + slotW * i + slotW / 2
    const h = max > 0 ? (r.value / max) * (VB_H - 2) : 0
    const top = VB_H - h
    return { label: r.label, value: r.value, cx, top, h }
  })

  // Smooth curve through (cx, top)
  const path = points.map((p, i) => {
    if (i === 0) return `M ${p.cx} ${p.top}`
    const prev = points[i - 1]
    const midX = (prev.cx + p.cx) / 2
    return `C ${midX} ${prev.top}, ${midX} ${p.top}, ${p.cx} ${p.top}`
  }).join(' ')

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-black text-[#333333] tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-[#9C9C9C] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex bg-[#F5F5F5] rounded-md p-0.5 shrink-0">
          {(['count', 'percent'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${
                mode === m ? 'bg-white text-[#333333] shadow-sm' : 'text-[#9C9C9C] hover:text-[#333333]'
              }`}
            >
              {m === 'count' ? '#' : '%'}
            </button>
          ))}
        </div>
      </header>

      <div className="px-5 pb-5">
        {/* Chart area */}
        <div className="relative w-full" style={{ aspectRatio: '2 / 1' }}>
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
          >
            {/* Bars */}
            {points.map((p) => (
              <rect
                key={p.label}
                x={p.cx - barW / 2}
                y={p.top}
                width={barW}
                height={p.h}
                fill={color}
                rx={0.5}
              />
            ))}
            {/* Density curve */}
            {N > 1 && (
              <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" vectorEffect="non-scaling-stroke" />
            )}
            {/* Curve dots */}
            {points.map(p => (
              <circle key={`d-${p.label}`} cx={p.cx} cy={p.top} r="0.9" fill={stroke} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>

          {/* Value labels above each bar */}
          <div className="absolute inset-0 flex items-end pointer-events-none">
            {points.map((p) => {
              const pct = total > 0 ? (p.value / total) * 100 : 0
              return (
                <div
                  key={`v-${p.label}`}
                  className="flex-1 flex flex-col items-center"
                  style={{ height: `${(p.h / VB_H) * 100}%` }}
                >
                  <span className="text-[10px] font-semibold text-[#333333] -mt-4 tabular-nums">
                    {p.value === 0 ? '' : (mode === 'count' ? p.value.toLocaleString() : `${pct.toFixed(0)}%`)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* X-axis category labels */}
        <div className="flex mt-1.5 pt-1.5 border-t border-[#F5F5F5]">
          {points.map(p => (
            <div key={`l-${p.label}`} className="flex-1 text-center text-[10px] font-medium text-[#9C9C9C] truncate px-0.5" title={p.label}>
              {p.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
