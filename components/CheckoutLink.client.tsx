'use client'

import { sendEvent } from '@/lib/events-client'

/**
 * A checkout CTA anchor that fires a first-party `checkout_click` event
 * (with its page placement) as the visitor leaves for Stripe.
 *
 * Deliberately a plain <a>: no preventDefault, no await — navigation is
 * untouched and sendBeacon survives the unload. With JS off it degrades to
 * a working link. Styling is pure passthrough so server components can wrap
 * their existing markup without visual change.
 */
export default function CheckoutLink({
  href,
  placement,
  submissionId,
  className,
  style,
  ariaLabel,
  target,
  rel,
  children,
}: {
  href: string
  placement: string
  submissionId?: string
  className?: string
  style?: React.CSSProperties
  ariaLabel?: string
  target?: string
  rel?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className={className}
      style={style}
      aria-label={ariaLabel}
      target={target}
      rel={rel}
      onClick={() => sendEvent('checkout_click', { props: { placement }, submissionId })}
    >
      {children}
    </a>
  )
}
