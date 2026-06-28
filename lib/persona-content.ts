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
  /** Keywords that bias the Notion doc search on the result page. */
  tutorialKeywords: string[]
  /** Accent color for role-themed UI (matches the PersonaDef color). */
  accentColor: string
}

export const PERSONA_CONTENT: Record<PersonaKey, PersonaContent> = {
  decision_maker: {
    label: 'Decision Maker',
    tutorialKeywords: ['leader', 'executive', 'strategy', 'ceo', 'cfo', 'founder', 'decision', 'report', 'presentation', 'deck', 'board', 'meeting', 'plan', 'team', 'manage', 'business', 'finance'],
    accentColor: '#3B4C99',
  },
  operator: {
    label: 'Operator',
    tutorialKeywords: ['marketing', 'sales', 'lead', 'campaign', 'content', 'email', 'linkedin', 'ad', 'seo', 'growth', 'carousel', 'newsletter', 'outreach', 'cold', 'crm', 'funnel', 'copy', 'brand'],
    accentColor: '#E48715',
  },
  maker: {
    label: 'Maker',
    tutorialKeywords: ['code', 'build', 'agent', 'automation', 'workflow', 'n8n', 'zapier', 'api', 'mcp', 'claude code', 'cursor', 'replit', 'github', 'data', 'analytics', 'developer', 'app', 'website'],
    accentColor: '#046BB1',
  },
  learner: {
    label: 'Learner',
    tutorialKeywords: ['save time', 'beginner', 'start', 'first', 'easy', 'simple', 'productivity', 'everyday', 'guide', 'basics', 'how to', 'free', 'tools', 'learn', 'tutorial'],
    accentColor: '#E26F8E',
  },
  unknown: {
    label: 'AI Professional',
    tutorialKeywords: ['save time', 'beginner', 'start', 'guide', 'basics', 'productivity', 'tools', 'learn', 'tutorial', 'workflow'],
    accentColor: '#9C9C9C',
  },
}

/** Resolve persona content with a safe fallback to the `unknown` default. */
export function personaContent(key: string | undefined | null): PersonaContent {
  return PERSONA_CONTENT[(key as PersonaKey)] ?? PERSONA_CONTENT.unknown
}
