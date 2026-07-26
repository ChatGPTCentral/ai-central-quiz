// Checkout health — what will the embedded form ACTUALLY offer a buyer?
//
// "Enabled in the Stripe dashboard" and "renders on our embedded checkout" are
// two different things, and the gap costs money:
//   - Apple Pay / Google Pay are card WALLETS, so they never appear in
//     payment_method_types. On embedded Checkout (our own domain) they only
//     render if the domain is registered under payment_method_domains.
//   - PayPal DOES appear as its own payment_method_type — and it is the one to
//     be careful with, because our day-28 renewal depends on
//     setup_future_usage: off_session saving a reusable payment method.
//
// Admin-gated (middleware covers /admin, this route checks the cookie itself).

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_1TSKc4BLsgHOvWxyhu5SWwDr'

export async function GET(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 })
  const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 2 })

  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai'
  const host = site.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const out: Record<string, unknown> = { host, checkedAt: new Date().toISOString() }

  // 1. Create a throwaway session exactly like the live one and read back what
  //    Stripe says it will accept. Sessions expire unused; nothing is charged.
  try {
    const s = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      customer_creation: 'always',
      payment_intent_data: { setup_future_usage: 'off_session' },
      billing_address_collection: 'required',
      automatic_tax: { enabled: false },
      return_url: `${site}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    })
    const types = s.payment_method_types || []
    out.paymentMethodTypes = types
    out.paypalEnabled = types.includes('paypal')
    out.cardEnabled = types.includes('card')
  } catch (e) {
    out.sessionError = e instanceof Error ? e.message : String(e)
  }

  // 2. Apple Pay / Google Pay on OUR domain: is the domain registered, and does
  //    Stripe consider each wallet active on it?
  try {
    const domains = await stripe.paymentMethodDomains.list({ limit: 100 })
    const mine = domains.data.find(d => d.domain_name === host)
    out.domainRegistered = !!mine
    if (mine) {
      out.domainEnabled = mine.enabled
      out.applePay = mine.apple_pay?.status ?? 'unknown'
      out.googlePay = mine.google_pay?.status ?? 'unknown'
      out.link = mine.link?.status ?? 'unknown'
    } else {
      out.registeredDomains = domains.data.map(d => d.domain_name)
    }
  } catch (e) {
    out.domainError = e instanceof Error ? e.message : String(e)
  }

  // 3. The verdict that matters for revenue.
  const notes: string[] = []
  if (out.domainRegistered !== true) {
    notes.push(`Apple Pay / Google Pay will NOT render on the embedded form: ${host} is not registered under Stripe payment method domains. Fix: Stripe → Settings → Payment methods → Apple Pay → Add domain.`)
  } else if (out.applePay !== 'active') {
    notes.push(`Domain is registered but Apple Pay status is "${out.applePay}" — it will not render until active.`)
  } else {
    notes.push('Apple Pay / Google Pay are live on the embedded form.')
  }
  if (out.paypalEnabled) {
    notes.push('PayPal IS enabled on the session. WARNING: verify a PayPal purchase still saves a reusable payment method (setup_future_usage: off_session) — the day-28 $59.75 renewal depends on it. If it does not, a PayPal buyer becomes a $4.99 customer instead of a $60/yr one.')
  }
  out.notes = notes

  return NextResponse.json(out)
}
