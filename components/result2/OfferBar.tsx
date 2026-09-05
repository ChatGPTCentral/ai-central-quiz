'use client'

import { useState, useEffect } from 'react'
import { sendEvent } from '@/lib/events-client'
import { firePlacementView } from '@/components/CheckoutLink.client'
import { useCheckout } from '@/components/checkout-context'
import { TRIAL_OFFER, type Offer } from '@/lib/offers'

/**
 * Result v2 offer bar: fixed to the BOTTOM with a neon treatment — near-black
 * strip, glowing xanthous top edge, and the deadline dead-center.
 * Placements v2_offer_bar / v2_offer_bar_banner.
 *
 * THE COUNTDOWN IS THE REAL ONE OR THERE IS NO COUNTDOWN (2026-09-04).
 * This bar used to run its own 15-minute timer out of sessionStorage, under
 * the words "Special offer expires". Nothing expired when it reached zero,
 * the price was identical either side of it, and a new session started the
 * 15 minutes again. It was the single most-seen element on the result page:
 * 536 of 541 people, 99.1%.
 *
 * CLAUDE.md carries the research it contradicted — 18 published A/B tests on
 * countdown timers, real deadlines median +9.1%, fake or resetting ones
 * median −3.2% — and names this exact risk: a fake deadline teaches the
 * reader to distrust deadlines in general, INCLUDING the real one. The real
 * one here is the founding window (lib/founding-window.ts), a personal
 * 12-hour rate the checkout genuinely enforces server-side. The page already
 * calls it "the one TRUE urgency line this page is allowed" and then let
 * this bar undercut it in front of everybody.
 *
 * So the bar now takes the deadline from the caller instead of inventing it:
 *   deadline  — the founding window's real expiresAt, or null
 *   heldNote  — the rate was held for an email recipient, so their clock has
 *               already run out and a countdown would be a lie
 * With no real deadline the bar shows the offer and the button, and says
 * nothing about time. A quieter bar that is true beats a loud one that is
 * not, and it keeps the founding window credible for the day it is on.
 */
export default function OfferBar({ paymentUrl, submissionId, ctaLabel = 'Claim offer ↗', offer = TRIAL_OFFER, deadline = null, heldNote = false }: { paymentUrl: string; refNo?: string; submissionId?: string; ctaLabel?: string; offer?: Offer; deadline?: string | null; heldNote?: boolean }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const { mode, open } = useCheckout()

  useEffect(() => {
    setMounted(true)
    firePlacementView('v2_offer_bar', submissionId)
    if (!deadline) return
    const endsAt = Date.parse(deadline)
    if (Number.isNaN(endsAt)) return
    const calc = () => Math.max(0, Math.floor((endsAt - Date.now()) / 1000))
    setSecondsLeft(calc())
    const interval = setInterval(() => setSecondsLeft(calc()), 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline])

  // Render nothing until mounted so the server and the client agree; the
  // countdown is clock-dependent and would otherwise mismatch on hydration.
  if (!mounted) return null

  /** The real window is 12 hours, not 15 minutes, so hours lead while they
   *  exist and the seconds only appear in the last hour, where they mean
   *  something. */
  const clock = secondsLeft === null || secondsLeft <= 0 ? null
    : secondsLeft >= 3600
      ? `${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, '0')}m`
      : `${Math.floor(secondsLeft / 60).toString().padStart(2, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`

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
      {/* left: what the price buys (hidden on small screens, where the centre
          has to carry the whole offer on its own) */}
      <div className="hidden md:flex items-center gap-3 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-dark-bg.png" alt="AI Central" style={{ height: 18, width: 'auto', display: 'block', opacity: 0.9 }} />
        <span style={{ fontSize: 12.5, color: '#FEF7E7', opacity: 0.75, letterSpacing: '0.04em' }}>
          1,200+ tutorials · 50+ templates
        </span>
      </div>
      <div className="md:hidden" />

      {/* centre: THE PRICE (owner, 2026-09-04: "voglio puntare su questa
          questione che ogni giorno ci sono 10 trial a questo no-brainer
          price"). This slot is the loudest thing on the bar and the bar is
          the most-seen element on the page, 536 of 541 people. It used to
          hold a fake countdown; before that the price only ever appeared in
          the left cell, which is `hidden md:flex` — so 27.8% of this page's
          traffic, everyone on a phone, never saw the number the whole
          argument rests on. The price now sits here on every screen size.
          The BUTTON still sells the outcome, not the price: that rule is in
          CLAUDE.md and this does not break it, the strip is where the price
          is allowed to live. */}
      <div className="flex flex-col items-center justify-center" style={{ lineHeight: 1 }}>
        {clock ? (
          <span className="uppercase" style={{ fontSize: 9.5, letterSpacing: '0.22em', color: '#FEF7E7', opacity: 0.6, marginBottom: 3 }}>
            {clock} left
          </span>
        ) : heldNote ? (
          <span className="uppercase" style={{ fontSize: 9.5, letterSpacing: '0.22em', color: '#FEF7E7', opacity: 0.6, marginBottom: 3 }}>
            price held from your email
          </span>
        ) : null}
        {/* Owner, 2026-09-05: the strip should say what the price BUYS, not
            just the number. "Unlock everything" is the promise the button
            repeats, so the two agree instead of competing. */}
        <span className="font-black tabular-nums ac-neontime text-center" style={{ fontSize: 'clamp(19px, 3.1vw, 26px)', color: '#E7B02F', lineHeight: 1.1 }}>
          Unlock everything for {offer.price}
        </span>
        <span className="uppercase" style={{ fontSize: 9.5, letterSpacing: '0.18em', color: '#FEF7E7', opacity: 0.65, marginTop: 3 }}>
          {offer.oneTime ? 'once, yours for good' : 'your first month'}
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
