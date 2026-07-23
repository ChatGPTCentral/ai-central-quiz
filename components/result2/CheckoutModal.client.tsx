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

export default function CheckoutModalProvider({
  mode,
  submissionId,
  anonId,
  utmSource,
  utmRef,
  fallbackUrl,
  children,
}: {
  mode: CheckoutMode
  submissionId?: string
  anonId?: string
  utmSource?: string
  utmRef?: string
  fallbackUrl: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const closeBtn = useRef<HTMLButtonElement>(null)

  const doOpen = useCallback(() => { if (mode === 'embedded') setOpen(true) }, [mode])
  const doClose = useCallback(() => setOpen(false), [])

  // Scroll-lock the page, close on Escape, focus the close button on open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    closeBtn.current?.focus()
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <CheckoutCtx.Provider value={{ mode, open: doOpen }}>
      {children}
      {mode === 'embedded' && open && (
        <div
          className="ac-coov"
          role="dialog"
          aria-modal="true"
          aria-label="Start your $4.99 trial"
          onClick={e => { if (e.target === e.currentTarget) doClose() }}
        >
          <div className="ac-comodal">
            <div className="ac-cohead">
              <span className="ac-cotitle">Start your $4.99 trial</span>
              <button ref={closeBtn} type="button" onClick={doClose} aria-label="Close" className="ac-cox">×</button>
            </div>
            <div className="ac-cobody">
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
