'use client'

import { useEffect, useRef, useState } from 'react'
import {
  loadStripe,
  type Stripe,
  type StripeElements,
  type StripeExpressCheckoutElementReadyEvent,
  type StripeExpressCheckoutElementClickEvent,
} from '@stripe/stripe-js'
import { sendEvent } from '@/lib/events-client'

// One-tap wallet payment, using Stripe's Express Checkout Element.
//
// The problem it exists for: 279 of 436 payment intents in 30 days were
// canceled — 64%, the same in every country. People open the hosted form and
// leave. This never shows a form. It renders the REAL Apple Pay / Google Pay /
// PayPal buttons, and a tap opens the native sheet: thumbprint, done.
//
// It renders NOTHING unless the browser actually has a wallet available, so a
// visitor with no wallet sees exactly what they see today and loses nothing.
// Everything below it (the normal CTA, the modal, the beehiiv link) is
// untouched, so this can only ever add a path, never remove one.
//
// Vanilla Elements rather than @stripe/react-stripe-js: one component does not
// justify a new dependency and a React-version compatibility surface.

const PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
let stripePromise: Promise<Stripe | null> | null = null
function getStripe() {
  if (!PK) return null
  if (!stripePromise) stripePromise = loadStripe(PK)
  return stripePromise
}

