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

/** Re-sync one email's Stripe state into its submission row. */
async function syncEmail(email: string): Promise<void> {
  try {
    const { aggregated } = await aggregateStripeByEmail({ onlyEmails: new Set([email]) })
    if (aggregated.size === 0) {
      console.log(`[stripe-webhook] no Stripe customers found for ${email}`)
      return
    }
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

  if (RELEVANT.has(event.type)) {
    // Resolve email then sync in the background so Stripe gets its fast 200.
    waitUntil(
      resolveEmail(s, event).then(email => {
        if (email) return syncEmail(email)
        console.warn(`[stripe-webhook] ${event.type} had no resolvable email`)
      }).catch(err => console.error('[stripe-webhook] handler error:', err)),
    )
  }

  return NextResponse.json({ received: true })
}
