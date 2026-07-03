interface Props {
  /** Full name, rendered uppercase ("FIG JAM"). */
  name: string
  /** Persona display label ("Decision Maker"). */
  personaLabel: string
  /** Stage line, e.g. "STAGE: EXPERIMENTER". */
  stageLine: string
  /** AI Leadership Score field, e.g. "Top 24% World". */
  passPct: string
  /** Issue month, e.g. "07 / 2026" (computed server-side). */
  issued: string
  /** Reference number printed on the bottom strip, e.g. "AC-0723". */
  refNo: string
  /** Short profile description rendered on the card in small type. */
  description?: string
}

const CREAM = '#FEF7E7'

/**
 * Barcode-looking strip: irregular bar widths generated deterministically
 * from the seed (the pass number), so every pass gets its own pattern and
 * server/client renders match.
 */
export function Barcode({ seed, width = 200, height = 26, color = '#1A1A1A' }: { seed: string; width?: number; height?: number; color?: string }) {
  let h = 0
  for (const c of seed) h = ((h * 31 + c.charCodeAt(0)) >>> 0)
  const bars: { x: number; w: number }[] = []
  // start guard
  bars.push({ x: 0, w: 2 }, { x: 3, w: 1 })
  let x = 6
  while (x < width - 8) {
    h = ((h * 1103515245 + 12345) >>> 0)
    const w = 1 + (h % 4)
    h = ((h * 1103515245 + 12345) >>> 0)
    const gap = 1 + (h % 3)
    bars.push({ x, w })
    x += w + gap
  }
  // end guard
  bars.push({ x: width - 5, w: 1 }, { x: width - 3, w: 2 })
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', maxWidth: '100%' }} aria-hidden>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill={color} />
      ))}
    </svg>
  )
}

/**
 * The dark rotated "member pass" card on the result hero: name, stage line,
 * a 3-field grid (profile / AI leadership score / issued), the profile
 * description in small type, and a barcode strip.
 */
export function PassCard({ name, personaLabel, stageLine, passPct, issued, refNo, description }: Props) {
  return (
    <div className="w-full max-w-[480px] mx-auto" style={{ transform: 'rotate(-1.6deg)' }}>
      <div
        className="relative overflow-hidden"
        style={{ backgroundColor: '#333333', border: '3px solid #1A1A1A', boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}
      >
        <div className="relative px-6 pt-6 pb-5 sm:px-7 sm:pt-7">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono font-semibold" style={{ fontSize: 11, letterSpacing: '0.16em', color: CREAM, opacity: 0.65 }}>
              AI CENTRAL · MEMBER PASS
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-avatar-light.png" alt="" width={22} height={22} style={{ display: 'block' }} />
          </div>

          {/* Name */}
          <div
            className="mt-5 font-black uppercase leading-none break-words"
            style={{ fontSize: 'clamp(30px, 6vw, 46px)', letterSpacing: '-0.03em', color: CREAM }}
          >
            {name}
          </div>

          {/* Stage line */}
          <div className="mt-3 font-mono font-medium" style={{ fontSize: 12, letterSpacing: '0.1em', color: '#E7B02F' }}>
            {stageLine}
          </div>

          {/* Field grid */}
          <div
            className="mt-5 pt-4 grid grid-cols-3 gap-x-4 gap-y-3"
            style={{ borderTop: '1px solid rgba(254,247,231,0.25)' }}
          >
            {[
              { label: 'PROFILE', value: personaLabel },
              { label: 'AI LEADERSHIP SCORE', value: passPct },
              { label: 'ISSUED', value: issued },
            ].map(f => (
              <div key={f.label}>
                <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: CREAM, opacity: 0.5 }}>{f.label}</div>
                <div className="mt-1" style={{ fontSize: 14, fontWeight: 600, color: CREAM }}>{f.value}</div>
              </div>
            ))}
          </div>

          {/* Profile description — small explanatory type */}
          {description && (
            <p className="mt-4" style={{ fontSize: 10.5, lineHeight: 1.55, color: CREAM, opacity: 0.75 }}>
              {description}
            </p>
          )}
        </div>

        {/* Bottom strip: barcode + reference number */}
        <div
          className="relative flex items-center justify-between gap-4 px-6 py-3"
          style={{ backgroundColor: CREAM, borderTop: '3px solid #1A1A1A' }}
        >
          <Barcode seed={refNo} width={200} height={26} />
          <span className="font-mono font-semibold flex-shrink-0" style={{ fontSize: 12, color: '#1A1A1A' }}>NO. {refNo}</span>
        </div>
      </div>
    </div>
  )
}
