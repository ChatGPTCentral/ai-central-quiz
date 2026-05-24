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
}

export default function HorizontalBarChart({
  title, subtitle, data, maxRows = 10, groupRest = true, uniformColor, rightAction, defaultMode = 'count',
}: Props) {
  const [mode, setMode] = useState<'count' | 'percent'>(defaultMode)

  const { rows, total, max } = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.value - a.value)
    let rows: BarDatum[] = sorted.slice(0, maxRows)
    if (groupRest && sorted.length > maxRows) {
      const rest = sorted.slice(maxRows).reduce((a, b) => a + b.value, 0)
      if (rest > 0) rows.push({ label: 'Others', value: rest, color: PALETTE.battleshipGrey })
    }
    const total = sorted.reduce((a, b) => a + b.value, 0)
    const max = Math.max(...rows.map(r => r.value), 1)
    return { rows, total, max }
  }, [data, maxRows, groupRest])

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
      <div className="px-5 pb-5 flex flex-col gap-2">
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
      </div>
    </section>
  )
}
