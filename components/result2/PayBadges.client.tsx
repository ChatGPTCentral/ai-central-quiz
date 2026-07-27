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

const GooglePay = () => (
  <svg width="40" height="17" viewBox="0 0 44 18" aria-label="Google Pay">
    <path fill="#4285F4" d="M8.6 9.1v3.4H7.5V4.1h2.9c.72 0 1.34.24 1.84.72.51.48.77 1.07.77 1.76 0 .71-.26 1.3-.77 1.78-.5.48-1.11.72-1.84.72H8.6zm0-3.94v2.87h1.83c.43 0 .78-.14 1.07-.43.29-.29.43-.63.43-1 0-.37-.14-.71-.43-1-.29-.3-.64-.44-1.07-.44H8.6z" />
    <path fill="#EA4335" d="M15.6 6.54c.79 0 1.41.21 1.87.63.46.42.69 1 .69 1.73v3.6h-1.02v-.79h-.05c-.44.65-1.03.98-1.76.98-.63 0-1.15-.19-1.57-.56-.42-.37-.63-.83-.63-1.39 0-.59.22-1.06.66-1.4.44-.35 1.03-.52 1.77-.52.63 0 1.15.11 1.56.34v-.24c0-.37-.15-.68-.44-.94-.29-.26-.63-.38-1.02-.38-.59 0-1.06.25-1.4.75l-.94-.59c.51-.75 1.27-1.12 2.28-1.12zm-1.38 4.13c0 .28.12.51.35.7.24.18.51.28.83.28.45 0 .85-.17 1.2-.5.35-.34.53-.73.53-1.18-.34-.27-.81-.4-1.41-.4-.44 0-.81.1-1.1.32-.27.21-.4.47-.4.78z" />
    <path fill="#FBBC04" d="M24 6.73l-3.6 8.28h-1.12l1.34-2.9-2.37-5.38h1.2l1.71 4.13h.02l1.66-4.13H24z" />
    <text x="26" y="12.9" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="11.5" fontWeight="600" fill="#5F6368">Pay</text>
  </svg>
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

const PayPalMark = () => (
  <svg width="42" height="14" viewBox="0 0 50 16" aria-label="PayPal">
    <text x="0" y="12.5" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="12.5" fontWeight="800" fontStyle="italic" fill="#003087">Pay</text>
    <text x="23" y="12.5" fontFamily="-apple-system, Helvetica, Arial, sans-serif" fontSize="12.5" fontWeight="800" fontStyle="italic" fill="#009CDE">Pal</text>
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
