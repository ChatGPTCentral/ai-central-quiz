// Embedded checkout session — mirrors the beehiiv payment link (plink_1RSUlk…)
// 1:1 so the downstream (owner adds the buyer to Memberstack → activepieces
// emails credentials → day-28 Stripe subscription on the saved card) is
// preserved. The ONLY things that matter for that chain are: a Stripe customer
// is created AND the card is saved off-session AND the same product is charged.
// We add metadata (submission/anon/utm) the static link couldn't carry.
//
// Config replicated from the live link:
//   mode: payment (one-time $4.99) · customer_creation: always
//   payment_intent_data.setup_future_usage: off_session (save card)
//   billing_address_collection: required · automatic_tax: off (price is tax-inclusive)

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The $4.99 "4 weeks" price behind buy.stripe.com/14A5kC… (override via env if it ever changes).
const PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_1TSKc4BLsgHOvWxyhu5SWwDr'

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 2 })
}

const clean = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

export async function POST(req: NextRequest) {
  let body: { submissionId?: string; anonId?: string; utmSource?: string; utmRef?: string } = {}
  try { body = await req.json() } catch { /* no body is fine */ }

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai'
  const metadata: Record<string, string> = { source: 'quiz_result_embedded' }
  const sub = clean(body.submissionId); if (sub) metadata.submission_id = sub
  const anon = clean(body.anonId); if (anon) metadata.anon_id = anon
  const utm = clean(body.utmSource, 120); if (utm) metadata.utm_source = utm
  const ref = clean(body.utmRef, 120); if (ref) metadata.utm_ref = ref

  try {
    const session = await stripe().checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      customer_creation: 'always',
      payment_intent_data: { setup_future_usage: 'off_session', metadata },
      billing_address_collection: 'required',
      automatic_tax: { enabled: false },
      metadata,
      return_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    })
    return NextResponse.json({ client_secret: session.client_secret })
  } catch (e) {
    console.error('[checkout/session] create failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'session_failed' }, { status: 500 })
  }
}
