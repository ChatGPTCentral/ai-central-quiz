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
  submissionId, anonId, utmSource, utmRef, placement = 'v2_express_pay',
}: {
  submissionId?: string
  anonId?: string
  utmSource?: string
  utmRef?: string
  placement?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current || !PK) return
    mounted.current = true
    let dead = false
    let elements: StripeElements | null = null

    ;(async () => {
      try {
        const stripe = await getStripe()
        if (!stripe || dead || !host.current) return

        const res = await fetch('/api/checkout/intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId, anonId, utmSource, utmRef }),
        })
        if (!res.ok) throw new Error(`intent ${res.status}`)
        const { client_secret: clientSecret } = await res.json()
        if (!clientSecret || dead || !host.current) return

        elements = stripe.elements({ clientSecret, appearance: { theme: 'flat' } })
        // Apple Pay and Google Pay ONLY. Both are CARD wallets: the card lands
        // on the customer exactly like a typed card, and checkout-health has
        // already proven that path saves a reusable payment method (10/10 card
        // buyers, 10/10 Link buyers).
        //
        // PayPal is deliberately excluded. It is its own payment method type,
        // not a card, and no PayPal buyer has ever come through our checkout,
        // so we have zero evidence it leaves anything chargeable on day 28. A
        // PayPal sale that does not save would be $4.99 instead of $4.99 +
        // $59.75/yr — trading a cancel-rate win for a 92% cut in LTV, and we
        // would not find out for 28 days. It can be switched on later from
        // real evidence; it is not going on untested.
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

        // Fires with the wallets this device can actually use. No wallets means
        // we render nothing at all rather than an empty gap.
        express.on('ready', (e: StripeExpressCheckoutElementReadyEvent) => {
          const any = e.availablePaymentMethods && Object.values(e.availablePaymentMethods).some(Boolean)
          if (!any) return
          setReady(true)
          sendEvent('placement_view', { props: { placement }, submissionId })
        })

        express.on('click', (e: StripeExpressCheckoutElementClickEvent) => {
          sendEvent('checkout_click', { props: { placement, express: true }, submissionId })
          // No shipping, no phone: this is a digital product and every extra
          // field is exactly the friction we are removing.
          e.resolve({ emailRequired: true })
        })

        express.on('confirm', async () => {
          if (!elements) return
          const { error } = await stripe.confirmPayment({
            elements,
            clientSecret,
            confirmParams: { return_url: `${window.location.origin}/checkout/success` },
            redirect: 'if_required',
          })
          if (error) {
            setErr(error.message || 'Payment could not be completed.')
            sendEvent('express_pay_error', { props: { placement, code: error.code || 'unknown' }, submissionId })
            return
          }
          sendEvent('express_pay_success', { props: { placement }, submissionId })
          window.location.href = '/checkout/success'
        })

        express.mount(host.current)
      } catch (e) {
        // Silent by design: the normal CTA is right there and still works.
        console.warn('[express-pay] unavailable:', e)
      }
    })()

    return () => { dead = true }
  }, [submissionId, anonId, utmSource, utmRef, placement])

  if (!PK) return null

  return (
    <div style={{ width: '100%', maxWidth: 470, display: ready ? 'block' : 'none' }}>
      <div ref={host} />
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
