// Stripe webhook — keeps the CRM (submissions table) in sync with Stripe in
// real time, so a new payment reflects on the lead's row within seconds
// instead of waiting for a manual "Sync Stripe" run in admin.
//
// Setup (one time):
//   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
//        URL:    https://quiz.thecentral.ai/api/webhooks/stripe
//        Events: checkout.session.completed, charge.succeeded,
//                charge.refunded, payment_intent.succeeded, invoice.paid,
//                customer.subscription.created, customer.subscription.updated,
//                customer.subscription.deleted
//   2. Copy the endpoint's "Signing secret" (whsec_...) into the Vercel env
//        STRIPE_WEBHOOK_SECRET
//
// The handler verifies the signature, resolves the paying email, then re-runs
// the SAME per-email aggregation the manual importer uses (source of truth),
// so single- and multi-customer LTV stays correct.

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import Stripe from 'stripe'
import { aggregateStripeByEmail, importAggregatedToCRM } from '@/lib/stripe-import'
import { verifyExpressPayment, sendExpressAlert } from '@/lib/express-alert'

export const runtime = 'nodejs'
export const maxDuration = 300

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 2 })
}

/** Pull the customer email off whatever object the event carries. */
async function resolveEmail(s: Stripe, event: Stripe.Event): Promise<string | null> {
  const obj = event.data.object as unknown as Record<string, unknown>

  // Direct email fields, in order of reliability per event type.
  const direct =
    (obj.customer_details as { email?: string } | undefined)?.email ||
    (obj.customer_email as string | undefined) ||
    (obj.receipt_email as string | undefined) ||
    (obj.billing_details as { email?: string } | undefined)?.email ||
    ((obj.charges as { data?: { billing_details?: { email?: string } }[] } | undefined)?.data?.[0]?.billing_details?.email)
  if (direct) return direct.trim().toLowerCase()

  // Fall back to the customer record.
  const customerId = typeof obj.customer === 'string' ? obj.customer : (obj.customer as { id?: string } | undefined)?.id
  if (customerId) {
    try {
      const cust = await s.customers.retrieve(customerId)
      if (!cust.deleted && cust.email) return cust.email.trim().toLowerCase()
    } catch (err) {
      console.error('[stripe-webhook] customer retrieve failed:', err)
    }
  }
  return null
}

/** The submission this payment belongs to, if the checkout told us.
 *  Our embedded checkout stamps submission_id on both the session and the
 *  payment intent, so we know WHO bought even when they pay with a different
 *  email than the one they used on the quiz (Apple Pay and Link autofill a
 *  personal address, work email on the quiz — extremely common). Email-only
 *  matching silently created a second, source='stripe' row and the sale never
 *  got credited to the quiz. */
