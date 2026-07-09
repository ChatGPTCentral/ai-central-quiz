'use client'

import { sendEvent } from '@/lib/events-client'

/** Generic outbound link that beacons a first-party event on click.
 *  Styling passthrough; navigation is never blocked. */
export default function TrackedLink({
  href,
  event,
  props,
  className,
  style,
  target,
  rel,
  ariaLabel,
  children,
}: {
  href: string
  event: string
  props?: Record<string, unknown>
  className?: string
  style?: React.CSSProperties
  target?: string
  rel?: string
  ariaLabel?: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      className={className}
      style={style}
      target={target}
      rel={rel}
      aria-label={ariaLabel}
      onClick={() => sendEvent(event, { props })}
    >
      {children}
    </a>
  )
}
