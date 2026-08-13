// The one-click retry: create the $59.75/year subscription on the card on
// file, from the Did-not-convert list (owner request, 2026-08-13: "an
// automation that automatically creates a 59.75 subscription to that person
// with the card on file from the click of a button").
//
// This button moves real money, so it refuses more readily than it charges:
//   · admin session required, same cookie the dashboard checks
//   · REFUSED if the customer already holds any subscription that is active,
//     trialing or past_due — the retry list is defined as people with ZERO
//     subscriptions, and someone who already pays belongs in the
//     "person already pays" segment, not here (owner's rule, point 3)
//   · REFUSED if there is no card to charge
//   · payment_behavior error_if_incomplete: a declined card creates NOTHING,
//     no dangling incomplete subscription to clean up
//   · idempotency key derived from the trial charge id: double-clicks and
//     retries cannot create two subscriptions
//   · every attempt, success or refusal, lands in admin_actions
//
// The charge appears in stripe_charges at the next hourly sync (:20), and the
// ledger pairs it to the person's open trial by the standing 1:1 rule, which
// flips the row to Converted on the page.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { annualPriceId } from '@/lib/offers-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

async function audit(action: string, personKey: string | null, customerId: string | null, detail: Record<string, unknown>) {
  try {
    await db().from('admin_actions').insert({ action, person_key: personKey, customer_id: customerId, detail })
  } catch (e) {
    console.error('[charge-annual] audit insert failed:', e)
  }
}

export async function POST(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { customerId?: string; personKey?: string; chargeId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const customerId = (body.customerId || '').trim()
  const personKey = (body.personKey || '').trim() || null
  const chargeId = (body.chargeId || '').trim()
  if (!customerId.startsWith('cus_') || !chargeId) {
    return NextResponse.json({ error: 'customerId and chargeId are required' }, { status: 400 })
  }

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return NextResponse.json({ error: 'Stripe key missing' }, { status: 500 })
  const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 1 })

  try {
    // GUARD 1: the retry list is people with ZERO subscriptions. If Stripe
    // says otherwise, this row is mis-segmented and the answer is no.
    const existing = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 })
    const live = existing.data.filter(s => ['active', 'trialing', 'past_due'].includes(s.status))
    if (live.length > 0) {
      await audit('charge_annual_refused', personKey, customerId, { reason: 'already has a live subscription', subscription: live[0].id, status: live[0].status, trial_charge_id: chargeId })
      return NextResponse.json({ error: `refused: this customer already has a ${live[0].status} subscription (${live[0].id}). They belong in "person already pays", not the retry list.` }, { status: 409 })
    }

    // GUARD 2: a card to charge. Prefer the customer's default, fall back to
    // their most recent saved card (the checkout saves it with
    // setup_future_usage, so trial buyers normally have one).
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) {
      await audit('charge_annual_refused', personKey, customerId, { reason: 'customer deleted', trial_charge_id: chargeId })
      return NextResponse.json({ error: 'refused: customer is deleted in Stripe' }, { status: 409 })
    }
    let pm = typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id ?? null
    if (!pm) {
      const cards = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
      pm = cards.data[0]?.id ?? null
    }
    if (!pm) {
      await audit('charge_annual_refused', personKey, customerId, { reason: 'no card on file', trial_charge_id: chargeId })
      return NextResponse.json({ error: 'refused: no card on file for this customer' }, { status: 409 })
    }

    // THE CHARGE. error_if_incomplete means a decline creates nothing at all;
    // the idempotency key means clicking twice cannot subscribe twice.
    const sub = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: annualPriceId() }],
        default_payment_method: pm,
        payment_behavior: 'error_if_incomplete',
        metadata: { source: 'admin_retry_button', trial_charge_id: chargeId, person_key: personKey ?? '' },
      },
      { idempotencyKey: `annual-retry-${chargeId}` },
    )

    await audit('charge_annual_created', personKey, customerId, { subscription: sub.id, status: sub.status, price: annualPriceId(), trial_charge_id: chargeId })
    return NextResponse.json({ ok: true, subscription: sub.id, status: sub.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Stripe error'
    await audit('charge_annual_failed', personKey, customerId, { error: msg, trial_charge_id: chargeId })
    // A decline surfaces here (error_if_incomplete throws): the card said no,
    // nothing was created, and the row stays in the retry list.
    return NextResponse.json({ error: msg }, { status: 402 })
  }
}
