'use client'

import { useState, useEffect } from 'react'
import { sendEvent } from '@/lib/events-client'
import { firePlacementView } from '@/components/CheckoutLink.client'
import { useCheckout } from '@/components/checkout-context'

const DURATION_SECONDS = 15 * 60 // 15 minutes

/**
 * Result v2 offer bar: fixed to the BOTTOM with a neon treatment — near-black
 * strip, glowing xanthous top edge, and a big pulsing countdown dead-center.
 * Placements v2_offer_bar / v2_offer_bar_banner; shares the sessionStorage
 * countdown key with v1 so a visitor who sees both pages keeps one timer.
 */
export default function OfferBar({ paymentUrl, submissionId, ctaLabel = 'Claim offer ↗' }: { paymentUrl: string; refNo?: string; submissionId?: string; ctaLabel?: string }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const { mode, open } = useCheckout()

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
    firePlacementView('v2_offer_bar', submissionId)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (secondsLeft === null) return null

  const mins = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const secs = (secondsLeft % 60).toString().padStart(2, '0')

  const goCheckout = () => {
    sendEvent('checkout_click', { props: { placement: 'v2_offer_bar_banner' }, submissionId })
    if (mode === 'embedded') { open(); return }
    window.location.href = paymentUrl
  }

  return (
    <div
      className="ac-neonbar fixed bottom-0 left-0 right-0 z-50 grid items-center gap-2 px-3 sm:px-6 cursor-pointer"
      style={{
        gridTemplateColumns: '1fr auto 1fr',
        backgroundColor: '#0D0D0D',
        height: 72,
        borderTop: '2px solid #E7B02F',
      }}
      onClick={goCheckout}
      role="link"
      aria-label="Claim the special offer"
    >
      {/* left: the offer line (hidden on small screens) */}
      <div className="hidden md:flex items-center gap-3 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-dark-bg.png" alt="AI Central" style={{ height: 18, width: 'auto', display: 'block', opacity: 0.9 }} />
        <span style={{ fontSize: 12.5, color: '#FEF7E7', opacity: 0.75, letterSpacing: '0.04em' }}>
          Full library · <strong style={{ color: '#E7B02F', opacity: 1 }}>$4.99 first month</strong>
        </span>
      </div>
      <div className="md:hidden" />

      {/* center: THE countdown */}
      <div className="flex flex-col items-center justify-center" style={{ lineHeight: 1 }}>
        <span className="uppercase" style={{ fontSize: 9.5, letterSpacing: '0.22em', color: '#FEF7E7', opacity: 0.6 }}>
          Special offer expires
        </span>
        <span
          className="font-mono font-black tabular-nums ac-neontime"
          style={{ fontSize: 'clamp(26px, 4.4vw, 36px)', color: '#E7B02F', marginTop: 2 }}
        >
          {mins}:{secs}
        </span>
      </div>

      {/* right: neon CTA */}
      <div className="flex justify-end">
        <a
          href={paymentUrl}
          className="font-black uppercase ac-neoncta"
          style={{ backgroundColor: '#E7B02F', color: '#0D0D0D', fontSize: 12.5, padding: '12px 16px', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}
          onClick={e => { e.stopPropagation(); sendEvent('checkout_click', { props: { placement: 'v2_offer_bar' }, submissionId }); if (mode === 'embedded') { e.preventDefault(); open() } }}
        >
          {ctaLabel}
        </a>
      </div>

      <style>{`
        .ac-neonbar { box-shadow: 0 -2px 18px rgba(231,176,47,0.55), 0 -8px 44px rgba(231,176,47,0.28); animation: ac-neon-pulse 2.4s ease-in-out infinite }
        .ac-neontime { text-shadow: 0 0 10px rgba(231,176,47,0.95), 0 0 28px rgba(231,176,47,0.55), 0 0 52px rgba(228,135,21,0.35) }
        .ac-neoncta { box-shadow: 0 0 14px rgba(231,176,47,0.75), 0 0 34px rgba(231,176,47,0.35); transition: box-shadow .2s }
        .ac-neoncta:hover { box-shadow: 0 0 20px rgba(231,176,47,0.95), 0 0 48px rgba(231,176,47,0.5) }
        @keyframes ac-neon-pulse {
          0%, 100% { box-shadow: 0 -2px 18px rgba(231,176,47,0.55), 0 -8px 44px rgba(231,176,47,0.28) }
          50% { box-shadow: 0 -2px 26px rgba(231,176,47,0.8), 0 -10px 60px rgba(231,176,47,0.42) }
        }
        @media (prefers-reduced-motion: reduce) { .ac-neonbar { animation: none } }
      `}</style>
    </div>
  )
}
