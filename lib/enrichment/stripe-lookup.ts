// Stripe customer lookup by email — finds the Stripe customer and sums
// successful charges to compute lifetime $ paid.
//
// Used as a v2 pipeline stage. Search API + charges pagination — both reads.
// Env: STRIPE_SECRET_KEY (add to Vercel; restricted key with read access to
// Customers + Charges is sufficient).

import Stripe from 'stripe'

let _client: Stripe | null = null
function client(): Stripe | null {
  if (_client) return _client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  _client = new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
  return _client
}

export interface StripeLookupResult {
  customerId: string
  lifetimeValueUsd: number
  raw: { customer: unknown; chargeCount: number }
}

/**
 * Find the Stripe customer matching `email` (case-insensitive) and sum
 * all paid, non-refunded charge amounts → USD lifetime value.
 * Returns null if no customer found or the API key is missing.
 */
export async function findStripeCustomerByEmail(email: string): Promise<StripeLookupResult | null> {
  const stripe = client()
  if (!stripe) {
    console.warn('[stripe-lookup] STRIPE_SECRET_KEY not set — skipping')
    return null
  }
  if (!email) return null

  try {
    // Search is case-insensitive on email and returns most-recent first
    const search = await stripe.customers.search({
      query: `email:"${email.replace(/"/g, '\\"')}"`,
      limit: 1,
    })
    const customer = search.data[0]
    if (!customer) return null

    // Page through every successful charge for this customer.
    let total = 0
    let chargeCount = 0
    for await (const charge of stripe.charges.list({ customer: customer.id, limit: 100 })) {
      if (!charge.paid || charge.refunded || charge.status !== 'succeeded') continue
      // amount is in the smallest unit of the charge currency. Stripe also
      // exposes `amount_refunded` which we subtract out for partial refunds.
      const net = (charge.amount - (charge.amount_refunded || 0))
      // Stripe amounts use the smallest unit (cents for USD). All AI Central
      // products are priced in USD so we treat amount as cents directly.
      total += net / 100
      chargeCount++
    }

    return {
      customerId: customer.id,
      lifetimeValueUsd: Math.round(total * 100) / 100,
      raw: { customer, chargeCount },
    }
  } catch (err) {
    console.error('[stripe-lookup] threw:', err)
    return null
  }
}
