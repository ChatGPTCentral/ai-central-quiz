'use client'

import { useEffect, useState } from 'react'
import { sendEvent } from '@/lib/events-client'
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

  // wallet lands in props so the funnel can show which door people choose.
  const go = (wallet: string) => (e: React.MouseEvent) => {
    sendEvent('checkout_click', { props: { placement, wallet }, submissionId })
    if (mode === 'embedded') { e.preventDefault(); open() }
  }

  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: 46, flex: '1 1 150px', minWidth: 140, maxWidth: 230,
    border: `2px solid ${INK}`, textDecoration: 'none', cursor: 'pointer',
  }

  return (
    <div className="flex flex-col items-center w-full" style={{ gap: 8 }}>
      <div className="flex flex-wrap items-center justify-center w-full" style={{ gap: 8, maxWidth: 470 }}>
        {canApplePay && (
          <a
            href={fallbackUrl}
            onClick={go('apple_pay')}
            aria-label="Pay with Apple Pay"
            className="transition-transform hover:-translate-y-px active:scale-[0.98]"
            style={{ ...btn, background: '#FFFFFF', border: 'none', overflow: 'hidden' }}
          >
            {/* The official mark already IS a bordered pill, so it gets no
                button chrome of its own — otherwise it renders as a button
                inside a button. Scaled up to fill the same height as PayPal. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pay/applepay.svg" alt="Apple Pay" height={46} style={{ display: 'block', height: 46, width: 'auto' }} />
          </a>
        )}

        <a
          href={fallbackUrl}
          onClick={go('paypal')}
          aria-label="Pay with PayPal"
          className="transition-transform hover:-translate-y-px active:scale-[0.98]"
          style={{ ...btn, background: PAYPAL_YELLOW }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pay/paypal.png" alt="PayPal" width={72} height={20} style={{ display: 'block' }} />
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
