'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EmbeddedCheckout from '@/app/checkout/EmbeddedCheckout.client'
import { sendEvent } from '@/lib/events-client'
import { CheckoutCtx, type CheckoutMode } from '@/components/checkout-context'

// On-page checkout for the embedded A/B (experiment checkout_embed_v1).
//
// mode='link'  → provider is inert. It renders no modal and open() is a no-op,
//                so every CTA keeps navigating to the beehiiv payment link.
// mode='embedded' → a CTA click opens this modal, which mounts the SAME Stripe
//                embedded form used at /checkout. A "continue on Stripe" link is
//                always present so the arm can never dead-end a buyer: worst case
//                they finish on the exact link the control arm uses.
//
// The form is mounted only while the modal is open (Stripe.js + a Checkout
// Session are created on intent, not for every result-page viewer).

// ── Non-US trust strip ─────────────────────────────────────────────────
// Non-US visitors convert at 2.2% against the US 7.8%, and it is not card
// declines: 83 failed $4.99 attempts in three months, 45 of them US, and
// Canada is 0-for-55 with zero failed attempts. They open the form, read it,
// and leave. So the three doubts a non-US buyer actually has get answered in
// writing, at the form: what is this in my money, when am I charged again,
// and how do I get out. US visitors never see it.
//
// Rates are deliberately approximate ("about") — the job is recognisability,
// not FX accuracy. Revisit the numbers if a year has passed.
const FX: Record<string, { rate: number; sym: string }> = {
  CA: { rate: 1.38, sym: 'C$' },
  GB: { rate: 0.78, sym: '£' },
  AU: { rate: 1.52, sym: 'A$' },
  NZ: { rate: 1.66, sym: 'NZ$' },
  IN: { rate: 87, sym: '₹' },
  SG: { rate: 1.34, sym: 'S$' },
  CH: { rate: 0.87, sym: 'CHF ' },
  JP: { rate: 147, sym: '¥' },
  MX: { rate: 18.7, sym: 'MX$' },
  BR: { rate: 5.5, sym: 'R$' },
  ZA: { rate: 17.8, sym: 'R' },
  AE: { rate: 3.67, sym: 'AED ' },
  PH: { rate: 57, sym: '₱' },
  SE: { rate: 10.6, sym: 'kr ' },
  NO: { rate: 10.9, sym: 'kr ' },
  DK: { rate: 6.8, sym: 'kr ' },
  PL: { rate: 3.9, sym: 'zł ' },
}
const EURO = new Set(['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR', 'SK', 'SI', 'LV', 'LT', 'EE', 'LU', 'CY', 'MT', 'HR'])

function localPrice(country: string): string | null {
  const fx = EURO.has(country) ? { rate: 0.91, sym: '€' } : FX[country]
  if (!fx) return null
  const v = 4.99 * fx.rate
  return fx.sym + (v >= 100 ? String(Math.round(v)) : v.toFixed(2))
}

