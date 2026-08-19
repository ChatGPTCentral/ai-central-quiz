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
  // The guarantee band's CTA was reading ov('riskFree.ctaLabel', …) without a
  // slot registered, so isSlotKey dropped it and that button silently ignored
  // every experiment. A CTA test that misses one of four buttons is not a test.
  'riskFree.ctaLabel':  { label: 'Guarantee band · CTA label', hint: 'unlock all tutorials' },

  // ── LANDING PAGE ────────────────────────────────────────────────────
  // The first slot outside /result, because the biggest leak in the funnel is
  // not on /result. Over 14 days about 640 people from the top three sources
  // saw the landing page and never answered question 1, against 26 lost at the
  // email step. Desktop converts 45.8% to a quiz start, mobile 60.5%, on twice
  // the traffic.
  //
  // A MODE slot, not a copy slot: the value selects a rendering, the way
  // result_sellfirst_v2 selects a section order. 'share' is today's page.
  'landing.secondaryCta': {
    label: 'Landing (desktop) · button under the pass card',
    hint: "share | quiz  ('share' = today's LinkedIn button, 'quiz' = a second quiz CTA)",
  },

  // Read by app/page.tsx since entry_microcopy_v1, never registered here, so
  // isSlotKey dropped it and that experiment rendered control to BOTH arms for
  // its whole life. Same class of bug as riskFree.ctaLabel above. The rule this
  // proves: a slot the page READS must exist here, or the test is a placebo.
  'landing.effortNote': {
    label: 'Landing · effort line under the CTA',
    hint: 'free, no card, 40 seconds',
  },

  // Desktop is two thirds of landings and starts the quiz 15 points below
  // mobile, six weeks running. Mobile's edge is its ORDER, not its size:
  // headline, one button, reward after. A MODE slot: 'onecol' rebuilds the
  // desktop hero in that order. Mobile renders identically either way.
  'landing.desktopLayout': {
    label: 'Landing (desktop) · hero layout',
    hint: "twocol | onecol  ('twocol' = today's split hero, 'onecol' = mobile's order at desktop scale)",
  },
}

export type SlotKey = keyof typeof EXPERIMENT_SLOTS

export function isSlotKey(k: string): k is SlotKey {
  return Object.prototype.hasOwnProperty.call(EXPERIMENT_SLOTS, k)
}
