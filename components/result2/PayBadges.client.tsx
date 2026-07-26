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

function Mark({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center justify-center"
      style={{
        height: 30, padding: '0 10px', border: `1.5px solid #D8D2C6`, background: '#FFFFFF',
        fontSize: 11, fontWeight: 800, color: RICH, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
      }}
    >
      {children}
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
        <Mark title="Apple Pay"><span style={{ fontSize: 13, marginRight: 3 }}>&#63743;</span>Pay</Mark>
        <Mark title="Google Pay"><span style={{ color: '#4285F4', marginRight: 1 }}>G</span>Pay</Mark>
        <Mark title="Pay by card">VISA</Mark>
        <Mark title="Pay by card">
          <span aria-hidden style={{ position: 'relative', display: 'inline-block', width: 20, height: 12 }}>
            <span style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 12, borderRadius: 999, background: '#EB001B' }} />
            <span style={{ position: 'absolute', right: 0, top: 0, width: 12, height: 12, borderRadius: 999, background: '#F79E1B', mixBlendMode: 'multiply' }} />
          </span>
        </Mark>
        <Mark title="PayPal"><span style={{ color: '#003087' }}>Pay</span><span style={{ color: '#009CDE' }}>Pal</span></Mark>
        <Mark title="Link one-click"><span style={{ color: '#00D66F' }}>&#9679;</span>&nbsp;Link</Mark>
      </a>
      <span style={{ fontSize: 10.5, color: MUTE, textAlign: 'center' }}>
        One tap with Apple Pay or Google Pay &middot; no card typing
      </span>
    </div>
  )
}
