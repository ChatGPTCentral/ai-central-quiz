// PaymentIntent for the Express Checkout Element (one-tap wallets).
//
// Why this exists alongside /api/checkout/session. 279 of 436 payment intents
// in 30 days were CANCELED — 64%, identical in every country. People open the
// hosted form and leave. The Express Checkout Element skips the form entirely:
// a native Apple Pay / Google Pay / PayPal sheet, thumbprint, done.
//
// The session route stays. This is additive and flag-gated, because the whole
// business depends on one thing surviving the switch:
//
//   THE DAY-28 RENEWAL. It needs (a) a Stripe Customer, (b) the card saved
//   off_session, (c) the same $4.99 price charged. The Session did (a) with
//   customer_creation:'always'. A PaymentIntent has no such flag, so we create
//   the Customer explicitly and attach it. Get this wrong and every sale is a
//   $4.99 customer instead of a $4.99 + $59.75/yr one.
//
// The amount is read from the SAME Stripe price the session uses rather than
// hardcoded, so the two paths can never drift apart on price.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_1TSKc4BLsgHOvWxyhu5SWwDr'

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 2 })
}

const clean = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

/** The buyer's email from their quiz row. Best effort; never blocks a sale. */
async function emailForSubmission(submissionId?: string): Promise<string | undefined> {
  if (!submissionId) return undefined
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return undefined
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await db.from('submissions').select('email').eq('id', submissionId).maybeSingle()
    const e = clean(data?.email, 320)
    return e && e.includes('@') ? e : undefined
  } catch {
    return undefined
  }
}

export async function POST(req: NextRequest) {
  let body: { submissionId?: string; anonId?: string; utmSource?: string; utmRef?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const metadata: Record<string, string> = { source: 'quiz_result_express' }
  const sub = clean(body.submissionId); if (sub) metadata.submission_id = sub
  const anon = clean(body.anonId); if (anon) metadata.anon_id = anon
  const utm = clean(body.utmSource, 120); if (utm) metadata.utm_source = utm
  const ref = clean(body.utmRef, 120); if (ref) metadata.utm_ref = ref

  try {
    const s = stripe()

    // Price is the source of truth for the amount. If someone edits the price
    // in Stripe, both checkout paths move together.
    const price = await s.prices.retrieve(PRICE_ID)
    const amount = price.unit_amount
    const currency = price.currency
    if (!amount || amount <= 0 || !currency) {
      return NextResponse.json({ error: 'price_has_no_amount' }, { status: 500 })
    }

    // The Customer is not optional. Without one the card cannot be charged
    // off-session on day 28 and the subscription silently never happens.
    const email = await emailForSubmission(sub)
    let customerId: string | undefined
    if (email) {
      const existing = await s.customers.list({ email, limit: 1 })
      customerId = existing.data[0]?.id
    }
    if (!customerId) {
      const created = await s.customers.create({
        ...(email ? { email } : {}),
        metadata,
      })
      customerId = created.id
    }

    const intent = await s.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      // The whole renewal rests on this line.
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      metadata,
      ...(email ? { receipt_email: email } : {}),
    })

    return NextResponse.json({
      client_secret: intent.client_secret,
      amount,
      currency,
      customerId,
    })
  } catch (e) {
    console.error('[checkout/intent] create failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'intent_failed' }, { status: 500 })
  }
}
