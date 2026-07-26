import CheckoutLink from '@/components/CheckoutLink.client'
import { StageGauge } from '@/components/result2/StageGauge'

// Design-lab heroes for /result?design=a|b|c|d — four copy/framing directions for
// the result hero. These KEEP the AI Central design language intact: the same
// tachometer gauge, the same block button, cream/ink/orange, the same section
// rhythm. Only the eyebrow / headline / subline / caption / CTA change, to test
// the leverage reframe without touching the look. No ?design → the normal hero,
// so real visitors are unaffected. Leverage % is illustrative for previewing.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const CREAM = '#FEF7E7'
const PAPER = '#FFFDFA'
const FULVOUS = '#E48715'
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")"

function BlockCTA({ href, label, placement, submissionId }: { href: string; label: string; placement: string; submissionId?: string }) {
  return (
    <CheckoutLink href={href} placement={placement} submissionId={submissionId} className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]" style={{ textDecoration: 'none' }}>
      <span className="inline-flex items-center justify-center" style={{ backgroundColor: INK, color: CREAM, fontWeight: 600, fontSize: 16, height: 54, padding: '0 26px' }}>{label}</span>
      <span className="inline-flex items-center justify-center" style={{ backgroundColor: FULVOUS, color: RICH, width: 54, height: 54, borderLeft: `2px solid ${RICH}`, fontWeight: 600, fontSize: 16 }} aria-hidden>↗</span>
    </CheckoutLink>
  )
}

export interface LabHeroProps {
  variant: string
  firstName: string
  score: number
  topPct: number
  leverage: number
  rungClassName: string
  stageKey?: string | null
  aheadPct: number
  checkoutUrl: string
  submissionId?: string
}

export function LabHero({ variant, firstName, score, topPct, leverage, rungClassName, stageKey, aheadPct, checkoutUrl, submissionId }: LabHeroProps) {
  const who = firstName ? `${firstName}, ` : ''
  const Who = firstName ? `${firstName}, you` : 'You'
  // Preview needle: sit mid-ladder so the rungs ahead (the climb) show. Real
  // data (via ?id=) uses the person's true stage/percentile.
  const gaugeStage = stageKey || 'S3_practitioner'
  const gaugeAhead = stageKey ? aheadPct : 72

  const V: Record<string, { eyebrow: string; headline: React.ReactNode; subline: React.ReactNode; caption: string; cta: string }> = {
    a: {
      eyebrow: 'Your AI leverage',
      headline: <>{Who}&rsquo;re capturing just <span style={{ color: FULVOUS }}>{leverage}%</span> of what AI could do for you</>,
      subline: <>You use AI all the time, but it&rsquo;s barely working <em>for</em> you. The rungs above are closer than they look.</>,
      caption: `Your climb: ${rungClassName} → Builder. The library is how you get there.`,
      cta: 'show me the climb',
    },
    b: {
      eyebrow: 'Your quiz results',
      headline: <>{Who}&rsquo;re in the top <span style={{ color: FULVOUS }}>{topPct}%</span> of AI adopters</>,
      subline: <>Genuinely ahead, share it below. But adoption isn&rsquo;t leverage: yours sits at <strong style={{ color: RICH, fontWeight: 700 }}>{leverage}/100</strong>. You use AI, it&rsquo;s not yet working for you.</>,
      caption: 'Your next rung is ≈1 week away with the library.',
      cta: 'close the leverage gap',
    },
    c: {
      eyebrow: 'Your AI journey',
      headline: <>{Who}&rsquo;re <span style={{ color: FULVOUS }}>3 rungs</span> from the top</>,
      subline: <>You&rsquo;re a {rungClassName}. Power User and Builder are exactly what the library gets you, faster than you&rsquo;d think.</>,
      caption: 'Each rung ≈1 week with the library.',
      cta: 'start the climb',
    },
    d: {
      eyebrow: 'Your result',
      headline: <>{who}your 30-day plan to level up is <span style={{ color: FULVOUS }}>ready</span></>,
      subline: <>You&rsquo;re a {rungClassName} at <strong style={{ color: RICH, fontWeight: 700 }}>{leverage}/100</strong> leverage. The plan below, built from your answers, closes the gap.</>,
      caption: 'Your next rung is ≈1 week away with the library.',
      cta: 'get my plan',
    },
  }
  const c = V[variant]
  if (!c) return null

  return (
    <section style={{ backgroundColor: PAPER, backgroundImage: GRAIN }}>
      <div className="max-w-[880px] mx-auto px-6 sm:px-10 pt-12 sm:pt-16 pb-10 text-center">
        <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}>{c.eyebrow}</span>
        <h1 className="mt-4 font-bold" style={{ fontSize: 'clamp(34px, 5vw, 58px)', lineHeight: 1.0, letterSpacing: '-0.045em', color: RICH }}>
          {c.headline}
        </h1>
        <p className="mt-4 mx-auto max-w-[560px]" style={{ fontWeight: 300, fontSize: 18, lineHeight: 1.5, color: BODY }}>{c.subline}</p>
        <div className="mt-9">
          <StageGauge stageKey={gaugeStage} aheadPct={gaugeAhead} />
        </div>
        <p className="mt-2" style={{ fontSize: 14.5, color: BODY, fontWeight: 300 }}>{c.caption}</p>
        <div className="mt-7 flex justify-center">
          <BlockCTA href={checkoutUrl} label={c.cta} placement={`v2_lab_${variant}_hero`} submissionId={submissionId} />
        </div>
      </div>
    </section>
  )
}
