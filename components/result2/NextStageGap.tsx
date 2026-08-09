import CheckoutLink from '@/components/CheckoutLink.client'

// The gap to the next stage, named exactly.
//
// WHY THIS AND NOT "what a Power User is reading". That framing already exists,
// it is the LibraryGrid heading, and it does not work as a reason to buy
// because it describes a room you are not in without telling you the door.
//
// The theory is the owner's: buying is driven by a felt gap, not by capability.
// A gap only produces action when it is (a) small, (b) specific, and (c) yours.
// Ours is all three and we were throwing it away, because the ladder's top
// rungs are earned by three named actions and we already know which of them
// each person has done:
//
//   1 building action  → Practitioner
//   2                  → Power User
//   3, or shipped + 2  → Builder
//
// So instead of "here is a stage above you", this says "you have done two of
// the three, here is the one you have not". That is a sentence somebody can act
// on this afternoon, and it is true, which the generic version was not.
//
// Renders nothing for people already at the top, and nothing for the rows from
// before depth_actions existed. A gap we cannot compute is a gap we do not
// claim.

const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const GREEN = '#62A758'
const PAPER = '#FBF6EC'

/** The three actions that actually move you up. Must match segmentation-v2. */
const BUILDER_ACTIONS: { key: string; label: string; how: string }[] = [
  {
    key: 'custom_gpt',
    label: 'Built a custom GPT or Claude Project',
    how: 'The usual first one. About twenty minutes with a tutorial open beside you.',
  },
  {
    key: 'connected',
    label: 'Connected AI to another tool',
    how: 'Zapier, n8n or an API, so something runs without you starting it.',
  },
  {
    key: 'shipped',
    label: 'Shipped something AI-powered to a customer or team',
    how: 'The one that separates the top of the ladder from everyone else.',
  },
]

export function NextStageGap({
  depthActions,
  nextStageLabel,
  checkoutUrl,
  submissionId,
  ctaLabel,
}: {
  depthActions?: string | null
  nextStageLabel?: string | null
  checkoutUrl: string
  submissionId?: string
  ctaLabel: string
}) {
  // No raw picks means no honest gap. Silence beats a guess.
  if (depthActions == null) return null

  const picked = depthActions.split(',').map(a => a.trim()).filter(Boolean)
  const done = BUILDER_ACTIONS.filter(a => picked.includes(a.key))
  const missing = BUILDER_ACTIONS.filter(a => !picked.includes(a.key))
  const shipped = picked.includes('shipped')

  // Already at the top: 3 actions, or shipped plus 2. Nothing above them, so
  // there is no gap to sell and pretending otherwise would be a lie.
  if (done.length >= 3 || (shipped && done.length >= 2)) return null

  // What the next rung costs, straight from the classifier's own rules.
  const target =
    done.length === 0 ? 'Practitioner'
      : done.length === 1 ? 'Power User'
      : 'Builder'
  const label = nextStageLabel || target

  // The one to point at. "shipped" is the heaviest lift, so it is only the
  // headline suggestion when it is the last one standing.
  const suggestion = missing.find(a => a.key !== 'shipped') ?? missing[0]

  const headline =
    done.length === 0
      ? `Nothing between you and ${label} but one build`
      : done.length === 1
        ? `You are one build from ${label}`
        : `One left, and it is ${label}`

  return (
    <section className="mt-10" style={{ border: `2px solid ${RICH}`, backgroundColor: PAPER, padding: '22px 20px', maxWidth: 640 }}>
      <p className="uppercase" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: FULVOUS, marginBottom: 8 }}>
        The gap
      </p>
      <h2 style={{ fontSize: 'clamp(21px, 3vw, 26px)', fontWeight: 800, letterSpacing: '-0.03em', color: RICH, lineHeight: 1.15 }}>
        {headline}
      </h2>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: BODY, marginTop: 8 }}>
        The top of this ladder is not earned by using AI more. It is earned by three things, and
        you have done {done.length} of them.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
        {BUILDER_ACTIONS.map(a => {
          const isDone = picked.includes(a.key)
          return (
            <li
              key={a.key}
              className="flex items-start gap-3"
              style={{ padding: '11px 0', borderTop: `1px solid #E6E1D6` }}
            >
              <span
                aria-hidden
                className="inline-flex items-center justify-center flex-shrink-0"
                style={{
                  width: 22, height: 22, marginTop: 1,
                  backgroundColor: isDone ? GREEN : '#FFFFFF',
                  border: `2px solid ${isDone ? GREEN : MUTE}`,
                  color: '#FFFFFF', fontSize: 13, fontWeight: 800, lineHeight: 1,
                }}
              >
                {isDone ? '✓' : ''}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: isDone ? 600 : 700, color: isDone ? MUTE : RICH, lineHeight: 1.35, textDecoration: isDone ? 'line-through' : 'none' }}>
                  {a.label}
                </span>
                {!isDone && (
                  <span style={{ display: 'block', fontSize: 13, color: BODY, marginTop: 3, lineHeight: 1.45 }}>
                    {a.how}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {suggestion && (
        <p style={{ fontSize: 15, lineHeight: 1.5, color: RICH, marginTop: 16, fontWeight: 500 }}>
          Start with <strong style={{ fontWeight: 700 }}>{suggestion.label.toLowerCase()}</strong>. The library has the
          step-by-step for it, screenshots at every step, no code.
        </p>
      )}

      <div className="mt-4">
        <CheckoutLink
          href={checkoutUrl}
          placement="v2_next_stage_gap"
          submissionId={submissionId}
          className="inline-flex"
          style={{ textDecoration: 'none' }}
        >
          <span
            className="inline-flex items-center justify-center"
            style={{ backgroundColor: RICH, color: CREAM, fontWeight: 600, fontSize: 15.5, height: 50, padding: '0 22px' }}
          >
            {ctaLabel}
          </span>
          <span
            className="inline-flex items-center justify-center"
            style={{ backgroundColor: FULVOUS, color: RICH, width: 50, height: 50, borderLeft: `2px solid ${RICH}`, fontWeight: 600, fontSize: 15.5 }}
            aria-hidden
          >
            ↗
          </span>
        </CheckoutLink>
      </div>
    </section>
  )
}
