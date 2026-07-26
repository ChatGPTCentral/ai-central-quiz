'use client'

import { useEffect, useRef } from 'react'
import { sendEvent } from '@/lib/events-client'

// The one unlocked step in the study plan. Opens the real tutorial in a new tab
// (so the result page stays behind it — we never navigate a buyer away), and
// records that they actually took the free level. Separate event from
// checkout_click so the conversion metric stays clean.

export default function FreeStepLink({
  href, submissionId, qf, children, className, style,
}: {
  href: string; submissionId?: string; qf: string
  children: React.ReactNode; className?: string; style?: React.CSSProperties
}) {
  const seen = useRef(false)
  useEffect(() => {
    if (seen.current) return
    seen.current = true
    sendEvent('free_win_view', { props: { variant: 'stepper', qf }, submissionId })
  }, [qf, submissionId])

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      onClick={() => sendEvent('free_step_open', { props: { qf }, submissionId })}
    >
      {children}
    </a>
  )
}
