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
import { annualPriceForTrialCents } from '@/lib/offers-server'

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

  let body: { customerId?: string; personKey?: string; chargeId?: string; mode?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const customerId = (body.customerId || '').trim()
  const personKey = (body.personKey || '').trim() || null
  const chargeId = (body.chargeId || '').trim()
  // 'charge' bills the payment method on file right now. 'invoice' is the
  // fallback for people with nothing reusable on file (a one-time Link or
  // wallet payment, common on beehiiv-era trials): the subscription is
  // created with an emailed Stripe invoice they pay themselves — the same
  // thing the Stripe dashboard offers on such customers.
  const mode: 'charge' | 'invoice' = body.mode === 'invoice' ? 'invoice' : 'charge'
  if (!customerId.startsWith('cus_') || !chargeId) {
    return NextResponse.json({ error: 'customerId and chargeId are required' }, { status: 400 })
  }

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return NextResponse.json({ error: 'Stripe key missing' }, { status: 500 })
  const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 1 })

  // THE PLAN MATCH (owner, 2026-08-13): a $3.99 trial gets the $39.75/year
  // plan, a $4.99 trial the $59.75/year plan. The price is chosen from the
  // TRIAL CHARGE ON RECORD, read server-side — never from anything the client
  // sends — because charging the wrong plan is the one outcome that must be
  // impossible. 240 of the retry rows are $3.99 trials, so before this guard
  // the button would have overcharged the majority of the list.
  const { data: trialCharge } = await db().from('stripe_charges').select('amount_cents').eq('id', chargeId).maybeSingle()
  const trialCents = Number(trialCharge?.amount_cents ?? 0)
  const plan = annualPriceForTrialCents(trialCents)
  if (!plan) {
    await audit('charge_annual_refused', personKey, customerId, { reason: 'no annual plan mapped for this trial amount', trial_cents: trialCents, trial_charge_id: chargeId })
    return NextResponse.json({ error: `refused: trial charge has amount ${trialCents} cents, which maps to no annual plan` }, { status: 409 })
  }

  // GUARD -1: a hand-set state on this trial means a human already judged it
  // (refunded, dispute, hold, whatever it says). The button is for untouched
  // rows only; charging past a manual judgment is how a disputed customer
  // gets charged again (owner, 2026-08-16).
  {
    const { data: ov } = await db().from('trial_state_overrides').select('state').eq('charge_id', chargeId).maybeSingle()
    if (ov?.state && ov.state !== 'auto') {
      await audit('charge_annual_refused', personKey, customerId, { reason: 'manual state override', override: ov.state, trial_charge_id: chargeId })
      return NextResponse.json({ error: `refused: this trial is hand-marked "${ov.state}". The button only touches rows without a manual judgment.` }, { status: 409 })
    }
  }

  // GUARD 0: the person must pay us NOTHING outside trial prices, anywhere —
  // any customer id, any era. The subscription check below cannot see a
  // lifetime (a one-time charge) or a legacy plan under an older customer id;
  // rebert's April-2025 $49.87 lifetime with a July trial under a different
  // customer id is exactly the case (owner, 2026-08-13). The mirror knows.
  {
    const nonTrial = '(399,499,5474)'
    const [byCust, byEmail, byCustEmail] = await Promise.all([
      db().from('stripe_charges').select('amount_cents, charged_at').eq('customer_id', customerId).eq('refunded', false).not('amount_cents', 'in', nonTrial).limit(1),
      personKey ? db().from('stripe_charges').select('amount_cents, charged_at').ilike('email', personKey).eq('refunded', false).not('amount_cents', 'in', nonTrial).limit(1) : Promise.resolve({ data: [] }),
      personKey ? db().from('stripe_charges').select('amount_cents, charged_at').ilike('customer_email', personKey).eq('refunded', false).not('amount_cents', 'in', nonTrial).limit(1) : Promise.resolve({ data: [] }),
    ])
    const other = (byCust.data?.[0] || byEmail.data?.[0] || byCustEmail.data?.[0]) as { amount_cents: number; charged_at: string } | undefined
    if (other) {
      await audit('charge_annual_refused', personKey, customerId, { reason: 'person already pays outside trial plans', other_cents: other.amount_cents, other_at: other.charged_at, trial_charge_id: chargeId })
      return NextResponse.json({ error: `refused: this person already paid $${(other.amount_cents / 100).toFixed(2)} on ${other.charged_at.slice(0, 10)} outside the trial plans (lifetime or legacy subscription). They belong in "person already pays".` }, { status: 409 })
    }
  }

  try {
    // GUARD 1: the retry list is people with ZERO subscriptions. If Stripe
    // says otherwise, this row is mis-segmented and the answer is no.
    const existing = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 })
    const live = existing.data.filter(s => ['active', 'trialing', 'past_due'].includes(s.status))
    if (live.length > 0) {
      await audit('charge_annual_refused', personKey, customerId, { reason: 'already has a live subscription', subscription: live[0].id, status: live[0].status, trial_charge_id: chargeId })
      return NextResponse.json({ error: `refused: this customer already has a ${live[0].status} subscription (${live[0].id}). They belong in "person already pays", not the retry list.` }, { status: 409 })
    }

    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) {
      await audit('charge_annual_refused', personKey, customerId, { reason: 'customer deleted', trial_charge_id: chargeId })
      return NextResponse.json({ error: 'refused: customer is deleted in Stripe' }, { status: 409 })
    }

    // ── INVOICE MODE: no payment method needed. The subscription starts on
    // an emailed Stripe invoice the person pays themselves, finalized and
    // sent right now rather than on Stripe's one-hour timer. A hosted invoice
    // page is an interactive Stripe payment form — it can complete a 3D
    // Secure challenge the same way a Checkout Session can, so this is also
    // the correct link for the outreach board (owner, 2026-08-20: "can't we
    // generate the invoices and then use the invoice links" — right, this
    // already existed, no new mechanism needed). ──
    if (mode === 'invoice') {
      const sub = await stripe.subscriptions.create(
        {
          customer: customerId,
          items: [{ price: plan.id }],
          collection_method: 'send_invoice',
          days_until_due: 7,
          metadata: { source: 'admin_retry_button_invoice', trial_charge_id: chargeId, person_key: personKey ?? '' },
        },
        { idempotencyKey: `annual-retry-inv-${chargeId}` },
      )
      let invoiceSent = false
      let invoiceUrl: string | null = null
      try {
        const invId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id
        if (invId) {
          try { await stripe.invoices.finalizeInvoice(invId) } catch { /* already finalized is fine */ }
          await stripe.invoices.sendInvoice(invId)
          invoiceSent = true
          // Re-retrieve rather than trust the pre-send object: finalizing is
          // what stamps hosted_invoice_url onto the invoice.
          const finalInv = await stripe.invoices.retrieve(invId)
          invoiceUrl = finalInv.hosted_invoice_url ?? null
        }
      } catch (e) {
        console.error('[charge-annual] invoice send failed (Stripe will auto-send later):', e)
      }
      await audit('charge_annual_invoiced', personKey, customerId, { subscription: sub.id, status: sub.status, price: plan.id, plan_cents: plan.cents, invoice_sent: invoiceSent, invoice_url: invoiceUrl, trial_charge_id: chargeId })
      return NextResponse.json({ ok: true, subscription: sub.id, status: sub.status, planCents: plan.cents, invoiced: true, invoiceSent, invoiceUrl })
    }

    // GUARD 2 (charge mode): something reusable to bill. The default payment
    // method first, else any attached card, Link or PayPal (the checkout
    // saves cards with setup_future_usage; Link riders often attach too), and
    // a legacy default_source counts because the subscription create resolves
    // it on its own. A one-time payment method from a past charge is NOT
    // reusable and does not appear here — that is what invoice mode is for.
    let pm = typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id ?? null
    if (!pm) {
      const pms = await stripe.paymentMethods.list({ customer: customerId, limit: 10 })
      const rank = (t: string) => (t === 'card' ? 0 : t === 'link' ? 1 : t === 'paypal' ? 2 : 9)
      const usable = pms.data.filter(p => rank(p.type) < 9).sort((a, b) => rank(a.type) - rank(b.type))
      pm = usable[0]?.id ?? null
    }
    const hasLegacySource = !!customer.default_source
    if (!pm && !hasLegacySource) {
      await audit('charge_annual_refused', personKey, customerId, { reason: 'no reusable payment method', trial_charge_id: chargeId })
      return NextResponse.json({ error: 'refused: no reusable payment method on file — their trial was paid with a one-time method, so there is nothing to bill. Email them a Stripe invoice instead.' }, { status: 409 })
    }

    // THE CHARGE. error_if_incomplete means a decline creates nothing at all;
    // the idempotency key means clicking twice cannot subscribe twice.
    const sub = await stripe.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: plan.id }],
        ...(pm ? { default_payment_method: pm } : {}),
        payment_behavior: 'error_if_incomplete',
        metadata: { source: 'admin_retry_button', trial_charge_id: chargeId, person_key: personKey ?? '' },
      },
      { idempotencyKey: `annual-retry-${chargeId}` },
    )

    await audit('charge_annual_created', personKey, customerId, { subscription: sub.id, status: sub.status, price: plan.id, plan_cents: plan.cents, trial_cents: trialCents, trial_charge_id: chargeId })
    return NextResponse.json({ ok: true, subscription: sub.id, status: sub.status, planCents: plan.cents })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Stripe error'
    await audit('charge_annual_failed', personKey, customerId, { error: msg, trial_charge_id: chargeId })
    // A decline surfaces here (error_if_incomplete throws): the card said no,
    // nothing was created, and the row stays in the retry list.
    return NextResponse.json({ error: msg }, { status: 402 })
  }
}
