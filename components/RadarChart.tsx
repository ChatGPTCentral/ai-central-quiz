'use client'

import { useEffect, useRef, useState } from 'react'

export interface RadarAxis {
  label: string
  /** 0–100 — the person's current value on this axis. */
  value: number
  /** Optional sub-label rendered above the main axis label (small grey). */
  group?: string
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
  todayLabel?: string
  projectedLabel?: string
  /** Title at the top of the chart (sits in the spec sheet "header"). */
  title?: string
  /** Smaller subtitle beneath the title. */
  subtitle?: string
}

const DEFAULT_ACCENT = '#1A53FF'      // technical blue — matches the reference
const INK = '#111111'
const RING_STROKE = '#C9C7BF'
const SECTOR_FILL_A = 'transparent'
const SECTOR_FILL_B = 'rgba(17,17,17,0.04)'

/** Default projection: lift each axis 55% of the way to 100, floor at +18,
 *  so there is always visible, confident headroom. */
function defaultProjection(values: number[]): number[] {
  return values.map(v => Math.min(100, Math.max(v + 18, v + (100 - v) * 0.55)))
}

function angleFor(i: number, n: number): number {
  // -90deg → first axis points straight up
  return (Math.PI * 2 * i) / n - Math.PI / 2
}

function pointsFor(values: number[], cx: number, cy: number, r: number): string {
  const n = values.length
  return values
    .map((v, i) => {
      const a = angleFor(i, n)
      const radius = (Math.max(0, Math.min(100, v)) / 100) * r
      return `${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`
    })
    .join(' ')
}

/** Build a wedge (pie slice) path between axis i and i+1, from inner to outer
 *  radius. Used for the alternating sector backgrounds. */
function sectorPath(i: number, n: number, cx: number, cy: number, rInner: number, rOuter: number): string {
  const a1 = angleFor(i, n) - Math.PI / n  // sector edges sit half-way between axes
  const a2 = angleFor(i, n) + Math.PI / n
  const x1o = cx + rOuter * Math.cos(a1), y1o = cy + rOuter * Math.sin(a1)
  const x2o = cx + rOuter * Math.cos(a2), y2o = cy + rOuter * Math.sin(a2)
  const x1i = cx + rInner * Math.cos(a1), y1i = cy + rInner * Math.sin(a1)
  const x2i = cx + rInner * Math.cos(a2), y2i = cy + rInner * Math.sin(a2)
  return `M ${x1o},${y1o} A ${rOuter},${rOuter} 0 0 1 ${x2o},${y2o} L ${x2i},${y2i} A ${rInner},${rInner} 0 0 0 ${x1i},${y1i} Z`
}