function submissionIdFrom(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>
  const meta = (obj.metadata as Record<string, unknown> | undefined) || {}
  const direct = typeof meta.submission_id === 'string' ? meta.submission_id : null
  if (direct && UUID_RE.test(direct)) return direct
  // charge.succeeded carries the intent's metadata one level down
  const pi = obj.payment_intent as { metadata?: Record<string, unknown> } | undefined
  const nested = typeof pi?.metadata?.submission_id === 'string' ? (pi.metadata.submission_id as string) : null
  if (nested && UUID_RE.test(nested)) return nested

  // The STATIC payment link cannot carry metadata, which is the hole this
  // closes. On 2026-08-09 a li_ads visitor took the quiz on her work email,
  // opened the embedded checkout, closed it, then paid six minutes later
  // through the plain buy.stripe.com link using a personal Gmail that Stripe
  // Link autofilled. Her payment intent had metadata {} and the emails did not
  // match, so there was nothing to join on: the sale landed on a second row
  // with no utm_source and LinkedIn never got credited for a sale it made.
  //
  // Payment Links DO forward ?client_reference_id onto the checkout session,
  // so that is the one identifier the static link can carry. Read it here and
  // the link arm attributes exactly like the embedded arm.
  const ref = obj.client_reference_id
  return typeof ref === 'string' && UUID_RE.test(ref) ? ref : null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Credit the payment to the submission the buyer actually came from, even
 *  though Stripe knows them by a different email. Copies the Stripe aggregate
 *  onto that row and archives the duplicate the email-keyed import created. */
async function linkToSubmission(submissionId: string, payingEmail: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return
  const { createClient } = await import('@supabase/supabase-js')
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })

  const { data: target } = await c.from('submissions').select('id, email').eq('id', submissionId).maybeSingle()
  if (!target) return
  // Same email — the normal email-keyed sync already did the right thing.
  if (String((target as { email?: string }).email || '').toLowerCase() === payingEmail.toLowerCase()) return

  const { data: dup } = await c
    .from('submissions')
    .select('id, stripe_customer_id, stripe_customer_ids, stripe_first_charge_at, stripe_last_charge_at, stripe_products, stripe_subscriptions, lifetime_value_usd')
    .ilike('email', payingEmail)
    .eq('source', 'stripe')
    .maybeSingle()
  if (!dup) return

  const d = dup as Record<string, unknown>
  await c.from('submissions').update({
    stripe_customer_id: d.stripe_customer_id,
    stripe_customer_ids: d.stripe_customer_ids,
    stripe_first_charge_at: d.stripe_first_charge_at,
    stripe_last_charge_at: d.stripe_last_charge_at,
    stripe_products: d.stripe_products,
    stripe_subscriptions: d.stripe_subscriptions,
    lifetime_value_usd: d.lifetime_value_usd,
    stripe_imported_at: new Date().toISOString(),
  }).eq('id', submissionId)

  // Soft-delete the duplicate so the person appears once, on their quiz row.
  await c.from('submissions').update({ archived_at: new Date().toISOString() }).eq('id', d.id as string)
  console.log(`[stripe-webhook] linked payment by ${payingEmail} to quiz submission ${submissionId} (archived duplicate ${d.id})`)
}

/** Re-sync one email's Stripe state into its submission row. */
async function syncEmail(email: string): Promise<void> {
  try {
    const { aggregated } = await aggregateStripeByEmail({ onlyEmails: new Set([email]) })
    if (aggregated.size === 0) {
      console.log(`[stripe-webhook] no Stripe customers found for ${email}`)
      return
    }
    // importAggregatedToCRM also applies the Beehiiv customer_active/
    // purchased suppression tags for payers, so a charge tags its person
    // within seconds.
    const counts = await importAggregatedToCRM(aggregated)
    console.log(`[stripe-webhook] synced ${email}:`, counts)
  } catch (err) {
    console.error(`[stripe-webhook] sync failed for ${email}:`, err)
  }
}

// Events we act on. Others are acknowledged (200) and ignored.
const RELEVANT = new Set<string>([
  'checkout.session.completed',
  'charge.succeeded',
  'charge.refunded',
  'charge.updated',
  'payment_intent.succeeded',
  'invoice.paid',
  'invoice.payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'not configured' }, { status: 500 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 })

  const raw = await req.text()
  const s = stripe()

  let event: Stripe.Event
  try {
    event = s.webhooks.constructEvent(raw, sig, secret)
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  // One-tap wallet payments get their own alarm, ahead of the normal sync.
  // The owner needs to know whether the card is reusable BEFORE the day-28
  // renewal, and a notification that only says "it happened" would make them go
  // and look. This answers it in the subject line. Only fires for intents this
  // codebase tagged as express, so ordinary card payments stay quiet.
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent
    if (pi.metadata?.source === 'quiz_result_express') {
      waitUntil(
        verifyExpressPayment(s, pi.id)
          .then(v => sendExpressAlert(v, process.env.NEXT_PUBLIC_SITE_URL))
          .catch(err => console.error('[stripe-webhook] express alert failed:', err)),
      )
    }
  }

  if (RELEVANT.has(event.type)) {
    // Resolve email then sync in the background so Stripe gets its fast 200.
    const submissionId = submissionIdFrom(event)
    waitUntil(
      resolveEmail(s, event).then(async email => {
        if (!email) { console.warn(`[stripe-webhook] ${event.type} had no resolvable email`); return }
        await syncEmail(email)
        // Then credit the quiz submission the buyer actually came from, if the
        // checkout told us — this is what stops a different billing email from
        // silently costing us a counted conversion.
        if (submissionId) await linkToSubmission(submissionId, email)
      }).catch(err => console.error('[stripe-webhook] handler error:', err)),
    )
  }

  return NextResponse.json({ received: true })
}
