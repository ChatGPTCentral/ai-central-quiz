// AI Readiness Type — the named "who you are" headline on the result page,
// keyed by the AI Adoption Ladder stage (lib/segmentation-v2). Modeled on
// The Rundown's "Architect · 23% share this type" result card, but the hook
// is the reader's PLACE in global AI adoption: a named type + a percentile
// ("ahead of ~X% of people") + the dot-matrix (components/result/AdoptionGauge).
//
// Percentiles are illustrative, tied to the global-adoption picture (~18% of
// working-age adults use AI regularly, ~71% have never tried ChatGPT): higher
// rung ⇒ ahead of more people. Refine against a cited source later if wanted.

import type { StageKey } from './segmentation-v2'
import { PERSONA_CONTENT } from './persona-content'

export interface ReadinessType {
  /** Named type shown as the big result headline. */
  typeName: string
  /** One bold, optimistic line under the name. */
  tagline: string
  /** "You're ahead of ~{aheadPct}% of people." 0–100. */
  aheadPct: number
}

// typeName MUST equal the ladder rung label (from stageDef / the result-page
// ladder) so the h1 matches the highlighted "You are here" rung exactly.
const TYPES: Record<StageKey, ReadinessType> = {
  S0_unaware: {
    typeName: 'Unaware',
    tagline: "You're right at the starting line, and that's a great place to be.",
    aheadPct: 40,
  },
  S1_curious: {
    typeName: 'Curious',
    tagline: "You've started looking. Most people haven't even done that.",
    aheadPct: 62,
  },
  S2_experimenter: {
    typeName: 'Experimenter',
    tagline: "You're already hands-on. Now we turn dabbling into a habit.",
    aheadPct: 76,
  },
  S3_practitioner: {
    typeName: 'Practitioner',
    tagline: 'You use AI for real work every week. You are in rare company.',
    aheadPct: 86,
  },
  S4_power_user: {
    typeName: 'Power User',
    tagline: "AI is woven into your day. You're operating near the frontier.",
    aheadPct: 93,
  },
  S5_builder: {
    typeName: 'Builder',
    tagline: 'You build with AI. You sit in the top sliver of all professionals.',
    aheadPct: 98,
  },
  unknown: {
    typeName: 'Rising Professional',
    tagline: "You're on your way, and already ahead of most people.",
    aheadPct: 60,
  },
}

/** Resolve the readiness type for a stage, defaulting to `unknown`. */
export function readinessType(stage: string | undefined | null): ReadinessType {
  return TYPES[(stage as StageKey)] ?? TYPES.unknown
}

// ── Trait hashtags (Rundown-style #tags under the type name) ──────────

const PERSONA_TRAITS: Record<string, string[]> = {
  decision_maker: ['#Strategic', '#Senior'],
  operator: ['#Growth', '#ROI-first'],
  maker: ['#Technical', '#Builder'],
  learner: ['#Curious', '#Rising'],
  unknown: ['#Professional'],
}

const FRICTION_TRAIT: Record<string, string> = {
  no_starting_point: '#Needs-a-map',
  no_time: '#Time-poor',
  too_noisy: '#Signal-over-noise',
  no_trust: '#Show-me-proof',
  cant_build: '#Ready-to-build',
  no_friction: '#Unblocked',
}

const INTENT_TRAIT: Record<string, string> = {
  learn_basics: '#Foundations',
  use_more: '#Scaling-up',
  first_automation: '#Automating',
  ship_to_customers: '#Shipping',
  teach_team: '#Team-lead',
}

/**
 * 3–4 trait hashtags: the persona's two traits, plus one each for friction and
 * 30-day intent when known. De-duped, capped at 4.
 */
export function traitTags(
  persona: string | undefined | null,
  friction?: string | null,
  intent?: string | null,
): string[] {
  const key = persona && persona in PERSONA_CONTENT ? persona : 'unknown'
  const tags = [...(PERSONA_TRAITS[key] ?? PERSONA_TRAITS.unknown)]
  if (friction && FRICTION_TRAIT[friction]) tags.push(FRICTION_TRAIT[friction])
  if (intent && INTENT_TRAIT[intent]) tags.push(INTENT_TRAIT[intent])
  return Array.from(new Set(tags)).slice(0, 4)
}
