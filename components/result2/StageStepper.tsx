import { STAGES } from '@/lib/segmentation-v2'

// Horizontal AI-journey stepper: achieved rungs green + checked, unachieved
// grey — with a "≈ N wks" estimate under each rung still ahead (cumulative,
// authored pacing of the library curriculum: how long each climb typically
// takes a member studying a few hours a week).
const STEP_WEEKS: Record<string, number> = {
  S1_curious: 1,
  S2_experimenter: 2,
  S3_practitioner: 3,
  S4_power_user: 4,
  S5_builder: 6,
}

const GREEN = '#2E7D32'
const GREEN_BG = '#62A758'
const GREY = '#C4BDB2'
const INK = '#333333'
const MUTE = '#9C9C9C'

export function StageStepper({ stageKey }: { stageKey?: string | null }) {
  const rungs = STAGES.filter(s => s.key !== 'unknown')
  // Unknown/missing stage: show the first rung achieved so the journey
  // always starts somewhere sensible.
  const currentScore = rungs.find(s => s.key === stageKey)?.score ?? 0

  let cumulativeWeeks = 0

  return (
    <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="flex items-start" style={{ minWidth: 640, padding: '6px 2px' }}>
        {rungs.map((s, i) => {
          const achieved = s.score <= currentScore
          if (!achieved) cumulativeWeeks += STEP_WEEKS[s.key] ?? 2
          const connectorDone = s.score <= currentScore
          return (
            <div key={s.key} className="flex-1 min-w-0" style={{ position: 'relative' }}>
              {/* connector to the previous dot */}
              {i > 0 && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', top: 17, right: '50%', width: '100%', height: 4,
                    backgroundColor: connectorDone ? GREEN_BG : '#E3DED4', zIndex: 0,
                  }}
                />
              )}
              <div className="flex flex-col items-center" style={{ position: 'relative', zIndex: 1 }}>
                <span
                  className="flex items-center justify-center"
                  style={{
                    width: 38, height: 38, borderRadius: '50%',
                    backgroundColor: achieved ? GREEN_BG : '#FFFFFF',
                    border: `3px solid ${achieved ? GREEN : GREY}`,
                    color: achieved ? '#FFFFFF' : GREY,
                    fontSize: achieved ? 18 : 15,
                    fontWeight: 800,
                  }}
                  aria-label={achieved ? `${s.label}: achieved` : `${s.label}: not yet`}
                >
                  {achieved ? '✓' : s.emoji}
                </span>
                <span className="mt-2 text-center" style={{ fontSize: 12.5, fontWeight: 700, color: achieved ? INK : MUTE, lineHeight: 1.2 }}>
                  {s.label}
                </span>
                {achieved ? (
                  <span className="mt-0.5" style={{ fontSize: 10.5, fontWeight: 700, color: GREEN, letterSpacing: '0.06em' }}>
                    {s.score === currentScore ? 'YOU ARE HERE' : 'DONE'}
                  </span>
                ) : (
                  <span className="mt-0.5" style={{ fontSize: 10.5, color: MUTE, fontVariantNumeric: 'tabular-nums' }}>
                    ≈ {cumulativeWeeks} wk{cumulativeWeeks === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
