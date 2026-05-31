// Segment-aware copy for the result/landing page. Maps the v2 survey
// signals (stage, persona, friction, intent_30d) into personalized
// headline lines, CTA copy, and accent treatment.
//
// Every map gracefully falls back: if a value is missing or unrecognized,
// returns sensible defaults so non-v2 rows still get a polished page.

import type { StageKey, PersonaKey } from './segmentation-v2'

// ── Friction → "your blocker, decoded" copy ───────────────────────

export interface FrictionCopy {
  /** Short tag shown as a chip near the hero */
  badge: string
  /** Hero subhead overrides the generic one */
  heroSubhead: string
  /** The "your blocker" block that sits above the pricing module */
  blockerTitle: string
  blockerBody: string
  /** Tailored CTA text */
  ctaText: string
}

export const FRICTION_COPY: Record<string, FrictionCopy> = {
  no_starting_point: {
    badge: 'You said: I don\'t know where to start',
    heroSubhead: 'Good. We start in the first 5 minutes',
    blockerTitle: 'You don\'t need more options. You need a starting line.',
    blockerBody: 'Most people who say "I don\'t know where to start" are actually buried in options. We built the library as a sequenced path: open one tutorial, ship one workflow, then the next. You\'ll have your first win within 15 minutes of opening the door.',
    ctaText: 'Show me my first step',
  },
  no_time: {
    badge: 'You said: I don\'t have time',
    heroSubhead: 'Every tutorial earns its 15 minutes',
    blockerTitle: 'Time is the constraint. We respect it.',
    blockerBody: 'Every workflow in the library is timed to under 30 minutes of focused work. No theory chapters. No "watch this 2-hour course first." Open a tutorial Monday morning, ship the workflow before lunch, save 5 hours that week. The math compounds.',
    ctaText: 'Show me 15-minute wins',
  },
  too_noisy: {
    badge: 'You said: too many tools, too much noise',
    heroSubhead: 'Curated by editors. No noise',
    blockerTitle: 'You don\'t need more tools. You need a shorter list.',
    blockerBody: 'There are 14,000+ AI tools. Most are forgettable. Our editorial team tests, sorts, and ranks the ones worth your attention, organized by what you\'re actually trying to do. You skip the noise and walk straight to what works.',
    ctaText: 'Get the shortlist',
  },
  no_trust: {
    badge: 'You said: I don\'t trust the outputs',
    heroSubhead: 'Trust is a workflow problem. We solve it',
    blockerTitle: 'Outputs you can stand behind.',
    blockerBody: 'Untrustworthy AI is almost always untrustworthy *prompts*. Every tutorial includes verified prompts with guardrails, source-citation patterns, and review steps so you can ship outputs you\'d sign your name to. Most members tell us their first "wow" moment was an output they actually trusted.',
    ctaText: 'Show me the verified prompts',
  },
  cant_build: {
    badge: 'You said: I want to build but don\'t know how',
    heroSubhead: 'Your first build is mapped. Step by step',
    blockerTitle: 'You\'re not stuck. You\'re one tutorial away.',
    blockerBody: 'Every "I want to build something" we\'ve heard maps to a tutorial we\'ve already built. Custom GPTs, n8n flows, Zapier chains, full agent stacks. Pick the one closest to what you want to ship, follow the steps, deploy. You\'ll have a v1 in your hands by Friday.',
    ctaText: 'Show me how to build it',
  },
  no_friction: {
    badge: 'You said: nothing\'s slowing you down',
    heroSubhead: 'Then you\'re ready for the deep cuts',
    blockerTitle: 'You\'re already moving. We\'ll keep you ahead.',
    blockerBody: 'You don\'t need an intro to AI. You need the edge cases, the new tools, the frontier patterns. Our advanced track delivers weekly: agent architectures, multi-model orchestration, exclusive tool drops, founder-tier deep-dives. The library is your moat.',
    ctaText: 'Show me the advanced track',
  },
}

// ── Intent → primary CTA copy ─────────────────────────────────────

export const INTENT_CTA: Record<string, string> = {
  learn_basics:       'Start my AI foundations',
  use_more:           'Plug AI into my day-job',
  first_automation:   'Build my first automation',
  ship_to_customers:  'Ship something AI-powered',
  teach_team:         'Lead my team into AI',
}

export function ctaForIntent(intent: string | undefined | null): string {
  if (!intent) return 'View my custom learning plan'
  return INTENT_CTA[intent] || 'View my custom learning plan'
}

// ── Stage → ladder label (for the hero ladder visual) ─────────────

export const STAGE_LABEL: Record<StageKey, string> = {
  S0_unaware:       'You\'re standing at the start',
  S1_curious:       'You\'re curious. Today we get specific',
  S2_experimenter:  'You\'ve experimented. Time to systemize',
  S3_practitioner:  'You use AI weekly. Let\'s deepen',
  S4_power_user:    'You\'re a power user. Let\'s sharpen',
  S5_builder:       'You\'re a builder. Let\'s scale',
  unknown:          'Let\'s find your level',
}

// ── Persona → tutorial / tool ordering hints ──────────────────────

export const PERSONA_LANE: Record<PersonaKey, { lane: string; hook: string }> = {
  decision_maker: {
    lane:  'leadership',
    hook:  'Built for senior decision-makers like you',
  },
  operator: {
    lane:  'growth',
    hook:  'Built for operators who need ROI, not theory',
  },
  maker: {
    lane:  'technical',
    hook:  'Built for makers who actually ship',
  },
  learner: {
    lane:  'foundations',
    hook:  'Built for early-career professionals on the rise',
  },
  unknown: {
    lane:  'general',
    hook:  'Built for professionals serious about AI',
  },
}

// ── Helper: pull all the segment-aware copy in one call ───────────

export function getSegmentCopy(opts: {
  stage?: string | null
  persona?: string | null
  friction?: string | null
  intent?: string | null
}) {
  const stage = (opts.stage || 'unknown') as StageKey
  const persona = (opts.persona || 'unknown') as PersonaKey
  return {
    stageLabel: STAGE_LABEL[stage] || STAGE_LABEL.unknown,
    personaLane: PERSONA_LANE[persona] || PERSONA_LANE.unknown,
    friction: opts.friction ? FRICTION_COPY[opts.friction] : null,
    ctaText: ctaForIntent(opts.intent),
  }
}
