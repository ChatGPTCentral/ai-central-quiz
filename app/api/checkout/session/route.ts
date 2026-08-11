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
import { createClient } from '@supabase/supabase-js'
import { resolveLifetimePriceId } from '@/lib/offers-server'

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

/**
 * The buyer's email, from the quiz row they are checking out from.
 *
 * They typed it into the quiz sixty seconds ago; making them type it again in
 * the Stripe form is a keyboard on a phone for data we already hold. Prefilling
 * also means the Stripe customer lands on the SAME address as the submission,
 * which is what the webhook matches on — the mismatch that made us hand-merge
 * four payers by hand last week.
 *
 * Best effort only: any failure returns undefined and checkout proceeds exactly
 * as before. A checkout must never fail because a lookup did.
 */
async function emailForSubmission(submissionId?: string): Promise<string | undefined> {
  if (!submissionId) return undefined
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return undefined
    const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
    const { data } = await db.from('submissions').select('email').eq('id', submissionId).maybeSingle()
    return usableEmail(clean(data?.email, 320))
  } catch (err) {
    console.warn('[checkout/session] email prefill lookup failed, continuing without:', err)
    return undefined
  }
}

export async function POST(req: NextRequest) {
  let body: { submissionId?: string; anonId?: string; utmSource?: string; utmRef?: string; offer?: string } = {}
  try { body = await req.json() } catch { /* no body is fine */ }

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai'
  const metadata: Record<string, string> = { source: 'quiz_result_embedded' }
  const sub = clean(body.submissionId); if (sub) metadata.submission_id = sub
  const anon = clean(body.anonId); if (anon) metadata.anon_id = anon
  const utm = clean(body.utmSource, 120); if (utm) metadata.utm_source = utm
  const ref = clean(body.utmRef, 120); if (ref) metadata.utm_ref = ref

  // Which offer. The client asks for one, the server decides whether it can be
  // honoured: 'lifetime' is only real if the price is configured, and if it is
  // not we sell the trial rather than charge a lifetime price that does not
  // exist. The client cannot name a price, only an offer.
  const lifetimePrice = clean(body.offer) === 'lifetime' ? await resolveLifetimePriceId() : null
  const lifetime = !!lifetimePrice
  const priceId = lifetimePrice ?? PRICE_ID
  metadata.offer = lifetime ? 'lifetime' : 'trial'

  const customerEmail = await emailForSubmission(sub)

  try {
    const session = await stripe().checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_creation: 'always',
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      // A lifetime buyer has nothing coming, so the card is NOT saved for
      // off-session use. That is the entire promise of the offer, and a saved
      // card is how a day-28 charge gets set up by habit. No card on file, no
      // renewal to create by mistake.
      payment_intent_data: lifetime ? { metadata } : { setup_future_usage: 'off_session', metadata },
      // 'auto', not 'required'. Required forces the full address form — country,
      // line 1, city, postal code, state — which on a phone is five fields and a
      // scroll for a $4.99 impulse buy. 'auto' lets Stripe ask only for what the
      // card network actually needs, usually just a postal code, and nothing at
      // all for a wallet payment. Nothing downstream reads the billing address:
      // the chain needs a customer, a saved off-session card and this price, and
      // automatic_tax is off so no address is needed to compute tax.
      billing_address_collection: 'auto',
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
