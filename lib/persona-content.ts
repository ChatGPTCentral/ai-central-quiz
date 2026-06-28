// Persona-keyed presentation content for the result page.
//
// This is the single role-content layer. It replaces the old archetype
// system (lib/archetypes.ts) — the 4 archetypes mapped 1:1 onto the v2
// personas (decision_maker←executive_strategist, operator←growth_operator,
// maker←technical_pioneer, learner←practical_learner), so the copy/keywords
// live on here keyed by PersonaKey. Classification itself lives in
// lib/segmentation-v2.ts (assignPersona); this file is display only.

import type { PersonaKey } from './segmentation-v2'

export interface PersonaContent {
  /** Customer-facing role label (e.g. used in the doc-search heading). */
  label: string
  /** Optimistic, forward-looking outlook shown on the result page — frames
   *  where this persona is headed with AI (2-3 sentences). */
  outlook: string
  /** Keywords that bias the Notion doc search on the result page. */
  tutorialKeywords: string[]
  /** Accent color for role-themed UI (matches the PersonaDef color). */
  accentColor: string
}

export const PERSONA_CONTENT: Record<PersonaKey, PersonaContent> = {
  decision_maker: {
    label: 'Decision Maker',
    outlook: 'You think in outcomes, and that is exactly what AI rewards now. The leaders who wire it into how their team decides and ships this year will set the pace everyone else chases. You are early enough to be one of them, and that head start compounds into a lasting advantage for your whole organization.',
    tutorialKeywords: ['leader', 'executive', 'strategy', 'ceo', 'cfo', 'founder', 'decision', 'report', 'presentation', 'deck', 'board', 'meeting', 'plan', 'team', 'manage', 'business', 'finance'],
    accentColor: '#3B4C99',
  },
  operator: {
    label: 'Operator',
    outlook: 'You already know how to make things move. AI is the multiplier that lets a lean operator out-produce whole teams on pipeline, content, and campaigns. The next year belongs to the people who build it into their workflow first, and you are right on time to be one of them.',
    tutorialKeywords: ['marketing', 'sales', 'lead', 'campaign', 'content', 'email', 'linkedin', 'ad', 'seo', 'growth', 'carousel', 'newsletter', 'outreach', 'cold', 'crm', 'funnel', 'copy', 'brand'],
    accentColor: '#E48715',
  },
  maker: {
    label: 'Maker',
    outlook: 'You are holding the most leverage a builder has ever been handed. Agents, automations, and custom tools that used to need a whole team now take an afternoon. Start compounding that edge now and you will be shipping things in a weekend that most teams still quote in months.',
    tutorialKeywords: ['code', 'build', 'agent', 'automation', 'workflow', 'n8n', 'zapier', 'api', 'mcp', 'claude code', 'cursor', 'replit', 'github', 'data', 'analytics', 'developer', 'app', 'website'],
    accentColor: '#046BB1',
  },
  learner: {
    label: 'Learner',
    outlook: 'You are closer to the front of this than you think. Most people have not started at all, so learning the fundamentals now lets you skip the overwhelm and build a durable edge while the field is still wide open. The best time to start was last year. The second best time is today.',
    tutorialKeywords: ['save time', 'beginner', 'start', 'first', 'easy', 'simple', 'productivity', 'everyday', 'guide', 'basics', 'how to', 'free', 'tools', 'learn', 'tutorial'],
    accentColor: '#E26F8E',
  },
  unknown: {
    label: 'AI Professional',
    outlook: 'You are early, and that is the whole advantage. The people who learn AI now will spend the next decade a step ahead of everyone still waiting on the sidelines. You are already moving while most of the world has not started.',
    tutorialKeywords: ['save time', 'beginner', 'start', 'guide', 'basics', 'productivity', 'tools', 'learn', 'tutorial', 'workflow'],
    accentColor: '#9C9C9C',
  },
}

/** Resolve persona content with a safe fallback to the `unknown` default. */
export function personaContent(key: string | undefined | null): PersonaContent {
  return PERSONA_CONTENT[(key as PersonaKey)] ?? PERSONA_CONTENT.unknown
}
