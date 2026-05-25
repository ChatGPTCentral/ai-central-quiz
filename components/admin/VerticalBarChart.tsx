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
  /** Set false to hide the density + normal-distribution overlays (useful for nominal categories like sex). */
  showCurves?: boolean
}

/**
 * Vertical bar chart with a smooth density curve overlaid on the bar tops.
 *
 * X-axis: ordered categories (Age brackets, Company-size buckets, …).
 * Y-axis: count or % of total. Density line connects each bar's top center
 * with a Catmull-Rom-ish spline.
 */
export default function VerticalBarChart({
  title, subtitle, data, orderedLabels, uniformColor, defaultMode = 'count', curveColor, showCurves = true,
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
  const densityStroke = curveColor || PALETTE.persianRed
  const gaussianStroke = PALETTE.battleshipGrey

  // SVG geometry — viewBox is normalized so we can stretch it.
  const N = rows.length
  const VB_W = 100
  const VB_H = 100
  const PAD_X = 4
  const usableW = VB_W - PAD_X * 2
  const slotW = usableW / N
  const barW = slotW * 0.6

  // Bar geometry
  const points = rows.map((r, i) => {
    const cx = PAD_X + slotW * i + slotW / 2
    const h = max > 0 ? (r.value / max) * (VB_H - 2) : 0
    const top = VB_H - h
    return { label: r.label, value: r.value, cx, top, h }
  })

  // ── Density (KDE) + reference Gaussian over bucket positions 0..N-1 ──
  const weights = rows.map(r => r.value)
  const stats = computeStats(weights)
  const SAMPLES = 80
  const xMin = -0.5
  const xMax = N - 0.5
  const sampleXs = Array.from({ length: SAMPLES }, (_, k) => xMin + (k / (SAMPLES - 1)) * (xMax - xMin))
  // KDE bandwidth — Silverman-ish for tiny n, clamped to keep curve readable
  const h = Math.max(0.55, Math.min(1.2, 1.06 * stats.std * Math.pow(Math.max(stats.total, 1), -1 / 5)))
  const kdeVals = sampleXs.map(x => kdeAt(x, weights, stats.total, h))
  const gaussVals = sampleXs.map(x => gaussianAt(x, stats.mean, stats.std))

  // Scale both curves so each one's peak fits the chart's max-height (lets the
  // shapes be compared at a glance even though the data isn't truly normal).
  const kdeMax = Math.max(...kdeVals, 1e-6)
  const gaussMax = Math.max(...gaussVals, 1e-6)
  const targetTop = 2  // small headroom so peaks don't kiss the top edge
  const targetH = VB_H - targetTop

  const xToCx = (x: number) => PAD_X + ((x - xMin) / (xMax - xMin)) * usableW

  const densityPath = stats.total > 0
    ? sampleXs.map((x, k) => {
        const cx = xToCx(x)
        const cy = VB_H - (kdeVals[k] / kdeMax) * targetH
        return `${k === 0 ? 'M' : 'L'} ${cx} ${cy}`
      }).join(' ')
    : ''

  const gaussianPath = stats.total > 0
    ? sampleXs.map((x, k) => {
        const cx = xToCx(x)
        const cy = VB_H - (gaussVals[k] / gaussMax) * targetH
        return `${k === 0 ? 'M' : 'L'} ${cx} ${cy}`
      }).join(' ')
    : ''

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
            {/* Reference Gaussian (drawn first so the empirical density sits on top) */}
            {showCurves && N > 1 && stats.total > 0 && (
              <path
                d={gaussianPath}
                fill="none"
                stroke={gaussianStroke}
                strokeWidth="1.2"
                strokeDasharray="2 2"
                strokeLinecap="round"
                opacity="0.7"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* Empirical density (KDE) */}
            {showCurves && N > 1 && stats.total > 0 && (
              <path
                d={densityPath}
                fill="none"
                stroke={densityStroke}
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.95"
                vectorEffect="non-scaling-stroke"
              />
            )}
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

        {/* Legend */}
        {showCurves && stats.total > 0 && (
          <div className="flex items-center justify-end gap-4 mt-2 text-[9px] text-[#9C9C9C] uppercase tracking-wider font-bold">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-px" style={{ backgroundColor: densityStroke }} />
              Density
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="16" height="2" className="inline-block">
                <line x1="0" y1="1" x2="16" y2="1" stroke={gaussianStroke} strokeWidth="1.2" strokeDasharray="2 2" />
              </svg>
              Normal (μ={stats.mean.toFixed(1)}, σ={stats.std.toFixed(2)})
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Stats helpers ──────────────────────────────────────────────────

function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI)
}

/** Mean + (population) std of bucket positions 0..N-1 weighted by counts. */
function computeStats(weights: number[]): { mean: number; std: number; total: number } {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total === 0) return { mean: 0, std: 1, total: 0 }
  let mean = 0
  for (let i = 0; i < weights.length; i++) mean += i * weights[i]
  mean /= total
  let variance = 0
  for (let i = 0; i < weights.length; i++) variance += weights[i] * (i - mean) ** 2
  variance /= total
  // Floor variance so the gaussian doesn't degenerate to a spike when nearly
  // everyone is in one bucket — keeps the reference curve visible.
  return { mean, std: Math.sqrt(Math.max(variance, 0.25)), total }
}

function gaussianAt(x: number, mean: number, std: number): number {
  return gaussianKernel((x - mean) / std) / std
}

/** Weighted kernel density estimate over bucket positions. */
function kdeAt(x: number, weights: number[], total: number, h: number): number {
  if (total === 0 || h <= 0) return 0
  let sum = 0
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i] * gaussianKernel((x - i) / h)
  }
  return sum / (total * h)
}
