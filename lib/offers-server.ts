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

/** The Ultimate AI Library product, which already carries the one-time prices. */
const LIBRARY_PRODUCT = process.env.STRIPE_LIBRARY_PRODUCT_ID || 'prod_SNEjXShn2LU06z'

/** Cached for ten minutes per instance. This is read on the result page, which
 *  is the hottest path we have, so it must not become a Stripe call per view.
 *  A null answer is cached too: a missing price should not be retried on every
 *  render, it should keep the page on the trial and stay cheap. */
let cache: { at: number; id: string | null } | null = null
const TTL_MS = 10 * 60 * 1000

export function lifetimePriceIdSync(): string | null {
  return process.env.STRIPE_LIFETIME_PRICE_ID?.trim() || null
}

/**
 * The Stripe price id for the lifetime, or null if there is not one.
 *
 * Null is a normal answer, not an error: it means nobody has created the price
 * yet, and every caller treats that as "sell the trial". A wrong charge is the
 * only outcome that must be impossible, so a lookup that fails falls back to
 * the trial rather than guessing.
 */
export async function resolveLifetimePriceId(): Promise<string | null> {
  const fromEnv = lifetimePriceIdSync()
  if (fromEnv) return fromEnv

  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.id

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) { cache = { at: now, id: null }; return null }

  try {
    const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 1 })
    const prices = await stripe.prices.list({ product: LIBRARY_PRODUCT, active: true, limit: 100 })
    const match = prices.data.find(
      p => p.type === 'one_time' && p.currency === 'usd' && p.unit_amount === LIFETIME_OFFER.cents,
    )
    cache = { at: now, id: match?.id ?? null }
    return cache.id
  } catch {
    // A Stripe hiccup must not take the result page down, and must not sell
    // anything at a price we could not confirm.
    cache = { at: now, id: null }
    return null
  }
}
