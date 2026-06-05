'use client'

import { useState, useEffect } from 'react'

const DURATION_SECONDS = 15 * 60 // matches CountdownTimer
const KEY = 'ac_quiz_offer_start'

/** Compact MM:SS countdown reading the same sessionStorage key as
 *  CountdownTimer, so the sticky bar and any inline placements stay in
 *  lockstep. Renders nothing until mounted (avoids hydration mismatch). */
export default function InlineCountdown({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem(KEY)
    const startedAt = stored ? parseInt(stored, 10) : Date.now()
    if (!stored) sessionStorage.setItem(KEY, String(startedAt))

    const calc = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      return Math.max(0, DURATION_SECONDS - elapsed)
    }

    setSecondsLeft(calc())
    const interval = setInterval(() => setSecondsLeft(calc()), 1000)
    return () => clearInterval(interval)
  }, [])

  if (secondsLeft === null) return null

  const mins = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const secs = (secondsLeft % 60).toString().padStart(2, '0')
  if (secondsLeft === 0) return <span className={className} style={style}>offer expired</span>

  return (
    <span className={className} style={style}>
      ends in <strong className="tabular-nums">{mins}:{secs}</strong>
    </span>
  )
}
