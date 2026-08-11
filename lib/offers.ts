// What we ask a visitor to pay, and where that depends on where they are.
//
// THE REASON THIS EXISTS (owner, 2026-08-11, and the numbers agree):
// India has 45 trials, 42 of them long past their renewal date, and ZERO
// renewals. Not a low rate, zero. Every other market with volume runs 33-75%
// (US 62.6, UK 68.6, Saudi 75.0). So the $4.99 trial in India collects $4.99
// once and nothing ever again, and every one of those people has to be chased
// for a renewal that never comes. Selling the library outright instead means
// the money is real on the day and there is nobody to chase.
//
// One table, so "which offer does this person see" has a single answer that
// the result page, the checkout and the ledger all read. Adding a country is
// one line here, which is the whole point: India is first, not special.

export type OfferKey = 'trial' | 'lifetime'

export interface Offer {
  key: OfferKey
  /** Sticker price, exactly as it should be printed. */
  price: string
  /** Cents, for anything that has to do arithmetic. */
  cents: number
  /** What comes after the price on a CTA: "for 4 weeks", "one time". */
  term: string
  /** The button. */
  cta: string
  /** One line under the button, the promise in plain words. */
  reassurance: string
  /** How the guarantee reads for this offer. */
  guarantee: string
  /** True when nothing is charged again, ever. Drives the copy that makes
   *  this offer worth having: no renewal, no chase, no cancellation to
   *  remember. */
  oneTime: boolean
}

export const TRIAL_OFFER: Offer = {
  key: 'trial',
  price: '$4.99',
  cents: 499,
  term: 'for 4 weeks',
  cta: 'Get instant access',
  reassurance: '$4.99 for 4 weeks, cancel any time',
  guarantee: 'If the library is not useful to you, reply to any of our emails inside 30 days and we return the $4.99. No form, no reason needed.',
  oneTime: false,
}

export const LIFETIME_OFFER: Offer = {
  key: 'lifetime',
  price: '$49.75',
  cents: 4975,
  term: 'one time, yours for good',
  cta: 'Get lifetime access',
  reassurance: 'One payment, no renewal, nothing to cancel',
  guarantee: 'If the library is not useful to you, reply to any of our emails inside 30 days and we return the $49.75 in full. No form, no reason needed.',
  oneTime: true,
}

/**
 * Countries that get the lifetime instead of the trial.
 *
 * ISO-3166 alpha-2, matching the x-vercel-ip-country header. Keep this list
 * evidence-led: a country belongs here once its trials have stopped renewing,
 * not because it feels like a weak market.
 */
export const LIFETIME_COUNTRIES = new Set<string>(['IN'])

/**
 * The offer for a visitor.
 *
 * `lifetimeAvailable` is the safety catch. The lifetime price lives in Stripe
 * behind STRIPE_LIFETIME_PRICE_ID, and if that is not configured then showing
 * lifetime copy would put a "$49.75, yours for good" button in front of a
 * $4.99 subscription checkout. So when the price is missing, India simply sees
 * the normal page: a wrong charge is the one outcome that must be impossible.
 */
export function offerForCountry(country: string | null | undefined, lifetimeAvailable: boolean): Offer {
  if (!lifetimeAvailable) return TRIAL_OFFER
  const cc = (country || '').trim().toUpperCase()
  return LIFETIME_COUNTRIES.has(cc) ? LIFETIME_OFFER : TRIAL_OFFER
}

/** Where a visitor is sent when the embedded modal cannot load. Our own
 *  checkout page, never a static Stripe link: the page resolves the price
 *  server-side from the same offer, so the fallback cannot end up charging
 *  something different from what the visitor was just promised. */
export function checkoutPathFor(offer: Offer, submissionId?: string | null): string {
  const p = new URLSearchParams()
  if (offer.key !== 'trial') p.set('offer', offer.key)
  if (submissionId) p.set('id', submissionId)
  const qs = p.toString()
  return `/checkout${qs ? `?${qs}` : ''}`
}

export function offerByKey(key: string | undefined | null): Offer {
  return key === 'lifetime' ? LIFETIME_OFFER : TRIAL_OFFER
}
