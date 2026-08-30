import CheckoutLink from '@/components/CheckoutLink.client'
import PayBadges from '@/components/result2/PayBadges.client'
import { TRIAL_OFFER, type Offer } from '@/lib/offers'

// The offer stack. The old card said "get everything, $4.99" — no itemisation,
// no anchor, no risk reversal, no reason to act today. People do not buy a
// price, they buy a pile of value that makes the price look silly.
//
// Every claim here is either literally true of the product or plain arithmetic
// (1,200 tutorials ÷ $4.99). Nothing invented, because an inflated stack reads
// as a scam to exactly the professional audience we are selling to.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const GREEN = '#2D6A26'

export function OfferStack({
  checkoutUrl,
  submissionId,
  rungClassName,
  ctaLabel,
  expressPay,
  offer = TRIAL_OFFER,
  lead = 'classic',
  guarantee = 'block',
  windowNote = null,
}: {
  checkoutUrl: string
  submissionId?: string
  rungClassName: string
  ctaLabel: string
  /** What we are actually selling this visitor. Defaults to the trial so every
   *  other caller is unchanged. */
  offer?: Offer
  /** Optional one-tap wallet element, injected by the page so this stays a
   *  server component. Null when the flag is off or no wallet is available. */
  expressPay?: React.ReactNode
  /** result_page_v3 'research' arm (research play #5): 'duration' leads with
   *  the 4 weeks — the trial length beats 46% of the market's sub-4-day
   *  trials (RevenueCat, 115k apps) and we never said so — plus ONE checkable
   *  anchor. 'classic' is today's price-led block, byte-identical. */
  lead?: 'classic' | 'duration'
  /** research play #7: 'oneline' compresses the risk-reversal box to a single
   *  falsifiable promise at the button — risk reversal works at the moment of
   *  fear, not as ambient chrome. 'block' is today's shield box, unchanged.
   *  The promise is real: reply-to-cancel is how support actually works. */
  guarantee?: 'block' | 'oneline'
  /** The founding window's one TRUE urgency line ("Your founding rate: $4.99
   *  for the next N hours"), server-computed from the person's own deadline
   *  and enforced by both checkout routes. Null renders nothing. */
  windowNote?: string | null
}) {
  const items = [
    { t: 'Your 30-day plan, unlocked', d: `Weeks 2, 3 and 4 of the plan built for a ${rungClassName.toLowerCase()}, opened tonight.` },
    { t: '1,200+ step-by-step tutorials', d: 'Plain language, a screenshot at every step, nothing assumes you can code.' },
    { t: '50+ templates and prompt packs', d: 'Copy, paste, done. Built for real work, not demos.' },
    { t: 'New tutorials every week', d: 'The tools change monthly. The library keeps up so you do not have to.' },
    { t: 'Your member pass', d: 'The verified card you can post, yours the moment you join.' },
  ]

  return (
    <div className="mt-8" style={{ border: `3px solid ${INK}`, backgroundColor: '#FFFFFF' }}>
      {/* what you get */}
      <div style={{ padding: '22px 26px 6px' }}>
        <span className="inline-block font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: '0.18em', color: FULVOUS, fontWeight: 700 }}>
          Everything you get
        </span>
        <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
          {items.map(i => (
            <li key={i.t} className="flex" style={{ gap: 11, padding: '9px 0', borderBottom: '1px solid #F1ECE2' }}>
              <span aria-hidden style={{ color: GREEN, fontWeight: 800, fontSize: 15, lineHeight: 1.35, flexShrink: 0 }}>✓</span>
              <span className="min-w-0">
                <span className="block" style={{ fontSize: 14.5, fontWeight: 700, color: RICH, lineHeight: 1.3 }}>{i.t}</span>
                <span className="block mt-0.5" style={{ fontSize: 12.5, color: BODY, fontWeight: 300, lineHeight: 1.45 }}>{i.d}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* the price, anchored by arithmetic rather than a made-up RRP */}
      {lead === 'duration' && !offer.oneTime ? (
        <>
          <div style={{ padding: '16px 26px 0' }}>
            <span className="block" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: RICH, lineHeight: 1.15 }}>
              4 full weeks of everything — {offer.price}
            </span>
            <span className="block mt-1" style={{ fontSize: 14, color: BODY, fontWeight: 300 }}>
              Most trials give you 7 days. You get 28 — long enough to actually change how you work.
            </span>
          </div>
          <p style={{ padding: '8px 26px 0', margin: 0, fontSize: 13, color: MUTE, lineHeight: 1.5 }}>
            The 4-week track alone matches what a $49 course covers elsewhere, and it comes with the other 1,200
            tutorials attached. After your 4 weeks it is $59.75/year, about $4.98 a month, and we email you before it
            renews.
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline" style={{ gap: 10, padding: '16px 26px 4px' }}>
            <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', color: RICH, lineHeight: 1 }}>{offer.price}</span>
            <span style={{ fontSize: 14.5, color: BODY, fontWeight: 300 }}>{offer.oneTime ? 'once, and it is yours' : 'for your first 4 weeks'}</span>
          </div>
          <p style={{ padding: '6px 26px 0', margin: 0, fontSize: 13, color: MUTE, lineHeight: 1.5 }}>
            {offer.oneTime ? (
              <>That is <strong style={{ color: RICH, fontWeight: 700 }}>about four cents per tutorial</strong>, paid once.
              No renewal, no yearly charge, nothing to cancel. The library is yours and every update lands in it.</>
            ) : (
              <>That is <strong style={{ color: RICH, fontWeight: 700 }}>less than half a cent per tutorial</strong>. After 4 weeks it is
              $59.75/year, about $4.98 a month, and we email you before it renews.</>
            )}
          </p>
        </>
      )}

      {windowNote && (
        <p style={{ padding: '10px 26px 0', margin: 0, fontSize: 13, color: FULVOUS, fontWeight: 700 }}>
          {windowNote}
        </p>
      )}

      {/* risk reversal — the objection is the renewal, so answer it at the button */}
      {guarantee === 'block' && (
        <div style={{ margin: '16px 26px 0', padding: '13px 15px', backgroundColor: CREAM, border: `2px solid ${INK}` }}>
          <div className="flex" style={{ gap: 10 }}>
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1.2 }}>🛡️</span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: RICH }}>{offer.oneTime ? 'Nothing to cancel' : 'Covered both ways'}</div>
              <div className="mt-1" style={{ fontSize: 12.5, color: BODY, fontWeight: 300, lineHeight: 1.5 }}>
                {offer.oneTime
                  ? 'There is no subscription here, so there is nothing to remember and nothing to cancel. '
                  : 'Cancel any time in your trial month and you pay nothing more, no email required, two clicks in your account. Plus a 30-day money-back guarantee: '}
                {offer.guarantee}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center" style={{ padding: '20px 26px 24px', gap: 10 }}>
        {/* One-tap wallets, above the button. Renders nothing at all unless the
            device has a wallet AND the flag is on, so the button below is
            always the guaranteed path. */}
        {expressPay}
        {/* PayBadges moved ABOVE the main CTA (owner, 2026-08-30: promote the
            badges). It used to sit after the button and the guarantee text,
            which meant most people who clicked the button above it never
            scrolled far enough to trigger its own view event — this exact
            placement (v2_offer_stack_badges) converts 81.8% of the people who
            DO click it, the best rate on the page, but had only 494 views
            against v2_study_plan's 1,847 (buyer_placement_quality, refreshed
            2026-08-30). A trust signal that arrives after the decision is
            already made cannot influence it; this one now can. */}
        <PayBadges fallbackUrl={checkoutUrl} submissionId={submissionId} placement="v2_offer_stack_badges" />
        <CheckoutLink
          href={checkoutUrl}
          placement="v2_offer_stack"
          submissionId={submissionId}
          className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]"
          style={{ textDecoration: 'none' }}
        >
          <span className="inline-flex items-center justify-center" style={{ backgroundColor: INK, color: CREAM, fontWeight: 700, fontSize: 17, height: 56, padding: '0 26px' }}>{ctaLabel}</span>
          <span className="inline-flex items-center justify-center" style={{ backgroundColor: FULVOUS, color: RICH, width: 56, height: 56, borderLeft: `2px solid ${RICH}`, fontWeight: 700, fontSize: 17 }} aria-hidden>↗</span>
        </CheckoutLink>
        {guarantee === 'oneline' && !offer.oneTime && (
          <p style={{ margin: 0, fontSize: 12.5, color: BODY, fontWeight: 500, textAlign: 'center', maxWidth: 420 }}>
            Not useful? Reply to any of our emails within your 4 weeks and we refund the {offer.price}. No forms, no questions.
          </p>
        )}
      </div>
    </div>
  )
}
