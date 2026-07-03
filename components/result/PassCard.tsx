import InlineCountdown from '@/components/InlineCountdown'

interface Props {
  /** Full name, rendered uppercase ("FIG JAM"). */
  name: string
  /** Persona display label ("Decision Maker"). */
  personaLabel: string
  /** Class line, e.g. "CLASS: EXPERIMENTER · RUNG 3 OF 6". */
  passClass: string
  /** Percentile field, e.g. "76th of 8.1B". */
  passPct: string
  /** Issue month, e.g. "07 / 2026" (computed server-side). */
  issued: string
  /** Reference number printed on the bottom strip, e.g. "AC-0723". */
  refNo: string
}

const CREAM = '#FEF7E7'

/**
 * The dark rotated "member pass" card from the design handoff hero: name,
 * class/rung line, a 4-field grid (persona / percentile / issued / gate
 * closes) and a barcode strip. GATE CLOSES ticks via InlineCountdown, which
 * shares its sessionStorage clock with the top offer bar.
 */
export function PassCard({ name, personaLabel, passClass, passPct, issued, refNo }: Props) {
  return (
    <div className="w-full max-w-[480px] mx-auto" style={{ transform: 'rotate(-1.6deg)' }}>
      <div
        className="relative overflow-hidden"
        style={{ backgroundColor: '#333333', border: '3px solid #1A1A1A', boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}
      >
        {/* Corner stripe */}
        <div
          className="absolute"
          style={{
            width: 260,
            height: 52,
            backgroundColor: '#E48715',
            border: '3px solid #1A1A1A',
            transform: 'rotate(-14deg)',
            top: -14,
            right: -78,
          }}
          aria-hidden
        />

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

          {/* Class line */}
          <div className="mt-3 font-mono font-medium" style={{ fontSize: 12, letterSpacing: '0.1em', color: '#E7B02F' }}>
            {passClass}
          </div>

          {/* Field grid */}
          <div
            className="mt-5 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3"
            style={{ borderTop: '1px solid rgba(254,247,231,0.25)' }}
          >
            {[
              { label: 'PERSONA', value: personaLabel },
              { label: 'PERCENTILE', value: passPct },
              { label: 'ISSUED', value: issued },
            ].map(f => (
              <div key={f.label}>
                <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: CREAM, opacity: 0.5 }}>{f.label}</div>
                <div className="mt-1" style={{ fontSize: 14, fontWeight: 600, color: CREAM }}>{f.value}</div>
              </div>
            ))}
            <div>
              <div className="font-mono" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: CREAM, opacity: 0.5 }}>GATE CLOSES</div>
              <div className="mt-1 font-mono font-bold pass-blink" style={{ fontSize: 15, color: '#E7B02F' }}>
                <InlineCountdown bare />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom strip: barcode + reference number */}
        <div
          className="relative flex items-center justify-between px-6 py-3"
          style={{ backgroundColor: CREAM, borderTop: '3px solid #1A1A1A' }}
        >
          <div
            aria-hidden
            style={{
              width: 200,
              maxWidth: '55%',
              height: 26,
              background: 'repeating-linear-gradient(90deg, #1A1A1A 0 2px, transparent 2px 5px)',
            }}
          />
          <span className="font-mono font-semibold" style={{ fontSize: 12, color: '#1A1A1A' }}>NO. {refNo}</span>
        </div>
      </div>

      <style>{`
        @keyframes pass-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
        .pass-blink { animation: pass-blink 1.6s step-end infinite; }
        @media (prefers-reduced-motion: reduce) { .pass-blink { animation: none; } }
      `}</style>
    </div>
  )
}
