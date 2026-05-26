'use client'

import { useState, useMemo } from 'react'
import { PALETTE, CHART_COLORS, colorForLabel } from '@/lib/palette'

export interface BarDatum {
  label: string
  value: number
  color?: string
}

interface Props {
  title: string
  subtitle?: string
  data: BarDatum[]
  maxRows?: number
  /** If true, group items beyond maxRows into a single 'Others' row. */
  groupRest?: boolean
  /** Color override for all bars (otherwise: per-row color hash). */
  uniformColor?: string
  /** Right-side action — e.g. a segmented control. */
  rightAction?: React.ReactNode
  /** Default toggle mode. */
  defaultMode?: 'count' | 'percent'
  /** When provided, rows render in this exact order (no sort, no Others). Missing labels render as 0. */
  orderedLabels?: string[]
  /** When true, render a smooth density curve over the bar tips. */
  densityOverlay?: boolean
  /** When true, show an "Expand" link that opens a fullscreen modal with all rows. */
  expandable?: boolean
}

export default function HorizontalBarChart({
  title, subtitle, data, maxRows = 10, groupRest = true, uniformColor, rightAction, defaultMode = 'count',
  orderedLabels, densityOverlay, expandable,
}: Props) {
  const [mode, setMode] = useState<'count' | 'percent'>(defaultMode)
  const [expanded, setExpanded] = useState(false)

  const { rows, total, max } = useMemo(() => {
    let rows: BarDatum[]
    if (orderedLabels && orderedLabels.length) {
      const lookup = new Map(data.map(d => [d.label, d.value]))
      rows = orderedLabels.map(l => ({ label: l, value: lookup.get(l) || 0 }))
    } else {
      const sorted = [...data].sort((a, b) => b.value - a.value)
      rows = sorted.slice(0, maxRows)
      if (groupRest && sorted.length > maxRows) {
        const rest = sorted.slice(maxRows).reduce((a, b) => a + b.value, 0)
        if (rest > 0) rows.push({ label: 'Others', value: rest, color: PALETTE.battleshipGrey })
      }
    }
    const total = rows.reduce((a, b) => a + b.value, 0)
    const max = Math.max(...rows.map(r => r.value), 1)
    return { rows, total, max }
  }, [data, maxRows, groupRest, orderedLabels])

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
      {/* Header */}
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div>
          <h3 className="text-sm font-black text-[#333333] tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-[#9C9C9C] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rightAction}
          {expandable && data.length > maxRows && (
            <button
              onClick={() => setExpanded(true)}
              className="text-[10px] font-bold uppercase tracking-wider text-[#046BB1] hover:underline"
            >
              Expand
            </button>
          )}
          {/* count/% toggle */}
          <div className="flex bg-[#F5F5F5] rounded-md p-0.5">
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
        </div>
      </header>

      {/* Bars */}
      <div className="px-5 pb-5 flex flex-col gap-2 relative">
        {rows.length === 0 ? (
          <p className="text-xs text-[#9C9C9C] py-4 text-center">No data</p>
        ) : rows.map((r) => {
          const pct = total > 0 ? (r.value / total) * 100 : 0
          const width = (r.value / max) * 100
          const color = r.color || uniformColor || colorForLabel(r.label, CHART_COLORS)
          return (
            <div key={r.label} className="flex items-center gap-3 text-[12px]">
              <div className="w-32 shrink-0 truncate text-[#333333] font-medium" title={r.label}>{r.label}</div>
              <div className="flex-1 relative h-6 bg-[#F5F5F5] rounded">
                <div
                  className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                  style={{ width: `${width}%`, backgroundColor: color }}
                />
              </div>
              <div className="w-14 shrink-0 text-right tabular-nums text-[#333333] font-semibold">
                {mode === 'count' ? r.value.toLocaleString() : `${pct.toFixed(1)}%`}
              </div>
            </div>
          )
        })}
        {densityOverlay && rows.length > 1 && (
          <DensityCurve rows={rows} max={max} />
        )}
      </div>
      {expanded && (
        <ExpandedModal title={title} data={data} uniformColor={uniformColor} onClose={() => setExpanded(false)} />
      )}
    </section>
  )
}

/** Fullscreen modal — shows the complete dataset (no maxRows cap) in a single column. */
function ExpandedModal({
  title, data, uniformColor, onClose,
}: { title: string; data: BarDatum[]; uniformColor?: string; onClose: () => void }) {
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((a, b) => a + b.value, 0)
  const max = sorted[0]?.value || 1
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DF]">
          <div>
            <h2 className="text-lg font-black text-[#333333]">{title}</h2>
            <p className="text-xs text-[#9C9C9C]">
              {sorted.length} categories · {total.toLocaleString()} records
            </p>
          </div>
          <button onClick={onClose} className="text-[#9C9C9C] hover:text-[#333333] text-2xl leading-none">×</button>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col gap-2">
            {sorted.map(r => {
              const pct = total > 0 ? (r.value / total) * 100 : 0
              const width = (r.value / max) * 100
              const color = r.color || uniformColor || colorForLabel(r.label, CHART_COLORS)
              return (
                <div key={r.label} className="flex items-center gap-3 text-[12px] py-1.5 border-b border-[#F5F5F5]">
                  <div className="flex-1 truncate font-medium text-[#333333]" title={r.label}>{r.label}</div>
                  <div className="w-48 h-2 bg-[#F5F5F5] rounded-full overflow-hidden shrink-0">
                    <div className="h-full" style={{ width: `${width}%`, backgroundColor: color }} />
                  </div>
                  <div className="w-12 text-right tabular-nums font-semibold text-[#333333]">{r.value}</div>
                  <div className="w-14 text-right tabular-nums text-[#9C9C9C]">{pct.toFixed(1)}%</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Smooth density curve overlay. Positioned absolutely over the bars column,
 * connecting each bar's tip with a Catmull-Rom-ish spline.
 *
 * The bars area is: left=128px (label col w-32) + 12px (gap-3); right=56px (value col w-14) + 12px (gap-3).
 * Each bar is h-6 (24px) with gap-2 (8px). The first bar starts at top of container (no top padding).
 */
function DensityCurve({ rows, max }: { rows: BarDatum[]; max: number }) {
  const BAR_H = 24
  const GAP = 8
  const LEFT = 128 + 12        // label width + gap
  const RIGHT = 56 + 12        // value width + gap
  const N = rows.length
  const totalH = N * BAR_H + (N - 1) * GAP

  // x-axis = value (0..max → 0..100%), y-axis = bar center
  const points = rows.map((r, i) => ({
    x: max > 0 ? (r.value / max) * 100 : 0,
    y: i * (BAR_H + GAP) + BAR_H / 2,
  }))

  // Build smooth path (viewBox: x=0..100, y=0..totalH; preserveAspectRatio=none stretches x)
  const path = points.map((p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    const prev = points[i - 1]
    const cx = (prev.x + p.x) / 2
    return `C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`
  }).join(' ')

  return (
    <svg
      className="absolute pointer-events-none"
      style={{ left: LEFT, top: 0, height: totalH, width: `calc(100% - ${LEFT + RIGHT}px)` }}
      preserveAspectRatio="none"
      viewBox={`0 0 100 ${totalH}`}
    >
      <path d={path} fill="none" stroke={PALETTE.persianRed} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.2" fill={PALETTE.persianRed} opacity="0.9" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}
