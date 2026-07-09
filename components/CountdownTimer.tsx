'use client'

import { useState, useEffect } from 'react'
import { sendEvent } from '@/lib/events-client'

const DURATION_SECONDS = 15 * 60 // 15 minutes

/**
 * Sticky top offer bar (design-handoff §1): dark strip with the wordmark,
 * the assessment reference number, the ticking offer countdown (xanthous)
 * and a CLAIM OFFER button. Reads/writes the same sessionStorage key as
 * InlineCountdown so every countdown on the page stays in lockstep.
 */
export default function CountdownTimer({ paymentUrl, refNo, submissionId }: { paymentUrl: string; refNo?: string; submissionId?: string }) {
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

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 sm:px-6"
      style={{ backgroundColor: '#333333', height: 56 }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-dark-bg.png" alt="AI Central" style={{ height: 20, width: 'auto', display: 'block' }} />
        <span className="hidden md:inline-block h-4 w-px" style={{ background: '#FEF7E7', opacity: 0.35 }} aria-hidden />
        <span
          className="hidden md:inline font-mono"
          style={{ fontSize: 11, letterSpacing: '0.12em', color: '#FEF7E7', opacity: 0.65 }}
        >
          AI READINESS ASSESSMENT{refNo ? ` · NO. ${refNo}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
        <span className="hidden sm:inline uppercase" style={{ fontSize: 11, color: '#FEF7E7', opacity: 0.65, letterSpacing: '0.06em' }}>
          Special offer expires
        </span>
        <span className="font-mono font-bold tabular-nums" style={{ fontSize: 17, color: '#E7B02F' }}>
          {mins}:{secs}
        </span>
        <a
          href={paymentUrl}
          className="font-semibold uppercase transition-colors"
          style={{ backgroundColor: '#E7B02F', color: '#1A1A1A', fontSize: 12, padding: '10px 14px', letterSpacing: '0.04em' }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#E48715' }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '#E7B02F' }}
          onClick={() => sendEvent('checkout_click', { props: { placement: 'offer_bar' }, submissionId })}
        >
          Claim offer ↗
        </a>
      </div>
    </div>
  )
}
