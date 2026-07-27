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

// Brand marks drawn inline (no external requests, no CSP issues, crisp at any
// size). Proportions and colours follow each brand's published mark.
function Mark({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center justify-center"
      style={{ height: 32, width: 48, border: '1.5px solid #D8D2C6', background: '#FFFFFF', flexShrink: 0 }}
    >
      {children}
    </span>
  )
}

const ApplePay = () => (
  <svg width="38" height="16" viewBox="0 0 40 17" aria-label="Apple Pay">
    <path fill="#000" d="M7.3 2.6c.45-.56.75-1.31.67-2.08-.65.03-1.44.43-1.9.99-.42.48-.78 1.26-.68 2 .72.06 1.46-.36 1.91-.91zm.66 1.05c-1.05-.06-1.95.6-2.45.6-.51 0-1.28-.57-2.11-.55-1.08.02-2.09.63-2.64 1.6-1.13 1.96-.29 4.86.81 6.45.54.79 1.18 1.67 2.02 1.64.81-.03 1.12-.52 2.1-.52.98 0 1.26.52 2.11.51.88-.02 1.43-.8 1.97-1.59.62-.91.87-1.79.89-1.83-.02-.01-1.71-.66-1.73-2.6-.02-1.62 1.32-2.4 1.38-2.44-.75-1.11-1.93-1.24-2.35-1.27z" />
    <text x="13.5" y="13.4" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="12.5" fontWeight="600" fill="#000">Pay</text>
  </svg>
)

// Official mark, served from /public/pay (the only one whose canonical SVG we
// could obtain). The rest below are faithful reconstructions.
const GooglePay = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src="/pay/googlepay.svg" alt="Google Pay" style={{ width: 40, height: 15, display: 'block' }} />
)

const Visa = () => (
  <svg width="40" height="14" viewBox="0 0 48 16" aria-label="Visa">
    <text x="24" y="13" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="13.5" fontStyle="italic" fontWeight="700" fill="#1434CB" letterSpacing="0.5">VISA</text>
  </svg>
)

const Mastercard = () => (
  <svg width="36" height="22" viewBox="0 0 40 24" aria-label="Mastercard">
    <circle cx="15" cy="12" r="9" fill="#EB001B" />
    <circle cx="25" cy="12" r="9" fill="#F79E1B" />
    <path fill="#FF5F00" d="M20 5.1a8.98 8.98 0 0 0 0 13.8 8.98 8.98 0 0 0 0-13.8z" />
  </svg>
)

// PayPal: the double-P monogram plus the wordmark, which is the combination
// people actually recognise.
const PayPalMark = () => (
  <svg width="44" height="15" viewBox="0 0 56 18" aria-label="PayPal">
    <path fill="#009CDE" d="M6.2 1.4H2.4c-.26 0-.48.19-.52.44L.34 12.2c-.03.19.12.36.31.36h1.82c.26 0 .48-.19.52-.45l.42-2.66c.04-.25.26-.44.52-.44h1.2c2.5 0 3.95-1.21 4.33-3.62.17-1.05 0-1.88-.5-2.46C8.4 1.7 7.5 1.4 6.2 1.4zm.44 3.57c-.21 1.37-1.25 1.37-2.26 1.37h-.58l.4-2.55a.31.31 0 0 1 .31-.27h.27c.68 0 1.33 0 1.66.39.2.23.26.57.2 1.06z" />
    <path fill="#003087" d="M14.7 4.9h-1.83a.31.31 0 0 0-.31.27l-.08.51-.13-.19c-.4-.58-1.28-.77-2.17-.77-2.03 0-3.77 1.54-4.11 3.7-.18 1.08.07 2.11.68 2.83.56.66 1.36.94 2.31.94 1.64 0 2.55-1.05 2.55-1.05l-.08.5c-.03.2.12.37.31.37h1.65c.26 0 .48-.19.52-.45l.99-6.29a.31.31 0 0 0-.3-.37zm-2.55 3.58c-.18 1.05-1.02 1.76-2.08 1.76-.54 0-.97-.17-1.24-.5-.27-.32-.37-.79-.28-1.3.17-1.04 1.02-1.77 2.07-1.77.52 0 .95.17 1.23.51.28.34.39.8.3 1.3z" />
    <path fill="#009CDE" d="M24.5 4.9h-1.84a.52.52 0 0 0-.43.23l-2.54 3.74-1.08-3.6a.52.52 0 0 0-.5-.37h-1.81a.31.31 0 0 0-.3.41l2.03 5.95-1.9 2.7c-.15.2 0 .49.25.49h1.84c.17 0 .33-.08.42-.22l6.12-8.84c.14-.21 0-.49-.26-.49z" />
    <path fill="#003087" d="M30.6 1.4h-3.8c-.26 0-.48.19-.52.44l-1.54 9.76c-.03.19.12.36.31.36h1.95c.18 0 .34-.13.36-.31l.44-2.8c.04-.25.26-.44.52-.44h1.2c2.5 0 3.95-1.21 4.33-3.62.17-1.05 0-1.88-.5-2.46-.55-.63-1.45-.93-2.75-.93zm.44 3.57c-.21 1.37-1.25 1.37-2.26 1.37h-.58l.4-2.55a.31.31 0 0 1 .31-.27h.27c.68 0 1.33 0 1.66.39.2.23.26.57.2 1.06z" />
    <path fill="#003087" d="M39.1 4.9h-1.83a.31.31 0 0 0-.31.27l-.08.51-.13-.19c-.4-.58-1.28-.77-2.17-.77-2.03 0-3.77 1.54-4.11 3.7-.18 1.08.07 2.11.68 2.83.56.66 1.36.94 2.31.94 1.64 0 2.55-1.05 2.55-1.05l-.08.5c-.03.2.12.37.31.37h1.65c.26 0 .48-.19.52-.45l.99-6.29a.31.31 0 0 0-.3-.37zm-2.55 3.58c-.18 1.05-1.02 1.76-2.08 1.76-.54 0-.97-.17-1.24-.5-.27-.32-.37-.79-.28-1.3.17-1.04 1.02-1.77 2.07-1.77.52 0 .95.17 1.23.51.28.34.39.8.3 1.3z" />
    <path fill="#003087" d="M41.3 1.67l-1.57 9.93c-.03.19.12.36.31.36h1.58c.26 0 .48-.19.52-.45l1.55-9.76a.31.31 0 0 0-.31-.36h-1.77a.31.31 0 0 0-.31.28z" />
  </svg>
)

const LinkMark = () => (
  <svg width="40" height="15" viewBox="0 0 44 16" aria-label="Link">
    <rect x="0" y="1" width="44" height="14" rx="7" fill="#00D66F" />
    <text x="22" y="11.6" textAnchor="middle" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="9.5" fontWeight="800" fill="#011E0F" letterSpacing="0.3">link</text>
  </svg>
)

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
        <Mark title="Apple Pay"><ApplePay /></Mark>
        <Mark title="Google Pay"><GooglePay /></Mark>
        <Mark title="Visa"><Visa /></Mark>
        <Mark title="Mastercard"><Mastercard /></Mark>
        <Mark title="PayPal"><PayPalMark /></Mark>
        <Mark title="Link one-click checkout"><LinkMark /></Mark>
      </a>
      <span style={{ fontSize: 10.5, color: MUTE, textAlign: 'center' }}>
        One tap with Apple Pay or Google Pay &middot; no card typing
      </span>
    </div>
  )
}
