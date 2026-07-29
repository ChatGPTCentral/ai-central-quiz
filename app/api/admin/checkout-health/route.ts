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
      // Must mirror app/api/checkout/session exactly, or this diagnostic
      // reports on a form buyers never see.
      billing_address_collection: 'auto',
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

  // 3. Does a PayPal buyer actually leave a reusable payment method? Answered
  //    from real charges, not theory: for each recent successful charge, note
  //    how it was paid, then ask whether that customer has a saved, reusable
  //    payment method. If PayPal buyers systematically have none while card
  //    buyers do, PayPal is silently breaking the day-28 renewal.
  try {
    const charges = await stripe.charges.list({ limit: 100 })
    const seen = new Map<string, { method: string; customer: string }>()
    for (const ch of charges.data) {
      if (ch.status !== 'succeeded') continue
      const cust = typeof ch.customer === 'string' ? ch.customer : ch.customer?.id
      if (!cust || seen.has(cust)) continue
      seen.set(cust, { method: ch.payment_method_details?.type || 'unknown', customer: cust })
    }
    const byMethod: Record<string, { buyers: number; withReusablePm: number }> = {}
    // Cap the lookups so the route stays fast.
    const sample = Array.from(seen.values()).slice(0, 40)
    for (const s of sample) {
      const bucket = (byMethod[s.method] ||= { buyers: 0, withReusablePm: 0 })
      bucket.buyers++
      try {
        const pms = await stripe.paymentMethods.list({ customer: s.customer, limit: 10 })
        if (pms.data.length > 0) bucket.withReusablePm++
      } catch { /* customer may be deleted — counts as no saved method */ }
    }
    out.savedMethodByPayType = byMethod
    const pp = byMethod['paypal']
    if (pp) {
      out.paypalBuyersSampled = pp.buyers
      out.paypalBuyersWithSavedMethod = pp.withReusablePm
      out.paypalSavesForRenewal = pp.buyers > 0 ? pp.withReusablePm / pp.buyers : null
    } else {
      out.paypalBuyersSampled = 0
    }
  } catch (e) {
    out.renewalAuditError = e instanceof Error ? e.message : String(e)
  }

  // 4. The verdict that matters for revenue.
  const notes: string[] = []
  if (out.domainRegistered !== true) {
    notes.push(`Apple Pay / Google Pay will NOT render on the embedded form: ${host} is not registered under Stripe payment method domains. Fix: Stripe → Settings → Payment methods → Apple Pay → Add domain.`)
  } else if (out.applePay !== 'active') {
    notes.push(`Domain is registered but Apple Pay status is "${out.applePay}" — it will not render until active.`)
  } else {
    notes.push('Apple Pay / Google Pay are live on the embedded form.')
  }
  if (out.paypalEnabled) {
    const sampled = Number(out.paypalBuyersSampled || 0)
    const rate = out.paypalSavesForRenewal as number | null | undefined
    if (sampled === 0) {
      notes.push('PayPal IS enabled on the embedded checkout, but no PayPal buyer has come through yet, so we cannot prove it saves a reusable payment method. Until proven, every PayPal sale risks being a $4.99 customer instead of a $4.99 + $59.75/yr one. Safest move is to exclude PayPal from the session until verified.')
    } else if (rate != null && rate < 0.9) {
      notes.push(`PayPal is BREAKING the renewal: only ${out.paypalBuyersWithSavedMethod}/${sampled} PayPal buyers have a reusable saved payment method. Exclude PayPal from the embedded session.`)
    } else {
      notes.push(`PayPal saves a reusable payment method for ${out.paypalBuyersWithSavedMethod}/${sampled} sampled buyers, so the day-28 renewal should fire. Safe to keep.`)
    }
  }
  out.notes = notes

  return NextResponse.json(out)
}
