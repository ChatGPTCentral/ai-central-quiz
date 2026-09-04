import CheckoutLink from '@/components/CheckoutLink.client'
import { TRIAL_OFFER, type Offer } from '@/lib/offers'

// The guarantee section. Its only job is to answer the last silent objection:
// "what if I pay and it turns out to be junk, or I forget and get billed?"
// The offer card already carries a one-paragraph version at the button; this is
// the full-width, slow-down-and-read version at the bottom of the page, where
// the undecided actually are.
//
// Every promise here is one we really keep (trial cancels in-account, 30-day
// refund by email, Stripe holds the card details, never us). Nothing here is a
// badge we have not earned: no press logos, no fake certifications.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const PAPER = '#FBF6EC'

const TRIAL_PROMISES = [
  {
    t: 'Cancel in two clicks',
    d: 'Change your mind during the trial month and you are never billed again. It is a link in your account, not an email to us.',
  },
  {
    t: '30 days, money back',
    d: 'If the library is not useful to you, reply to any of our emails inside 30 days and we return the PRICE_TOKEN. No form, no reason needed.',
  },
  {
    t: 'Full access from minute one',
    d: 'Nothing is held back during the trial month. You judge the real library, all 1,200+ tutorials, not a sample of it.',
  },
]

/** The lifetime version. The trial's reassurances are all about the renewal,
 *  which is the thing this offer removes, so promising "cancel any time"
 *  beside "no subscription" would read as boilerplate nobody wrote. */
const LIFETIME_PROMISES = [
  {
    t: 'Nothing to cancel',
    d: 'This is one payment, not a subscription. No renewal date, no reminder email, nothing sitting on your card.',
  },
  {
    t: '30 days, money back',
    d: 'If the library is not useful to you, reply to any of our emails inside 30 days and we return the $49.75 in full. No form, no reason needed.',
  },
  {
    t: 'Yours, including what comes next',
    d: 'All 1,200+ tutorials from minute one, and every one we add afterwards. Buying today does not freeze you on today\'s library.',
  },
]

/** Solid shield, drawn rather than emoji so it holds at 64px on every OS. */
function Shield() {
  return (
    <svg width="60" height="70" viewBox="0 0 60 70" aria-hidden focusable="false" style={{ display: 'block' }}>
      <path
        d="M30 2 L56 12 V33 C56 50 44 62 30 68 C16 62 4 50 4 33 V12 Z"
        fill={FULVOUS}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M18 34 L26.5 43 L43 25" fill="none" stroke={RICH} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function RiskFree({
  checkoutUrl,
  submissionId,
  ctaLabel,
  offer = TRIAL_OFFER,
}: {
  checkoutUrl: string
  submissionId?: string
  ctaLabel: string
  offer?: Offer
}) {
  // The refund line names the price this visitor actually pays: with the
  // founding window enabled that can be the list price, and a guarantee that
  // names the wrong amount is worse than no guarantee.
  const PROMISES = (offer.oneTime ? LIFETIME_PROMISES : TRIAL_PROMISES).map(pr => ({
    ...pr,
    d: pr.d.replace('PRICE_TOKEN', offer.price),
  }))
  return (
    <section
      style={{ borderTop: `3px solid ${INK}`, backgroundColor: PAPER }}
      aria-label="Risk-free guarantee"
    >
      <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
        <div className="flex flex-col items-center text-center">
          <Shield />
          <span
            className="inline-block mt-4 font-mono uppercase"
            style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}
          >
            Risk-free guarantee
          </span>
          <h2
            className="mt-3 font-bold"
            style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}
          >
            30 days to change your mind
          </h2>
          <p className="mt-3 max-w-[580px]" style={{ fontWeight: 300, fontSize: 16.5, lineHeight: 1.5, color: BODY }}>
            Here is exactly what happens after you join, in plain words, so nothing about this
            can catch you out later.
          </p>
        </div>

        <div className="grid mt-9" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {PROMISES.map(p => (
            <div key={p.t} style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', padding: '15px 17px 16px' }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: RICH, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                {p.t}
              </div>
              <div className="mt-1.5" style={{ fontSize: 13, color: BODY, fontWeight: 300, lineHeight: 1.5 }}>
                {p.d}
              </div>
            </div>
          ))}
        </div>

        {/* Trusted-by band. The number is the real member count, not a badge
            wall: we would rather say one true thing than five borrowed ones. */}
        <div
          className="mt-9 flex flex-col items-center text-center"
          style={{ border: `3px solid ${INK}`, backgroundColor: CREAM, padding: '20px 22px 24px' }}
        >
          <span
            className="font-mono uppercase"
            style={{ fontSize: 10.5, letterSpacing: '0.18em', color: MUTE, fontWeight: 700 }}
          >
            Trusted by professionals
          </span>
          <p className="mt-2 max-w-[560px]" style={{ fontSize: 17, lineHeight: 1.4, color: RICH, fontWeight: 500 }}>
            2,500+ members use the library to do their actual work: consultants, marketers, founders,
            operators, teachers. Not developers, and not people who had time to figure this out alone.
          </p>
          {/* w-full matters: inside a centred flex column this wrapper would
              otherwise shrink to its widest child (the CTA, ~250px), and the
              wallet row would wrap Apple Pay and PayPal onto separate lines
              while the same component sits side by side everywhere else. */}
          <div className="mt-6 flex flex-col items-center w-full" style={{ gap: 10 }}>
            <CheckoutLink
              href={checkoutUrl}
              placement="v2_risk_free"
              submissionId={submissionId}
              className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]"
              style={{ textDecoration: 'none' }}
            >
              <span
                className="inline-flex items-center justify-center"
                style={{ backgroundColor: INK, color: CREAM, fontWeight: 700, fontSize: 17, height: 56, padding: '0 26px' }}
              >
                {ctaLabel}
              </span>
              <span
                className="inline-flex items-center justify-center"
                style={{ backgroundColor: FULVOUS, color: RICH, width: 56, height: 56, borderLeft: `2px solid ${RICH}`, fontWeight: 700, fontSize: 17 }}
                aria-hidden
              >
                ↗
              </span>
            </CheckoutLink>
            {/* Pay-badge row cut 2026-09-04: 1 click from 202 people who saw
                it, 0.5%, the weakest thing on the result page. The RiskFree
                button it sat under converts 3.5% on the same window. */}
          </div>
        </div>
      </div>
    </section>
  )
}
