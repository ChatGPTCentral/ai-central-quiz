'use client'

import { useEffect, useRef, useState } from 'react'
import { sendEvent } from '@/lib/events-client'
import { firePlacementView } from '@/components/CheckoutLink.client'
import { useCheckout } from '@/components/checkout-context'

// Express-pay row under the CTA. Two jobs: trust ("this is a normal, safe
// checkout") and speed ("I can pay with a thumbprint, not a card number").
//
// The wallets are full-size BUTTONS rather than small logo chips, because the
// leak we are attacking is click → pay: people are persuaded enough to open the
// form and then two thirds never finish. A recognisable wallet button says
// "this is one tap" before they commit to opening anything.
//
// Honesty rules this component follows, because faking a wallet button is both
// against the brands' guidelines and a bad experience:
//   - The Apple Pay button ONLY renders when the device can actually do Apple
//     Pay. Showing a black Apple Pay button to a Windows visitor and then
//     handing them a card form is a broken promise; better one honest button
//     than two pretty ones.
//   - Every button opens the SAME Stripe checkout, where the wallet is the top
//     option on a supported device. The line underneath says "opens secure
//     checkout" rather than implying the button charges instantly.
//   - Nothing here pretends to be a native Apple Pay sheet. True one-tap needs
//     Stripe's Express Checkout Element, which is a different integration.

const INK = '#333333'
const MUTE = '#8C8578'
const PAYPAL_YELLOW = '#FFC439'

/** Small card marks, the trust half of the row. */
function Mark({ src, alt, w, h }: { src: string; alt: string; w: number; h: number }) {
  return (
    <span
      title={alt}
      className="inline-flex items-center justify-center"
      style={{ height: 28, width: 44, border: '1.5px solid #D8D2C6', background: '#FFFFFF', flexShrink: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={w} height={h} style={{ display: 'block', objectFit: 'contain' }} />
    </span>
  )
}

export default function PayBadges({
  fallbackUrl, submissionId, placement,
}: {
  fallbackUrl: string; submissionId?: string; placement: string
}) {
  const { mode, open } = useCheckout()

  // Apple Pay capability, client-side only. Starts false so the server HTML and
  // the first client render agree; the button appears after hydration on the
  // devices that can actually use it.
  const [canApplePay, setCanApplePay] = useState(false)
  useEffect(() => {
    try {
      const w = window as unknown as { ApplePaySession?: { canMakePayments?: () => boolean } }
      if (typeof w.ApplePaySession?.canMakePayments === 'function') {
        setCanApplePay(!!w.ApplePaySession.canMakePayments())
      }
    } catch { /* unsupported browser — leave the button off */ }
  }, [])

  // THE IMPRESSION. This was missing, and it mattered more than it looks.
  //
  // PayBadges fired checkout_click but never placement_view, so
  // v2_offer_stack_badges showed 13 clickers, 9 buyers and ZERO views: the
  // best-converting button on the page, 69% of its clickers paying, and no way
  // to tell whether that was because it is brilliant or because only thirteen
  // people ever saw it. A click rate with no denominator cannot be compared
  // with anything, which is exactly how the loud low-converting buttons kept
  // winning the argument.
  //
  // Deduped per session by the same helper every other placement uses, so this
  // number is comparable to theirs by construction rather than by luck.
  const seen = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (seen.current) return
    const el = boxRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      // No observer (old browser, or rendered without a host element): count it
      // as seen rather than lose the impression. Undercounting views would
      // inflate this placement's conversion rate, which is the error that
      // matters here.
      seen.current = true
      firePlacementView(placement, submissionId)
      return
    }
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          obs.disconnect()
          if (!seen.current) { seen.current = true; firePlacementView(placement, submissionId) }
          return
        }
      },
      // Same 0.4 threshold as CheckoutLink: a placement counts as seen when
      // it is properly on screen, not when one pixel grazes the fold.
      { threshold: 0.4 },
    )
    obs.observe(el)
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement])

  // wallet lands in props so the funnel can show which door people choose.
  const go = (wallet: string) => (e: React.MouseEvent) => {
    sendEvent('checkout_click', { props: { placement, wallet }, submissionId })
    if (mode === 'embedded') { e.preventDefault(); open() }
  }

  // Each brand's OWN button, not ours. No ink border, no square corners, no
  // AI Central styling: the whole value of these is that people recognise them
  // instantly from a thousand other checkouts, and restyling them throws that
  // recognition away.
  // Identical box for both, guaranteed. Flex with a basis let each button size
  // to its own content, so the two brand marks — one a narrow glyph pair, one a
  // wide wordmark — came out different widths and read as misaligned. A grid
  // with equal columns and width:100% makes the boxes the same by construction;
  // only the mark inside differs, which is the point.
  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: 48, width: '100%',
    textDecoration: 'none', cursor: 'pointer', border: 'none', overflow: 'hidden',
  }

  return (
    <div ref={boxRef} className="flex flex-col items-center w-full" style={{ gap: 8 }}>
      <div
        style={{
          display: 'grid',
          // One wallet available means one full-width button, not a half-width
          // one floating beside a gap.
          gridTemplateColumns: canApplePay ? '1fr 1fr' : '1fr',
          gap: 10, width: '100%', maxWidth: 470,
        }}
      >
        {canApplePay && (
          <a
            href={fallbackUrl}
            onClick={go('apple_pay')}
            aria-label="Pay with Apple Pay"
            className="transition-transform hover:-translate-y-px active:scale-[0.98]"
            // The classic black Apple Pay pill.
            //
            // The supplied asset is the MARK, not the button: a white pill with
            // a black outline and black glyphs. applepay-logo.svg is the same
            // file with the artboard trimmed inward so the pill outline falls
            // outside the viewBox, leaving just the glyphs; invert(1) then makes
            // them white for the black button. Cropping in the viewBox rather
            // than with a CSS window means no hairline of the old border can
            // survive at any size.
            style={{ ...btn, background: '#000000', borderRadius: 8 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/pay/applepay-logo.svg"
              alt="Apple Pay"
              style={{ display: 'block', height: 26, width: 'auto', filter: 'invert(1)' }}
            />
          </a>
        )}

        <a
          href={fallbackUrl}
          onClick={go('paypal')}
          aria-label="Pay with PayPal"
          className="transition-transform hover:-translate-y-px active:scale-[0.98]"
          // PayPal gold, full pill, exactly as their own button ships.
          style={{ ...btn, background: PAYPAL_YELLOW, borderRadius: 999 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pay/paypal-mark.png" alt="PayPal" width={86} height={24} style={{ display: 'block' }} />
        </a>
      </div>

      {/* Trust marks: everything else the same form accepts. */}
      <a
        href={fallbackUrl}
        onClick={go('card')}
        aria-label="Pay by card"
        className="flex flex-wrap items-center justify-center transition-transform hover:-translate-y-px"
        style={{ gap: 6, textDecoration: 'none', cursor: 'pointer' }}
      >
        <Mark src="/pay/googlepay.svg"  alt="Google Pay" w={36} h={14} />
        <Mark src="/pay/visa.png"       alt="Visa"       w={32} h={11} />
        <Mark src="/pay/mastercard.png" alt="Mastercard" w={26} h={20} />
      </a>

      <span style={{ fontSize: 10.5, color: MUTE, textAlign: 'center' }}>
        Opens secure checkout &middot; {canApplePay ? 'Apple Pay is one tap, no card typing' : 'wallet, card or PayPal'}
      </span>
    </div>
  )
}
