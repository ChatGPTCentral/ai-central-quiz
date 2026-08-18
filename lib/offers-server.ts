// Finding the lifetime price, without making anyone paste an id into Vercel.
//
// The first cut of this required STRIPE_LIFETIME_PRICE_ID to be set by hand.
// That is a config step standing between a decision and it being live, and the
// failure mode is silent: forget it and India quietly keeps seeing the trial.
//
// So the price is found the way a person would find it: look on the library
// product for an active, one-time, USD price at the lifetime amount. Create it
// once in Stripe and it is picked up, no deploy, no variable. The env var still
// wins when set, for the day we want to point at a specific price.
//
// Server only. lib/offers.ts stays pure because client components import the
// copy from it, and the Stripe SDK must never follow them into the bundle.

import Stripe from 'stripe'
import { LIFETIME_OFFER } from '@/lib/offers'

/**
 * The lifetime price that already exists: $49.75 one-time, on the product
 * "📚 The AI Library 2.0 / Lifetime", and the price behind the owner's
 * existing payment link buy.stripe.com/7sIcQe7NAgLT8s8008.
 *
 * Named here the same way the $4.99 trial price is named in the checkout
 * routes, for the same reasons: it is deterministic, it costs no Stripe call
 * on the result page, and there is nothing to configure before the offer
 * works. The env var still overrides it.
 *
 * My first cut hunted for this price on the wrong product and found nothing,
 * so the offer sat dark waiting for a price that was already sold every day.
 */
const DEFAULT_LIFETIME_PRICE = 'price_1QJdLFBLsgHOvWxyA11vAlSh'

/** Products that carry lifetime pricing, searched if the price above is ever
 *  retired. The lifetime lives on its own product, NOT on the subscription
 *  product the trial is sold from. */
const LIFETIME_PRODUCTS = [
  process.env.STRIPE_LIFETIME_PRODUCT_ID || 'prod_RC1ORmdESrFqvc',
  'prod_SNEjXShn2LU06z',
]

/** Cached for ten minutes per instance. This is read on the result page, which
 *  is the hottest path we have, so it must not become a Stripe call per view.
 *  A null answer is cached too: a missing price should not be retried on every
 *  render, it should keep the page on the trial and stay cheap. */
let cache: { at: number; id: string | null } | null = null
const TTL_MS = 10 * 60 * 1000

export function lifetimePriceIdSync(): string | null {
  return process.env.STRIPE_LIFETIME_PRICE_ID?.trim() || DEFAULT_LIFETIME_PRICE
}

/**
 * The Stripe price id for the lifetime, or null if there is not one.
 *
 * Null is a normal answer, not an error: it means nobody has created the price
 * yet, and every caller treats that as "sell the trial". A wrong charge is the
 * only outcome that must be impossible, so a lookup that fails falls back to
 * the trial rather than guessing.
 */
/**
 * The annual prices that live renewals actually use, BY TRIAL PLAN.
 * Owner's rule, 2026-08-13: a $3.99 trial belongs to the $39.75/year plan and
 * a $4.99 trial to the $59.75/year plan. Both ids verified against live
 * subscriptions the same day: the five most recent $59.75 actives all carry
 * price_1TSKdg…, and a renewing $39.75 subscription (billed again 2026-08-13)
 * carries price_1RSUGD…, both on product prod_SNEjXShn2LU06z. Several other
 * prices at these amounts exist on legacy products and are NOT these.
 * An unmapped trial amount returns null, and the caller must refuse:
 * charging the wrong plan is the one outcome that must be impossible.
 */
const DEFAULT_ANNUAL_PRICE = 'price_1TSKdgBLsgHOvWxyBBkoqoqS'
const DEFAULT_ANNUAL_399_PRICE = 'price_1RSUGDBLsgHOvWxybWEikZKa'
export function annualPriceForTrialCents(trialCents: number): { id: string; cents: number } | null {
  if (trialCents === 499) return { id: process.env.STRIPE_ANNUAL_PRICE_ID?.trim() || DEFAULT_ANNUAL_PRICE, cents: 5975 }
  // Founding-window list-price trials ($14.95, 2026-08-18) renew at the same
  // $59.75 annual as the $4.99 founding rate: one product, two entry prices.
  if (trialCents === 1495) return { id: process.env.STRIPE_ANNUAL_PRICE_ID?.trim() || DEFAULT_ANNUAL_PRICE, cents: 5975 }
  if (trialCents === 399) return { id: process.env.STRIPE_ANNUAL_399_PRICE_ID?.trim() || DEFAULT_ANNUAL_399_PRICE, cents: 3975 }
  return null
}

export async function resolveLifetimePriceId(): Promise<string | null> {
  // The known price, which is the normal path and costs nothing.
  const named = lifetimePriceIdSync()
  if (named) return named

  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.id

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) { cache = { at: now, id: null }; return null }

  try {
    const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 1 })
    for (const product of LIFETIME_PRODUCTS) {
      const prices = await stripe.prices.list({ product, active: true, limit: 100 })
      const match = prices.data.find(
        p => p.type === 'one_time' && p.currency === 'usd' && p.unit_amount === LIFETIME_OFFER.cents,
      )
      if (match) { cache = { at: now, id: match.id }; return match.id }
    }
    cache = { at: now, id: null }
    return null
  } catch {
    // A Stripe hiccup must not take the result page down, and must not sell
    // anything at a price we could not confirm.
    cache = { at: now, id: null }
    return null
  }
}