export default function ExpressPay({
  submissionId, anonId, utmSource, utmRef, placement = 'v2_express_pay', offer = 'trial', heldRate = false,
}: {
  submissionId?: string
  anonId?: string
  utmSource?: string
  utmRef?: string
  placement?: string
  /** This visitor arrived from a recovery email that quotes $4.99, so the
   *  wallet sheet must quote and charge that held rate, not the list price. */
  heldRate?: boolean
  /** 'lifetime' where the trial does not renew. Both the quoted amount and the
   *  charge come from this, so the wallet sheet can never show one price and
   *  take another. */
  offer?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current || !PK) return
    let dead = false
    let elements: StripeElements | null = null

    // LAZY STRIPE (speed pass, 2026-08-18). This effect used to start
    // immediately on mount, which meant EVERY result viewer downloaded and
    // parsed js.stripe.com/v3 (~a quarter megabyte of third-party script)
    // plus a price fetch at page load, to draw wallet buttons that sit below
    // the fold on mobile — squarely inside the LCP window the watcher
    // flagged at 4.83s p75. The init now starts when the row comes within
    // 600px of the viewport (ready before eyes arrive; fires immediately
    // when the row is already on screen, so desktop above-fold behavior is
    // unchanged), with an 8s idle fallback for browsers without observers
    // and visitors who never scroll.
    const start = () => {
      if (mounted.current || dead) return
      mounted.current = true
      run()
    }
    let obs: IntersectionObserver | null = null
    let fallback: ReturnType<typeof setTimeout> | null = null
    if (host.current && typeof IntersectionObserver !== 'undefined') {
      obs = new IntersectionObserver(
        entries => { if (entries.some(e => e.isIntersecting)) { obs?.disconnect(); start() } },
        { rootMargin: '600px' },
      )
      obs.observe(host.current)
      fallback = setTimeout(start, 8000)
    } else {
      start()
    }

    async function run() {
      try {
        const stripe = await getStripe()
        if (!stripe || dead || !host.current) return

        // DEFERRED INTENT. The element needs an amount to draw the wallet
        // sheet, but creating a PaymentIntent here would mint a Stripe Customer
        // for every page VIEWER — thousands of empty customers, and duplicates
        // that would break the renewal lookup. So we fetch the price (a cached
        // read that writes nothing) and only create the intent when someone
        // actually taps to pay.
        // submissionId rides along so the founding window (when enabled) can
        // quote THIS person's price — the same number POST will charge.
        const priceRes = await fetch(`/api/checkout/intent?offer=${encodeURIComponent(offer)}${submissionId ? `&submissionId=${encodeURIComponent(submissionId)}` : ''}${heldRate ? '&held=1' : ''}`)
        if (!priceRes.ok) throw new Error(`price ${priceRes.status}`)
        const { amount, currency } = await priceRes.json()
        if (!amount || dead || !host.current) return

        elements = stripe.elements({
          mode: 'payment',
          amount,
          currency,
          setupFutureUsage: 'off_session',
          appearance: { theme: 'flat' },
        })

        // Apple Pay and Google Pay ONLY. Both are CARD wallets: the card lands
        // on the customer exactly like a typed card, and checkout-health has
        // already proven that path saves a reusable payment method (10/10 card
        // buyers, 10/10 Link buyers).
        //
        // PayPal is deliberately excluded. It is its own payment method type,
        // not a card, and no PayPal buyer has ever come through our checkout,
        // so we have zero evidence it leaves anything chargeable on day 28. A
        // PayPal sale that did not save would be $4.99 instead of $4.99 +
        // $59.75/yr, and we would not find out for four weeks.
        const express = elements.create('expressCheckout', {
          buttonHeight: 48,
          buttonTheme: { applePay: 'black', googlePay: 'black' },
          paymentMethods: {
            applePay: 'auto',
            googlePay: 'auto',
            paypal: 'never',
            link: 'never',
            amazonPay: 'never',
          },
        })

        express.on('ready', (e: StripeExpressCheckoutElementReadyEvent) => {
          const any = e.availablePaymentMethods && Object.values(e.availablePaymentMethods).some(Boolean)
          if (!any) return
          setReady(true)
          sendEvent('placement_view', { props: { placement }, submissionId })
        })

        express.on('click', (e: StripeExpressCheckoutElementClickEvent) => {
          sendEvent('checkout_click', { props: { placement, express: true }, submissionId })
          // No shipping, no phone: this is a digital product and every extra
          // field is exactly the friction being removed.
          e.resolve({ emailRequired: true })
        })

        express.on('confirm', async () => {
          if (!elements) return
          try {
            const { error: submitError } = await elements.submit()
            if (submitError) throw new Error(submitError.message || 'submit failed')

            // NOW create the intent — a real buyer, not a passer-by.
            const res = await fetch('/api/checkout/intent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ submissionId, anonId, utmSource, utmRef, offer, held: heldRate }),
            })
            if (!res.ok) throw new Error(`intent ${res.status}`)
            const { client_secret: clientSecret, renewalCheck } = await res.json()
            if (!clientSecret) throw new Error('no client secret')

            // Belt and braces: if the intent that came back cannot support the
            // day-28 charge, abandon rather than take a $4.99 one-off.
            if (renewalCheck && renewalCheck.ok === false) {
              throw new Error('intent would not save a card for renewal')
            }

            const { error } = await stripe.confirmPayment({
              elements,
              clientSecret,
              confirmParams: { return_url: `${window.location.origin}/checkout/success` },
              redirect: 'if_required',
            })
            if (error) throw new Error(error.message || 'Payment could not be completed.')

            sendEvent('express_pay_success', { props: { placement }, submissionId })
            window.location.href = '/checkout/success'
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Payment could not be completed.'
            setErr(msg)
            sendEvent('express_pay_error', { props: { placement, msg: msg.slice(0, 120) }, submissionId })
          }
        })

        express.mount(host.current)
      } catch (e) {
        // Silent by design: the normal CTA is right there and still works.
        console.warn('[express-pay] unavailable:', e)
      }
    }

    return () => {
      dead = true
      obs?.disconnect()
      if (fallback) clearTimeout(fallback)
    }
  }, [submissionId, anonId, utmSource, utmRef, placement])

  if (!PK) return null

  return (
    // Always rendered: an element inside display:none never intersects, and
    // the whole lazy-init above hangs off this node being observable. The
    // 1px sentinel is invisible; the row grows when the wallets mount.
    <div style={{ width: '100%', maxWidth: 470 }}>
      <div ref={host} style={ready ? undefined : { minHeight: 1 }} />
      {err && (
        <p style={{ marginTop: 8, fontSize: 12, color: '#B00020', textAlign: 'center' }}>
          {err} You can still use the button above.
        </p>
      )}
      {ready && (
        <div className="flex items-center" style={{ gap: 8, margin: '10px 0 2px' }}>
          <span style={{ flex: 1, height: 1, background: '#E3DED4' }} />
          <span style={{ fontSize: 10.5, color: '#9C9C9C', fontWeight: 700, letterSpacing: '0.1em' }}>OR</span>
          <span style={{ flex: 1, height: 1, background: '#E3DED4' }} />
        </div>
      )}
    </div>
  )
}
