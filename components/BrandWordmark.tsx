// Branded "AI Central" wordmark with an offset green shadow ghost behind
// the main type. Two stacked layers — the back layer is the AI Central
// Pigment-green, offset down-right; the front layer is the primary ink.
// Use for hero callouts where the brand name should pop.

const GREEN = '#62A758'   // AI Central pigment green
const INK = '#111111'

interface Props {
  /** Font size in px. The shadow offset scales with this. */
  size?: number
  className?: string
  /** Override the main text color (defaults to ink/black). */
  color?: string
  /** Override the shadow color (defaults to AI Central green). */
  shadow?: string
  /** What the wordmark should say. Defaults to "AI Central". */
  children?: React.ReactNode
}

export function BrandWordmark({
  size = 32,
  className,
  color = INK,
  shadow = GREEN,
  children = 'AI Central',
}: Props) {
  const offset = Math.max(2, Math.round(size * 0.08))
  return (
    <span
      className={`relative inline-block leading-none font-black tracking-tight align-baseline ${className ?? ''}`}
      style={{ fontSize: size }}
    >
      <span
        aria-hidden
        className="absolute inset-0 select-none"
        style={{
          color: shadow,
          transform: `translate(${offset}px, ${offset}px)`,
        }}
      >
        {children}
      </span>
      <span className="relative" style={{ color }}>
        {children}
      </span>
    </span>
  )
}
