'use client'

import { useEffect, useRef, useState } from 'react'

export interface RadarAxis {
  label: string
  /** 0–100 — the person's current value on this axis. */
  value: number
}

interface Props {
  axes: RadarAxis[]
  /** 0–100 per axis for the "with AI Central" projection. Defaults to a
   *  positive uplift of each current value toward the ceiling. */
  projected?: number[]
  /** 'result' plays the morph once on mount. 'demo' loops it forever
   *  (today → projected → today) for the marketing cover. */
  mode?: 'result' | 'demo'
  accent?: string
  /** Square px size of the SVG viewport. */
  size?: number
  /** Label under the two polygons. */
  todayLabel?: string
  projectedLabel?: string
}

const DEFAULT_ACCENT = '#E48715' // Fulvous

/** Default projection: lift each axis 55% of the way to 100, floor at +18,
 *  so there is always visible, confident headroom. */
function defaultProjection(values: number[]): number[] {
  return values.map(v => Math.min(100, Math.max(v + 18, v + (100 - v) * 0.55)))
}

function pointsFor(values: number[], cx: number, cy: number, r: number): string {
  const n = values.length
  return values
    .map((v, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const radius = (Math.max(0, Math.min(100, v)) / 100) * r
      return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`
    })
    .join(' ')
}

export function RadarChart({
  axes,
  projected,
  mode = 'result',
  accent = DEFAULT_ACCENT,
  size = 320,
  todayLabel = 'You today',
  projectedLabel = 'With AI Central',
}: Props) {
  const current = axes.map(a => Math.max(0, Math.min(100, a.value)))
  const target = projected ?? defaultProjection(current)
  const n = axes.length

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.34 // leave room for labels

  // progress 0 → today shape, 1 → projected shape. Drives the morph.
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setProgress(1); return }

    let start: number | null = null
    const ONCE_MS = 1100
    const HOLD_MS = 1400
    const LOOP_MS = 2200

    const tick = (t: number) => {
      if (start === null) start = t
      const elapsed = t - start

      if (mode === 'result') {
        // Ease-out once, then stay at projected.
        const p = Math.min(1, elapsed / ONCE_MS)
        setProgress(1 - Math.pow(1 - p, 3))
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
        return
      }

      // demo: today → (hold) → projected → (hold) → today, forever.
      const cycle = (LOOP_MS + HOLD_MS) * 2
      const m = elapsed % cycle
      let p: number
      if (m < LOOP_MS) p = m / LOOP_MS                       // inflate
      else if (m < LOOP_MS + HOLD_MS) p = 1                  // hold high
      else if (m < LOOP_MS * 2 + HOLD_MS) p = 1 - (m - LOOP_MS - HOLD_MS) / LOOP_MS // deflate
      else p = 0                                             // hold low
      // ease
      const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      setProgress(eased)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Morphed "projected" polygon = lerp(current, target, progress).
  const morphed = current.map((c, i) => c + (target[i] - c) * progress)

  const rings = [0.25, 0.5, 0.75, 1]
  const axisLines = Array.from({ length: n }, (_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), angle }
  })

  return (
    <div className="w-full flex flex-col items-center">
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: size }} role="img" aria-label="Skill radar">
        {/* grid rings */}
        {rings.map((ring, i) => (
          <polygon
            key={i}
            points={pointsFor(current.map(() => ring * 100), cx, cy, r)}
            fill="none"
            stroke="#E8E4DF"
            strokeWidth={1}
          />
        ))}
        {/* spokes */}
        {axisLines.map((a, i) => (
          <line key={i} x1={cx} y1={cy} x2={a.x} y2={a.y} stroke="#E8E4DF" strokeWidth={1} />
        ))}

        {/* projected (drawn first, behind) */}
        <polygon
          points={pointsFor(morphed, cx, cy, r)}
          fill={accent}
          fillOpacity={0.18}
          stroke={accent}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* today (solid, on top) */}
        <polygon
          points={pointsFor(current, cx, cy, r)}
          fill="#333333"
          fillOpacity={0.10}
          stroke="#333333"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* today vertices */}
        {current.map((c, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2
          const radius = (c / 100) * r
          return <circle key={i} cx={cx + radius * Math.cos(angle)} cy={cy + radius * Math.sin(angle)} r={3} fill="#333333" />
        })}

        {/* axis labels */}
        {axes.map((a, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2
          const lx = cx + (r + 18) * Math.cos(angle)
          const ly = cy + (r + 18) * Math.sin(angle)
          const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end'
          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={700}
              fill="#9C9C9C"
            >
              {a.label}
            </text>
          )
        })}
      </svg>

      {/* legend */}
      <div className="flex items-center gap-4 mt-2 text-[11px] font-semibold">
        <span className="flex items-center gap-1.5" style={{ color: '#333333' }}>
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#33333322', border: '2px solid #333333' }} />
          {todayLabel}
        </span>
        <span className="flex items-center gap-1.5" style={{ color: accent }}>
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: `${accent}33`, border: `2px solid ${accent}` }} />
          {projectedLabel}
        </span>
      </div>
    </div>
  )
}
