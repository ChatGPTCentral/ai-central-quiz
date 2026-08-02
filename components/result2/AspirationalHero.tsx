import { StageGauge } from '@/components/result2/StageGauge'
import CheckoutLink from '@/components/CheckoutLink.client'
import PayBadges from '@/components/result2/PayBadges.client'

// The "almost" hero (experiment arm `aspirational`).
//
// The live hero states what someone IS: "you're a top 38% AI adopter, and on
// the leverage ladder you're an experimenter". True, and completely static —
// it closes a loop instead of opening one, and the only thing to DO above the
// fold is a scroll anchor. Two thirds of visitors never reach a real CTA.
//
// This one states what they are ABOUT TO BE: one rung up, one week away, and
// here is the button. Same design language, same gauge, same honest
// percentile; only the tense changes, from diagnosis to momentum.
//
// The "≈1 week" claim is the same weeks rule the gauge has always used (the
// next rung is ~1 wk with the library), so nothing new is being promised here.
// Someone already at the top rung gets a different, non-aspirational line
// rather than an invented rung above Builder.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")"

export function AspirationalHero({
  firstName,
  score,
  aheadPct,
  stageKey,
  rungClassName,
  nextStageLabel,
  checkoutUrl,
  submissionId,
  ctaLabel,
}: {
  firstName: string
  score: number
  aheadPct: number
  stageKey: string
  rungClassName: string
  /** Null when they are already at the top rung. */
  nextStageLabel: string | null
  checkoutUrl: string
  submissionId?: string
  ctaLabel: string
}) {
  const who = firstName ? `${firstName}, you` : 'You'
  const target = nextStageLabel ?? null

  return (
    <section style={{ backgroundColor: '#FBF6EC', backgroundImage: GRAIN }}>
      <div className="max-w-[1100px] mx-auto px-6 sm:px-12 pt-10 sm:pt-14 pb-11 grid grid-cols-1 min-[900px]:grid-cols-[1fr_1fr] gap-9 min-[900px]:gap-16 items-center text-center min-[900px]:text-left">
        <div>
          <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}>
            Your quiz results
          </span>

          <h1 className="mt-4 font-bold" style={{ fontSize: 'clamp(32px, 4.7vw, 54px)', lineHeight: 1.0, letterSpacing: '-0.045em', color: RICH }}>
            {target ? (
              <>{who}&rsquo;re almost a <span style={{ color: FULVOUS }}>{target}</span></>
            ) : (
              <>{who}&rsquo;re already a <span style={{ color: FULVOUS }}>{rungClassName.toLowerCase()}</span></>
            )}
          </h1>

          <p className="mt-4 mx-auto min-[900px]:mx-0 max-w-[520px]" style={{ fontWeight: 300, fontSize: 17.5, lineHeight: 1.5, color: BODY }}>
            {target ? (
              <>
                Your score is <strong style={{ fontWeight: 700, color: RICH }}>{score}/100</strong>, which puts you a
                {' '}<strong style={{ fontWeight: 700, color: RICH }}>{rungClassName.toLowerCase()}</strong> — about
                {' '}<strong style={{ fontWeight: 700, color: RICH }}>one week</strong> from {target.toLowerCase()} with the right five tutorials.
              </>
            ) : (
              <>
                Your score is <strong style={{ fontWeight: 700, color: RICH }}>{score}/100</strong>. You are at the top of the
                ladder, which means the library is for depth now, not for catching up.
              </>
            )}
          </p>

          {/* The thing the live hero does not have: something to DO, here,
              before any scrolling. */}
          <div className="mt-6 flex flex-col items-center min-[900px]:items-start w-full" style={{ gap: 10 }}>
            <CheckoutLink
              href={checkoutUrl}
              placement="v2_aspirational_hero"
              submissionId={submissionId}
              className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]"
              style={{ textDecoration: 'none' }}
            >
              <span className="inline-flex items-center justify-center" style={{ backgroundColor: INK, color: CREAM, fontWeight: 700, fontSize: 17, height: 56, padding: '0 26px' }}>
                {ctaLabel}
              </span>
              <span className="inline-flex items-center justify-center" style={{ backgroundColor: FULVOUS, color: RICH, width: 56, height: 56, borderLeft: `2px solid ${RICH}`, fontWeight: 700, fontSize: 17 }} aria-hidden>↗</span>
            </CheckoutLink>

            <div className="w-full" style={{ maxWidth: 470 }}>
              <PayBadges fallbackUrl={checkoutUrl} submissionId={submissionId} placement="v2_aspirational_hero_badges" />
            </div>

            <span style={{ fontSize: 12.5, color: MUTE }}>
              $4.99 for 4 weeks &middot; cancel any time &middot;{' '}
              <a href="#pass" style={{ color: MUTE, textDecoration: 'underline' }}>or get your free pass first ↓</a>
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <StageGauge stageKey={stageKey} aheadPct={aheadPct} />
          {target && (
            <p className="mt-1 text-center" style={{ fontSize: 14, color: BODY, fontWeight: 300 }}>
              One rung to go: <strong style={{ fontWeight: 700, color: RICH }}>{target}</strong>
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
