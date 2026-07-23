'use client'

import { useEffect, useRef } from 'react'
import { sendEvent } from '@/lib/events-client'
import { useCheckout } from '@/components/checkout-context'

/**
 * A checkout CTA anchor that fires a first-party `checkout_click` event
 * (with its page placement) as the visitor leaves for Stripe, and a
 * `placement_view` event the first time the placement scrolls into view
 * (≥40% visible). Views dedupe once per placement per session, so the
 * funnel can report a true view→click rate per placement instead of
 * guessing whether "zero clicks" meant bad copy or never-seen.
 *
 * Normally a plain <a>: no preventDefault, no await — navigation is untouched
 * and sendBeacon survives the unload. With JS off it degrades to a working
 * link. Styling is pure passthrough so server components can wrap their
 * existing markup without visual change.
 *
 * Inside CheckoutModalProvider(mode='embedded') it instead intercepts the
 * click (preventDefault) and opens the on-page checkout modal, still firing
 * the same `checkout_click` first so the funnel step is identical across arms.
 * Without a provider (the default) the mode is 'link' and nothing changes.
 */

// In-memory fallback when sessionStorage is blocked (private mode etc.).
const seenPlacements = new Set<string>()

function markSeen(placement: string): boolean {
  const key = `ac_pv_${placement}`
  try {
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
    return true
  } catch {
    if (seenPlacements.has(key)) return false
    seenPlacements.add(key)
    return true
  }
}

/** Session-deduped placement impression, for client components whose CTA
 *  isn't a CheckoutLink (e.g. the always-visible offer bar). */
export function firePlacementView(placement: string, submissionId?: string): void {
  if (markSeen(placement)) {
    sendEvent('placement_view', { props: { placement }, submissionId })
  }
}

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
  const anchorRef = useRef<HTMLAnchorElement>(null)
  const { mode, open } = useCheckout()

  useEffect(() => {
    const el = anchorRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          obs.disconnect()
          if (markSeen(placement)) {
            sendEvent('placement_view', { props: { placement }, submissionId })
          }
          return
        }
      },
      { threshold: 0.4 },
    )
    obs.observe(el)
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement])

  return (
    <a
      ref={anchorRef}
      href={href}
      className={className}
      style={style}
      aria-label={ariaLabel}
      target={target}
      rel={rel}
      onClick={e => {
        sendEvent('checkout_click', { props: { placement }, submissionId })
        if (mode === 'embedded') { e.preventDefault(); open() }
      }}
    >
      {children}
    </a>
  )
}
