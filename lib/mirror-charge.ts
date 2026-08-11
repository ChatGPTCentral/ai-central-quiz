// Mirror a single Stripe charge into stripe_charges, immediately.
//
// The charge mirror is the base of the whole revenue chain (trial_ledger →
// /admin/revenue → the dashboard's money rows). It was refreshed by a daily
// cron, which meant a renewal that billed at 11:23 was invisible until the
// next morning: on 2026-08-11 the owner watched two $59.75 renewals land in
// Stripe while the ledger still showed both people unconverted, and reasonably
// asked why the table was not a calculator.
//
// So the webhook now writes each charge as it happens. The daily sweep stays,
// because a webhook can be missed and a full re-walk also picks up refunds.
// Belt and braces: one keeps it live, the other keeps it correct.

import type Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

/**
 * Upsert one charge. Safe to call repeatedly: the charge id is the key, so a
 * webhook retry or an overlap with the daily sweep simply rewrites the row.
 * `stripe` is optional and only used to resolve the customer's own email,
 * which is often different from the billing email on the charge.
 */
export async function mirrorCharge(ch: Stripe.Charge, stripe?: Stripe): Promise<void> {
  if (ch.status !== 'succeeded') return

  let customerEmail: string | null = null
  const customerId = typeof ch.customer === 'string' ? ch.customer : ch.customer?.id ?? null
  if (typeof ch.customer === 'object' && ch.customer && !ch.customer.deleted) {
    customerEmail = ch.customer.email?.toLowerCase() ?? null
  } else if (customerId && stripe) {
    // Non-fatal: the mirror is still correct without it, matching just has one
    // fewer key to work with.
    try {
      const c = await stripe.customers.retrieve(customerId)
      if (!('deleted' in c) || !c.deleted) customerEmail = (c as Stripe.Customer).email?.toLowerCase() ?? null
    } catch { /* leave null */ }
  }

  await db().from('stripe_charges').upsert({
    id: ch.id,
    amount_cents: ch.amount,
    currency: ch.currency,
    charged_at: new Date(ch.created * 1000).toISOString(),
    customer_id: customerId,
    email: (ch.billing_details?.email || ch.receipt_email || null)?.toLowerCase() ?? null,
    customer_email: customerEmail,
    refunded: ch.refunded === true,
    description: ch.description ?? null,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'id' })
}
