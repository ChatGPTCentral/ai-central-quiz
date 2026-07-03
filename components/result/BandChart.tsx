// "The bigger picture" adoption band chart — faithful to design-handoff §3.
// A 120px-tall framed strip of 6 dot-matrix bands (column widths 50 / 22 / 9 /
// 7.5 / 6 / 5.5%, rungs 3-6 enlarged to stay visible), separated by 3px ink
// rules, with a blinking YOU marker centered on the visitor's band.

import type { StageKey } from '@/lib/segmentation-v2'

const INK = '#333333'
const RICH = '#1A1A1A'
const FULVOUS = '#E48715'

export interface Band {
  n: string
  name: string
  usage: string
  count: string
  color: string
  width: string
  center: string // YOU marker position for this band
}

export const BANDS: Band[] = [
  { n: '01', name: 'Unaware',      usage: 'Never used AI',        count: '~6.8B · 84%',   color: '#C9C4B8', width: '50%',   center: '25%' },
  { n: '02', name: 'Curious',      usage: 'Free chatbot user',    count: '~1.3B · 16%',   color: '#046BB1', width: '22%',   center: '61%' },
  { n: '03', name: 'Experimenter', usage: 'Pays for AI',          count: '~25M · 0.3%',   color: '#E48715', width: '9%',    center: '76.5%' },
  { n: '04', name: 'Practitioner', usage: 'Weekly AI at work',    count: '~10M · 0.12%',  color: '#E7B02F', width: '7.5%',  center: '84.75%' },
  { n: '05', name: 'Power User',   usage: 'Daily, multiple tools', count: '~6M · 0.07%',  color: '#38A7AD', width: '6%',    center: '91.5%' },
  { n: '06', name: 'Builder',      usage: 'Agents',               count: '~2-5M · 0.04%', color: '#BE3B3B', width: '5.5%',  center: '97.25%' },
]

const STAGE_BAND: Record<Exclude<StageKey, 'unknown'>, number> = {
  S0_unaware: 0,
  S1_curious: 1,
  S2_experimenter: 2,
  S3_practitioner: 3,
  S4_power_user: 4,
  S5_builder: 5,
}

/** Just the framed 6-band dot-matrix strip — reused by the result chart,
 *  the landing teaser, and the quiz checkpoint interstitial. */
export function BandStrip({ height = 120 }: { height?: number }) {
  return (
    <div className="flex" style={{ border: `3px solid ${INK}`, height }}>
      {BANDS.map((b, i) => (
        <div
          key={b.n}
          style={{
            width: b.width,
            borderRight: i < BANDS.length - 1 ? `3px solid ${INK}` : undefined,
            backgroundImage: `radial-gradient(circle at 4.5px 4.5px, ${b.color} 1.7px, transparent 1.9px)`,
            backgroundSize: '9px 9px',
          }}
          aria-label={`${b.name}: ${b.usage}, ${b.count}`}
        />
      ))}
    </div>
  )
}

export function BandChart({ stage }: { stage?: string | null }) {
  const bandIdx = STAGE_BAND[(stage as Exclude<StageKey, 'unknown'>)] ?? 1
  const youLeft = BANDS[bandIdx].center

  return (
    <div className="w-full">
      {/* Chart strip + YOU marker (marker chip needs headroom above the frame) */}
      <div className="relative" style={{ paddingTop: 34 }}>
        <BandStrip height={120} />
        {/* YOU marker: chip above the frame + blinking dot centered on the band */}
        <div className="absolute top-0 bottom-0" style={{ left: youLeft, width: 0 }}>
          <span
            className="absolute font-mono"
            style={{
              top: 0,
              left: 0,
              transform: 'translateX(-50%)',
              fontSize: 10,
              letterSpacing: '0.08em',
              backgroundColor: '#FFFFFF',
              border: `2px solid ${RICH}`,
              padding: '2px 7px',
              color: RICH,
              whiteSpace: 'nowrap',
            }}
          >
            YOU
          </span>
          <span
            className="absolute band-you-dot"
            style={{
              top: 34 + 60,
              left: 0,
              transform: 'translate(-50%, -50%)',
              width: 11,
              height: 11,
              borderRadius: '50%',
              backgroundColor: FULVOUS,
              border: `2px solid ${RICH}`,
              boxShadow: '0 0 0 4px rgba(228,135,21,.3)',
            }}
            aria-hidden
          />
        </div>
      </div>

      {/* Legend: 6 columns under the chart */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-4">
        {BANDS.map(b => (
          <div key={`lg-${b.n}`}>
            <div className="flex items-center gap-1.5">
              <span className="inline-block flex-shrink-0" style={{ width: 10, height: 10, backgroundColor: b.color }} />
              <span style={{ fontWeight: 600, fontSize: 12.5, color: RICH }}>{b.n} {b.name}</span>
            </div>
            <div className="mt-1" style={{ fontSize: 11.5, lineHeight: 1.4, color: '#666666' }}>
              {b.usage}
              <br />
              {b.count}
            </div>
          </div>
        ))}
      </div>

      {/* Footnotes */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-1 mt-4" style={{ fontSize: 11.5, color: '#9C9C9C' }}>
        <span>Each dot ≈ 3.2M people · rungs 3-6 enlarged to stay visible</span>
        <span>Sources: OpenAI · World Bank &amp; Microsoft AI diffusion · public adoption surveys (2026)</span>
      </div>

      <style>{`
        @keyframes band-you-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
        .band-you-dot { animation: band-you-blink 1.2s step-end infinite; }
        @media (prefers-reduced-motion: reduce) { .band-you-dot { animation: none; } }
      `}</style>
    </div>
  )
}
