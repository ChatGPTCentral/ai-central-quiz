// Whitelist of copy slots an experiment variant may override on the LIVE v2
// /result page.
//
// Single source of truth for BOTH the admin editor's dropdown AND the
// server-side validation of variant overrides (mirrors the ALLOWED_DB_COLUMNS
// pattern in the form-config admin route). Values are plain strings and may use
// the page's {firstName}/{persona} tokens. Checkout hrefs and prices are NOT
// slots — structurally impossible to override.
//
// These slots map to the v2 page anatomy and all sit on the Complete→Checkout
// step (the biggest funnel leak), so an experiment here moves the metric that
// matters. (The old v1 hero/chart/radar/pricing/final slots were removed with
// the v1 page.)

export const EXPERIMENT_SLOTS: Record<string, { label: string; hint: string }> = {
  'offerCard.headline': { label: 'Offer card · headline', hint: 'Get everything in the video, $4.99 first month' },
  'offerCard.ctaLabel': { label: 'Offer card · CTA label', hint: 'start my trial' },
  'offerBar.ctaLabel':  { label: 'Offer bar (bottom) · CTA label', hint: 'Claim offer ↗' },
  'studyPlan.ctaLabel': { label: 'Study plan · CTA label', hint: 'unlock my study plan' },
}

export type SlotKey = keyof typeof EXPERIMENT_SLOTS

export function isSlotKey(k: string): k is SlotKey {
  return Object.prototype.hasOwnProperty.call(EXPERIMENT_SLOTS, k)
}
