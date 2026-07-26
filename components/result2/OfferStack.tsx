import CheckoutLink from '@/components/CheckoutLink.client'
import PayBadges from '@/components/result2/PayBadges.client'

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
}: {
  checkoutUrl: string
  submissionId?: string
  rungClassName: string
  ctaLabel: string
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
      <div className="flex flex-wrap items-baseline" style={{ gap: 10, padding: '16px 26px 4px' }}>
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', color: RICH, lineHeight: 1 }}>$4.99</span>
        <span style={{ fontSize: 14.5, color: BODY, fontWeight: 300 }}>for your first 4 weeks</span>
      </div>
      <p style={{ padding: '6px 26px 0', margin: 0, fontSize: 13, color: MUTE, lineHeight: 1.5 }}>
        That is <strong style={{ color: RICH, fontWeight: 700 }}>less than half a cent per tutorial</strong>. After 4 weeks it is
        $59.75/year, about $4.98 a month, and we email you before it renews.
      </p>

      {/* risk reversal — the objection is the renewal, so answer it at the button */}
      <div style={{ margin: '16px 26px 0', padding: '13px 15px', backgroundColor: CREAM, border: `2px solid ${INK}` }}>
        <div className="flex" style={{ gap: 10 }}>
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1.2 }}>🛡️</span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: RICH }}>You cannot really lose here</div>
            <div className="mt-1" style={{ fontSize: 12.5, color: BODY, fontWeight: 300, lineHeight: 1.5 }}>
              Cancel any time in your trial month and you pay nothing more, no email required, two clicks in your account.
              Plus a 30-day money-back guarantee: if it is not useful, one email and you get the $4.99 back.
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center" style={{ padding: '20px 26px 24px', gap: 10 }}>
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
        <PayBadges fallbackUrl={checkoutUrl} submissionId={submissionId} placement="v2_offer_stack_badges" />
      </div>
    </div>
  )
}
