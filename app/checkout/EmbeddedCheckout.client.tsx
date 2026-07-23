'use client'

import { useEffect, useRef, useState } from 'react'
import { loadStripe, type Stripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js'

// Stripe Embedded Checkout mounted on our own branded page (no redirect to
// checkout.stripe.com). Fetches the client_secret from /api/checkout/session,
// which mirrors the beehiiv payment link 1:1. Publishable key is public/safe.

const PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
let _p: Promise<Stripe | null> | null = null
function getStripe() { if (!_p && PK) _p = loadStripe(PK); return _p }

export default function EmbeddedCheckout({ submissionId, anonId, utmSource, utmRef }: {
  submissionId?: string; anonId?: string; utmSource?: string; utmRef?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!PK) { setError('missing_key'); return }
    let embedded: StripeEmbeddedCheckout | null = null
    let cancelled = false
    ;(async () => {
      try {
        const stripe = await getStripe()
        if (!stripe || cancelled) return
        const ec = await stripe.createEmbeddedCheckoutPage({
          fetchClientSecret: async () => {
            const res = await fetch('/api/checkout/session', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ submissionId, anonId, utmSource, utmRef }),
            })
            const d = await res.json()
            if (!res.ok || !d.client_secret) throw new Error(d.error || 'could not start checkout')
            return d.client_secret as string
          },
        })
        embedded = ec
        if (cancelled) { ec.destroy(); return }
        if (ref.current) ec.mount(ref.current)
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) }
    })()
    return () => { cancelled = true; try { embedded?.destroy() } catch { /* noop */ } }
  }, [submissionId, anonId, utmSource, utmRef])

  if (!PK) return (
    <div style={{ padding: 24, border: '1px dashed #C9C2B4', background: '#FBF7EE', fontSize: 13, color: '#6B6B6B', borderRadius: 8 }}>
      Set <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> (the <code>pk_live_…</code> key from Stripe → Developers → API keys) in Vercel to enable the embedded checkout.
    </div>
  )
  if (error) return (
    <div style={{ padding: 24, border: '2px solid #BE3B3B', background: '#FFF', fontSize: 13, color: '#BE3B3B', borderRadius: 8 }}>
      Checkout could not load: {error}. You can still <a href={process.env.NEXT_PUBLIC_PAYMENT_URL || 'https://buy.stripe.com/14A5kC67m22McnWfBxdQQ0e'} style={{ color: '#046BB1', fontWeight: 700 }}>continue on Stripe →</a>
    </div>
  )
  return <div ref={ref} />
}
