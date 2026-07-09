// Whitelist of copy slots an experiment variant may override on /result.
//
// Single source of truth for BOTH the admin editor's dropdown AND the
// server-side validation of variant overrides (mirrors the
// ALLOWED_DB_COLUMNS pattern in the form-config admin route). Values are
// plain strings and may use the page's {firstName}/{persona} tokens; the
// hero headline may additionally use {aheadPct}. Checkout hrefs and prices
// are NOT slots — structurally impossible to override.

export const EXPERIMENT_SLOTS: Record<string, { label: string; hint: string }> = {
  'offerBar.ctaLabel': { label: 'Offer bar · CTA label', hint: 'Claim offer ↗' },
  'hero.headline':     { label: 'Hero · headline', hint: "{firstName}, you're ahead of {aheadPct} of people on their AI journey" },
  'hero.lead':         { label: 'Hero · lead paragraph', hint: 'per-rung heroLead copy' },
  'hero.ctaLabel':     { label: 'Hero · CTA label', hint: 'start my trial' },
  'chart.ctaLabel':    { label: 'Adoption chart · CTA label', hint: 'Unlock the Ultimate AI Library' },
  'radar.ctaLabel':    { label: 'Radar · CTA label', hint: 'close the gap' },
  'pricing.headline':  { label: 'Pricing · headline', hint: "Less than the coffee you'll drink reading about AI" },
  'pricing.badge':     { label: 'Pricing · badge', hint: 'MOST POPULAR · 30-DAY GUARANTEE' },
  'pricing.ctaLabel':  { label: 'Pricing · CTA label', hint: 'start my 1-month trial' },
  'final.title':       { label: 'Final band · title', hint: 'per-rung finalTitle copy' },
  'final.ctaLabel':    { label: 'Final band · CTA label', hint: 'start your trial for $4.99' },
}

export type SlotKey = keyof typeof EXPERIMENT_SLOTS

export function isSlotKey(k: string): k is SlotKey {
  return Object.prototype.hasOwnProperty.call(EXPERIMENT_SLOTS, k)
}
