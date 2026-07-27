'use client'

import { sendEvent } from '@/lib/events-client'
import { useCheckout } from '@/components/checkout-context'

// Payment marks under the CTA. Two jobs: trust ("this is a normal, safe
// checkout") and speed ("I can pay with a thumbprint, not a card number").
// Now that Apple Pay / Google Pay / Link are actually live on the embedded
// form, showing them is honest and it is the impulse-buy cue.
//
// Clickable: tapping a mark opens the same checkout modal the CTA opens (we
// cannot preselect a wallet — Stripe decides what a given device supports —
// so every mark is simply another door into the same form). In link mode they
// fall back to the payment URL, so they are never dead.

const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#8C8578'

// The real, official marks, served from /public/pay: Apple Pay and Google Pay
// as vendor SVGs, Visa / Mastercard / PayPal as the official logos downscaled
// for the web (3840px originals → ~130px, 314KB → 21KB total). Recognition is
// the whole job here, so approximations were worse than useless.
function Mark({ src, alt, w, h }: { src: string; alt: string; w: number; h: number }) {
  return (
    <span
      title={alt}
      className="inline-flex items-center justify-center"
      style={{ height: 34, width: 52, border: '1.5px solid #D8D2C6', background: '#FFFFFF', flexShrink: 0 }}
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

  const onActivate = (e: React.MouseEvent) => {
    sendEvent('checkout_click', { props: { placement }, submissionId })
    if (mode === 'embedded') { e.preventDefault(); open() }
  }

  return (
    <div className="flex flex-col items-center" style={{ gap: 7 }}>
      <a
        href={fallbackUrl}
        onClick={onActivate}
        aria-label="Pay with Apple Pay, Google Pay, card, PayPal or Link"
        className="flex flex-wrap items-center justify-center transition-transform hover:-translate-y-px active:scale-[0.98]"
        style={{ gap: 6, textDecoration: 'none', cursor: 'pointer' }}
      >
        <Mark src="/pay/applepay.svg"   alt="Apple Pay"  w={44} h={19} />
        <Mark src="/pay/googlepay.svg"  alt="Google Pay" w={42} h={16} />
        <Mark src="/pay/visa.png"       alt="Visa"       w={38} h={13} />
        <Mark src="/pay/mastercard.png" alt="Mastercard" w={30} h={24} />
        <Mark src="/pay/paypal.png"     alt="PayPal"     w={42} h={12} />
      </a>
      <span style={{ fontSize: 10.5, color: MUTE, textAlign: 'center' }}>
        One tap with Apple Pay or Google Pay &middot; no card typing
      </span>
    </div>
  )
}
