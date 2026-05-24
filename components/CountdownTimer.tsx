'use client'

import { useState, useEffect } from 'react'

const DURATION_SECONDS = 15 * 60 // 15 minutes

export default function CountdownTimer({ paymentUrl }: { paymentUrl: string }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    const key = 'ac_quiz_offer_start'
    const stored = sessionStorage.getItem(key)
    const startedAt = stored ? parseInt(stored, 10) : Date.now()
    if (!stored) sessionStorage.setItem(key, String(startedAt))

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
  const expired = secondsLeft === 0

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-jet-black text-baby-powder flex items-center justify-between px-4 py-2.5 text-sm">
      <span className="font-medium">
        {expired ? 'Offer expired' : (
          <>Special offer expires: <strong className="text-fulvous tabular-nums">{mins}:{secs}</strong></>
        )}
      </span>
      <a
        href={paymentUrl}
        className="bg-fulvous hover:bg-[#cc7612] text-white font-bold text-xs px-4 py-1.5 rounded transition-colors"
      >
        Claim offer →
      </a>
    </div>
  )
}