export function RadarChart({
  axes,
  projected,
  mode = 'result',
  accent = DEFAULT_ACCENT,
  size = 360,
  todayLabel = 'You today',
  projectedLabel = 'With AI Central',
  title,
  subtitle,
}: Props) {
  const current = axes.map(a => Math.max(0, Math.min(100, a.value)))
  const target = projected ?? defaultProjection(current)
  const n = axes.length

  // Reserve a generous label gutter so the rotated axis labels at the
  // pentagon vertices never get clipped by the viewBox.
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.30         // outer pentagon radius (was 0.36)
  const RING_COUNT = 5

  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setProgress(1); return }

    let start: number | null = null
    const ONCE_MS = 1200
    const HOLD_MS = 1400
    const LOOP_MS = 2200

    const tick = (t: number) => {
      if (start === null) start = t
      const elapsed = t - start

      if (mode === 'result') {
        const p = Math.min(1, elapsed / ONCE_MS)
        setProgress(1 - Math.pow(1 - p, 3))
        if (p < 1) rafRef.current = requestAnimationFrame(tick)
        return
      }

      const cycle = (LOOP_MS + HOLD_MS) * 2
      const m = elapsed % cycle
      let p: number
      if (m < LOOP_MS) p = m / LOOP_MS
      else if (m < LOOP_MS + HOLD_MS) p = 1
      else if (m < LOOP_MS * 2 + HOLD_MS) p = 1 - (m - LOOP_MS - HOLD_MS) / LOOP_MS
      else p = 0
      const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      setProgress(eased)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const morphed = current.map((c, i) => c + (target[i] - c) * progress)

  // Vertex positions of the outermost ring (the pentagon corners).
  const outerVertices = Array.from({ length: n }, (_, i) => {
    const a = angleFor(i, n)
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), a }
  })

  // Concentric pentagon rings (regular n-gon, scaled).
  const ringPolys = Array.from({ length: RING_COUNT }, (_, ringIdx) => {
    const k = (ringIdx + 1) / RING_COUNT
    return pointsFor(axes.map(() => k * 100), cx, cy, r)
  })

  return (
    <div className="w-full flex flex-col items-center" style={{ color: INK }}>
      {(title || subtitle) && (
        <div className="w-full max-w-[520px] text-left mb-2 sm:mb-3 self-start" style={{ paddingInlineStart: 4 }}>
          {title && <div className="text-[16px] sm:text-[18px] font-black leading-tight">{title}</div>}
          {subtitle && <div className="text-[11px] sm:text-[12px] mt-0.5" style={{ color: '#555' }}>{subtitle}</div>}
          <div className="mt-2 h-px w-full" style={{ background: '#000', opacity: 0.18 }} />
        </div>
      )}

      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        style={{ maxWidth: size, overflow: 'visible' }}
        role="img"
        aria-label="Skill radar"
      >
        {/* Alternating sector backgrounds — gives the "spec sheet" feel. */}
        {axes.map((_, i) => (
          <path
            key={`sec-${i}`}
            d={sectorPath(i, n, cx, cy, 0, r)}
            fill={i % 2 === 0 ? SECTOR_FILL_A : SECTOR_FILL_B}
          />
        ))}

        {/* Concentric pentagon rings */}
        {ringPolys.map((pts, i) => (
          <polygon
            key={`ring-${i}`}
            points={pts}
            fill="none"
            stroke={RING_STROKE}
            strokeWidth={i === RING_COUNT - 1 ? 1.4 : 0.8}
          />
        ))}

        {/* Spokes (center → vertex) */}
        {outerVertices.map((v, i) => (
          <line key={`spoke-${i}`} x1={cx} y1={cy} x2={v.x} y2={v.y} stroke={RING_STROKE} strokeWidth={0.8} />
        ))}

        {/* Sub-spokes — half-way lines between axes (sector boundaries) */}
        {Array.from({ length: n }, (_, i) => {
          const a = angleFor(i, n) + Math.PI / n
          const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a)
          return <line key={`sub-${i}`} x1={cx} y1={cy} x2={x} y2={y} stroke={RING_STROKE} strokeWidth={0.5} opacity={0.6} />
        })}

        {/* TODAY polygon — under, in gray so the upgrade reads as a pop. */}
        <polygon
          points={pointsFor(current, cx, cy, r)}
          fill="#111111"
          fillOpacity={0.18}
          stroke="#111111"
          strokeWidth={1.5}
          strokeLinejoin="miter"
        />
        {/* WITH AI CENTRAL polygon — solid bright accent, the headline shape. */}
        <polygon
          points={pointsFor(morphed, cx, cy, r)}
          fill={accent}
          fillOpacity={0.85}
          stroke={accent}
          strokeWidth={2}
          strokeLinejoin="miter"
        />
        {/* Vertex dots on the projected polygon */}
        {morphed.map((v, i) => {
          const a = angleFor(i, n)
          const rad = (v / 100) * r
          return <circle key={`dot-${i}`} cx={cx + rad * Math.cos(a)} cy={cy + rad * Math.sin(a)} r={3.2} fill="#FFFFFF" stroke={accent} strokeWidth={1.5} />
        })}

        {/* Axis labels — rotated to follow each spoke, with +/- direction tag. */}
        {axes.map((a, i) => {
          const ang = angleFor(i, n)
          const lr = r + 16                              // label baseline radius
          const lx = cx + lr * Math.cos(ang)
          const ly = cy + lr * Math.sin(ang)
          const deg = (ang * 180) / Math.PI
          // Keep text upright on the bottom half by flipping rotation.
          const flip = deg > 90 || deg < -90
          const rotate = flip ? deg + 180 : deg
          return (
            <g key={`lbl-${i}`} transform={`rotate(${rotate.toFixed(2)} ${lx.toFixed(2)} ${ly.toFixed(2)})`}>
              <text
                x={lx}
                y={ly}
                fontSize={11}
                fontWeight={800}
                fill={INK}
                textAnchor={flip ? 'end' : 'start'}
                dominantBaseline="middle"
                style={{ letterSpacing: 0.4, textTransform: 'uppercase' }}
              >
                {a.label} +
              </text>
            </g>
          )
        })}

        {/* Outer pentagon stroke — final crisp edge */}
        <polygon
          points={pointsFor(axes.map(() => 100), cx, cy, r)}
          fill="none"
          stroke={INK}
          strokeWidth={1.6}
        />
      </svg>

      {/* Legend + footnote — keeps the spec-sheet vibe. */}
      <div className="flex items-center gap-4 mt-1 text-[11px] font-bold uppercase" style={{ letterSpacing: 0.4 }}>
        <span className="flex items-center gap-1.5" style={{ color: INK }}>
          <span className="inline-block w-3 h-3" style={{ background: '#11111133', border: '1.5px solid #111111' }} />
          {todayLabel}
        </span>
        <span className="flex items-center gap-1.5" style={{ color: accent }}>
          <span className="inline-block w-3 h-3" style={{ background: accent, border: `1.5px solid ${accent}` }} />
          {projectedLabel}
        </span>
      </div>
      <p className="text-[10px] mt-1 italic" style={{ color: '#777' }}>
        Trait with + means more is better
      </p>
    </div>
  )
}
