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
import { resolveLifetimePriceId } from '@/lib/offers-server'
import { foundingWindowState, isHeldRateSource } from '@/lib/founding-window'

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

/**
 * The email is a CONVENIENCE. It must never be able to stop a sale.
 *
 * On 2026-08-11 a real buyer typed "upb.edu,co", a comma for a dot. We passed
 * it to Stripe as a prefill, Stripe rejected the whole session for an invalid
 * address, and the checkout form never rendered: they wanted to pay and got a
 * blank box. Anything that does not clearly parse is dropped and Stripe simply
 * asks for it, which costs one field and saves the sale.
 */
function usableEmail(e: string | undefined): string | undefined {
  if (!e) return undefined
  // Deliberately strict, because the only cost of rejecting a good address is
  // that the buyer types it again, and the cost of passing a bad one is the
  // entire checkout.
  return /^[^\s@,;]+@[^\s@,;]+\.[A-Za-z]{2,}$/.test(e) ? e : undefined
}

/** The buyer's email from their quiz row. Best effort; never blocks a sale. */
async function emailForSubmission(submissionId?: string): Promise<string | undefined> {
  if (!submissionId) return undefined
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return undefined
    const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
    const { data } = await db.from('submissions').select('email').eq('id', submissionId).maybeSingle()
    return usableEmail(clean(data?.email, 320))
  } catch {
    return undefined
  }
}

/**
 * GET: the price only. No Customer, no PaymentIntent, nothing written.
 *
 * The Express Checkout Element needs an amount to render its wallet sheet, but
 * creating a PaymentIntent just to draw a button would mint a Stripe Customer
 * for every single result-page VIEWER — thousands of empty customer records,
 * and a duplicate-customer mess that would break the very renewal lookup this
 * route depends on. So the element mounts in deferred mode off this cheap
 * read, and POST below runs only when someone actually taps to pay.
 */
export async function GET(req: NextRequest) {
  try {
    // ?offer=lifetime renders the wallet sheet at the lifetime amount. The
    // server still decides: an unconfigured lifetime price falls back to the
    // trial rather than quoting a number nothing can charge.
    const lifetimePrice = req.nextUrl.searchParams.get('offer') === 'lifetime' ? await resolveLifetimePriceId() : null
    const wantLifetime = !!lifetimePrice
    const price = await stripe().prices.retrieve(lifetimePrice ?? PRICE_ID)
    if (!price.unit_amount || !price.currency) {
      return NextResponse.json({ error: 'price_has_no_amount' }, { status: 500 })
    }
    // The founding window (inert until app_settings flips it): the TRIAL
    // amount is per-person once enabled, so the wallet sheet quotes the same
    // number POST will charge — and per-person quotes must never be CDN-cached.
    const w = wantLifetime
      ? null
      : await foundingWindowState(
          req.nextUrl.searchParams.get('submissionId'),
          price.unit_amount,
          undefined,
          { heldRate: req.nextUrl.searchParams.get('held') === '1' },
        )
    const amount = w ? w.amountCents : price.unit_amount
    return NextResponse.json(
      {
        amount, currency: price.currency, offer: wantLifetime ? 'lifetime' : 'trial',
        ...(w && w.enabled ? { foundingWindow: { valid: w.valid, expiresAt: w.expiresAt, listCents: w.listCents } } : {}),
      },
      { headers: { 'Cache-Control': w && w.enabled ? 'no-store' : 'public, s-maxage=600, stale-while-revalidate=3600' } },
    )
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'price_failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  let body: { submissionId?: string; anonId?: string; utmSource?: string; utmRef?: string; offer?: string; held?: boolean } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const metadata: Record<string, string> = { source: 'quiz_result_express' }
  const sub = clean(body.submissionId); if (sub) metadata.submission_id = sub
  const anon = clean(body.anonId); if (anon) metadata.anon_id = anon
  const utm = clean(body.utmSource, 120); if (utm) metadata.utm_source = utm
  const ref = clean(body.utmRef, 120); if (ref) metadata.utm_ref = ref

  // A lifetime sale only happens if the lifetime price is configured. The
  // client names an offer, never a price.
  const lifetimePrice = clean(body.offer) === 'lifetime' ? await resolveLifetimePriceId() : null
  const lifetime = !!lifetimePrice
  metadata.offer = lifetime ? 'lifetime' : 'trial'

  try {
    const s = stripe()

    // Price is the source of truth for the FOUNDING amount. If someone edits
    // the price in Stripe, both checkout paths move together. The founding
    // window (inert until app_settings flips it) can replace the trial amount
    // with the list price — computed HERE, server-side, from the submission's
    // own timestamp, which is what makes the personal deadline real.
    const price = await s.prices.retrieve(lifetimePrice ?? PRICE_ID)
    const baseAmount = price.unit_amount
    const currency = price.currency
    if (!baseAmount || baseAmount <= 0 || !currency) {
      return NextResponse.json({ error: 'price_has_no_amount' }, { status: 500 })
    }
    const w = lifetime
      ? null
      : await foundingWindowState(sub, baseAmount, undefined, {
          heldRate: body.held === true || isHeldRateSource(utm),
        })
    const amount = w ? w.amountCents : baseAmount
    if (w && w.enabled) metadata.founding = w.held ? 'held' : w.valid ? 'window' : 'list'

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
      // The whole renewal rests on this line — for the TRIAL. A lifetime buyer
      // has no renewal, so their card is not kept on file: that is the offer,
      // and a saved card is how a day-28 charge gets created out of habit.
      ...(lifetime ? {} : { setup_future_usage: 'off_session' as const }),
      automatic_payment_methods: { enabled: true },
      metadata,
      ...(email ? { receipt_email: email } : {}),
    })

    // Echo back the two fields the renewal depends on, read off the object
    // Stripe actually created rather than off our own request. This makes the
    // config provable without spending $4.99: if setupFutureUsage is not
    // 'off_session' or customer is null, the day-28 charge cannot happen and
    // express must stay off.
    return NextResponse.json({
      client_secret: intent.client_secret,
      amount,
      currency,
      customerId,
      offer: lifetime ? 'lifetime' : 'trial',
      renewalCheck: {
        setupFutureUsage: intent.setup_future_usage,
        customer: typeof intent.customer === 'string' ? intent.customer : intent.customer?.id ?? null,
        // A lifetime sale is correctly configured when there is NO card saved
        // for later, which is the opposite test from the trial.
        ok: lifetime
          ? intent.setup_future_usage == null && !!intent.customer
          : intent.setup_future_usage === 'off_session' && !!intent.customer,
      },
    })
  } catch (e) {
    console.error('[checkout/intent] create failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'intent_failed' }, { status: 500 })
  }
}