export default function CheckoutModalProvider({
  mode,
  submissionId,
  anonId,
  utmSource,
  utmRef,
  fallbackUrl,
  country,
  children,
}: {
  mode: CheckoutMode
  submissionId?: string
  anonId?: string
  utmSource?: string
  utmRef?: string
  fallbackUrl: string
  /** Visitor country from Vercel's IP geo header; absent locally. */
  country?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const closeBtn = useRef<HTMLButtonElement>(null)

  // ── Checkout telemetry ───────────────────────────────────────────────
  // 64% of payment intents are canceled and we have no idea why, because the
  // moment someone clicks the CTA they disappear into an iframe. Session
  // recordings would answer it, but nobody is going to watch recordings, and
  // Clarity has no API to read them anyway.
  //
  // So we instrument the modal itself. Every question a recording would answer
  // — did the form load, how long did they stay, did they leave by X, Escape,
  // backdrop or the browser — becomes a queryable number instead of a video.
  const openedAt = useRef<number>(0)

  // The country and whether the strip rendered ride on the open event, so the
  // strip's effect is measurable per segment without an A/B the volume could
  // never power (~80 non-US clicks a week).
  const showTrust = !!country && country !== 'US'

  const doOpen = useCallback(() => {
    if (mode !== 'embedded') return
    openedAt.current = Date.now()
    sendEvent('checkout_modal_open', { props: { country: country ?? null, trust: showTrust }, submissionId })
    setOpen(true)
  }, [mode, submissionId, country, showTrust])

  // `how` is the whole point: leaving in 2s by backdrop is a misclick, leaving
  // at 40s by the X is someone who read the form and said no. Same event today.
  const closeWith = useCallback((how: string) => {
    const dwellMs = openedAt.current ? Date.now() - openedAt.current : null
    sendEvent('checkout_modal_close', { props: { how, dwellMs }, submissionId })
    setOpen(false)
  }, [submissionId])

  const doClose = useCallback(() => closeWith('button'), [closeWith])

  // Scroll-lock the page, close on Escape, focus the close button on open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeWith('escape') }
    document.addEventListener('keydown', onKey)
    closeBtn.current?.focus()
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        const dwellMs = openedAt.current ? Date.now() - openedAt.current : null
        sendEvent('checkout_modal_close', { props: { how: 'left_page', dwellMs }, submissionId })
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [open, closeWith, submissionId])

  return (
    <CheckoutCtx.Provider value={{ mode, open: doOpen }}>
      {children}
      {mode === 'embedded' && open && (
        <div
          className="ac-coov"
          role="dialog"
          aria-modal="true"
          aria-label="Start your $4.99 trial"
          onClick={e => { if (e.target === e.currentTarget) closeWith('backdrop') }}
        >
          <div className="ac-comodal">
            <div className="ac-cohead">
              <span className="ac-cotitle">Start your $4.99 trial</span>
              <button ref={closeBtn} type="button" onClick={doClose} aria-label="Close" className="ac-cox">×</button>
            </div>
            <div className="ac-cobody">
              {showTrust && (
                <div className="ac-cotrust">
                  {localPrice(country!) && (
                    <div className="ac-cotrustrow">
                      <span aria-hidden>💱</span>
                      <span><strong>$4.99 is about {localPrice(country!)}</strong> in your money. You are charged in USD, your bank converts it automatically</span>
                    </div>
                  )}
                  <div className="ac-cotrustrow">
                    <span aria-hidden>📅</span>
                    <span>One charge today. The $59.75 annual only bills if you stay past 4 weeks, and we email you before it does</span>
                  </div>
                  <div className="ac-cotrustrow">
                    <span aria-hidden>🛡️</span>
                    <span>Cancel any time in your trial month, two clicks. 30-day money-back guarantee on top</span>
                  </div>
                </div>
              )}
              <EmbeddedCheckout submissionId={submissionId} anonId={anonId} utmSource={utmSource} utmRef={utmRef} />
              <div className="ac-cofallback">
                <a
                  href={fallbackUrl}
                  onClick={() => sendEvent('checkout_click', { props: { placement: 'v2_embedded_fallback' }, submissionId })}
                >
                  Prefer the classic checkout? Continue on Stripe →
                </a>
              </div>
            </div>
          </div>
          <style>{`
            .ac-coov { position: fixed; inset: 0; z-index: 9999; background: rgba(20,15,5,.55);
              -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
              display: flex; align-items: center; justify-content: center; padding: 16px; }
            .ac-comodal { width: 100%; max-width: 460px; background: #FFFDF7; border: 3px solid #1A1A1A;
              max-height: 92vh; overflow: auto; animation: ac-copop .2s ease; }
            .ac-cohead { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px;
              border-bottom: 2px solid #1A1A1A; position: sticky; top: 0; background: #FFFDF7; }
            .ac-cotitle { font-weight: 800; font-size: 15px; color: #1A1A1A; letter-spacing: -.01em; }
            .ac-cox { appearance: none; border: 0; background: transparent; font-size: 24px; line-height: 1;
              color: #1A1A1A; cursor: pointer; padding: 2px 6px; }
            .ac-cox:focus-visible { outline: 2px solid #E48715; outline-offset: 2px; }
            .ac-cobody { padding: 18px 16px 20px; }
            .ac-cotrust { border: 2px solid #1A1A1A; background: #FEF7E7; padding: 10px 12px; margin-bottom: 14px;
              display: flex; flex-direction: column; gap: 7px; }
            .ac-cotrustrow { display: flex; gap: 8px; font-size: 12px; line-height: 1.45; color: #333333; }
            .ac-cotrustrow strong { font-weight: 800; color: #1A1A1A; }
            .ac-cofallback { margin-top: 14px; text-align: center; }
            .ac-cofallback a { font-size: 12px; color: #8A8A8A; text-decoration: underline; }
            @keyframes ac-copop { from { opacity: 0; transform: translateY(8px) scale(.985) } to { opacity: 1; transform: none } }
            @media (max-width: 560px) {
              .ac-coov { padding: 0; align-items: flex-end; }
              .ac-comodal { max-width: none; border-width: 0; border-top: 3px solid #1A1A1A; animation: ac-cosheet .24s ease; }
            }
            @keyframes ac-cosheet { from { transform: translateY(100%) } to { transform: none } }
            @media (prefers-reduced-motion: reduce) { .ac-comodal { animation: none } }
          `}</style>
        </div>
      )}
    </CheckoutCtx.Provider>
  )
}
