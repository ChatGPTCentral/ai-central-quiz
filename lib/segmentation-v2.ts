// Sandbox: Laddered Stage + Persona segmentation.
//
// Parallel to lib/segmentation.ts. Writes to new columns. Original
// `segment` system is untouched.
//
// Two axes:
//   1. Stage (S0..S5) — mutable, the AI-adoption ladder. People flow
//      between stages over time. This is the segment that "moves".
//   2. Persona — mostly fixed role context (Decision Maker / Operator
//      / Maker / Learner). Cross-tab with Stage gives "Operators stuck
//      at S2" type insights.
//
// Survey v2 will add: frequency, depth, breadth, momentum, friction,
// intent_30d. For now we INFER stage from existing aiLevel + aiTools +
// behavioural signals (Stripe customer, Beehiiv active) so we can
// backfill all 2,419 rows.

import type { StoredSubmission } from './kv'

// ── Stage ladder ─────────────────────────────────────────────────

export type StageKey =
  | 'S0_unaware'
  | 'S1_curious'
  | 'S2_experimenter'
  | 'S3_practitioner'
  | 'S4_power_user'
  | 'S5_builder'
  | 'unknown'

export interface StageDef {
  key: StageKey
  label: string
  emoji: string
  color: string
  score: number  // 0..5; unknown = -1
  /** Plain-English description shown in tooltips & settings */
  description: string
  /** Sales/marketing hook for this stage */
  salesHook: string
}

export const STAGES: StageDef[] = [
  {
    key: 'S0_unaware',
    label: 'Unaware',
    emoji: '🌑',
    color: '#9C9C9C',
    score: 0,
    description: 'No AI usage. Not on the ladder yet.',
    salesHook: 'Awareness content · "why this matters" · zero-friction first taste',
  },
  {
    key: 'S1_curious',
    label: 'Curious',
    emoji: '🌱',
    color: '#E7B02F',
    score: 1,
    description: 'Heard about AI. Hasn\'t used it.',
    salesHook: 'Onboarding nurture · "first 5 minutes with ChatGPT" · free starter content',
  },
  {
    key: 'S2_experimenter',
    label: 'Experimenter',
    emoji: '🧪',
    color: '#E48715',
    score: 2,
    description: 'Plays with ChatGPT occasionally. No habit yet.',
    salesHook: 'Use-case libraries · "how I use AI for X" · habit-forming weekly emails',
  },
  {
    key: 'S3_practitioner',
    label: 'Practitioner',
    emoji: '⚙️',
    color: '#62A758',
    score: 3,
    description: 'Uses AI weekly for real work.',
    salesHook: 'Workflow templates · ROI case studies · standard subscription tier',
  },
  {
    key: 'S4_power_user',
    label: 'Power User',
    emoji: '🚀',
    color: '#046BB1',
    score: 4,
    description: 'Daily AI. Multiple tools. Saved prompts.',
    salesHook: 'Advanced workflow content · premium tier · power-user community',
  },
  {
    key: 'S5_builder',
    label: 'Builder',
    emoji: '🏗️',
    color: '#3B4C99',
    score: 5,
    description: 'Ships AI workflows, automations, custom GPTs.',
    salesHook: 'API access · agent frameworks · co-build partnerships · enterprise tier',
  },
  {
    key: 'unknown',
    label: 'Unknown',
    emoji: '👻',
    color: '#E8E4DF',
    score: -1,
    description: 'No quiz data + no behavioural signal yet. Enrich first.',
    salesHook: 'Run ✨ Enrich · then re-stage',
  },
]

const STAGES_BY_KEY: Record<StageKey, StageDef> = Object.fromEntries(
  STAGES.map(s => [s.key, s]),
) as Record<StageKey, StageDef>

export function stageDef(key: string | undefined | null): StageDef | undefined {
  if (!key) return undefined
  return STAGES_BY_KEY[key as StageKey]
}

// ── Persona facet (mostly fixed) ─────────────────────────────────

export type PersonaKey =
  | 'decision_maker'
  | 'operator'
  | 'maker'
  | 'learner'
  | 'unknown'

export interface PersonaDef {
  key: PersonaKey
  label: string
  emoji: string
  color: string
  description: string
}

export const PERSONAS: PersonaDef[] = [
  {
    key: 'decision_maker',
    label: 'Decision Maker',
    emoji: '👑',
    color: '#3B4C99',
    description: 'Founder / C-suite / VP / Director. Buys for the org.',
  },
  {
    key: 'operator',
    label: 'Operator',
    emoji: '🚀',
    color: '#E48715',
    description: 'Marketing / Sales / Growth / Ops. Outcome-focused.',
  },
  {
    key: 'maker',
    label: 'Maker',
    emoji: '🔬',
    color: '#046BB1',
    description: 'Engineer / Designer / Data / Product / Researcher. Builds.',
  },
  {
    key: 'learner',
    label: 'Learner',
    emoji: '📚',
    color: '#E26F8E',
    description: 'Student / intern / career-switcher. Long-game relationship.',
  },
  {
    key: 'unknown',
    label: 'Unknown',
    emoji: '👻',
    color: '#9C9C9C',
    description: 'No role signal. Enrich first.',
  },
]

const PERSONAS_BY_KEY: Record<PersonaKey, PersonaDef> = Object.fromEntries(
  PERSONAS.map(p => [p.key, p]),
) as Record<PersonaKey, PersonaDef>

export function personaDef(key: string | undefined | null): PersonaDef | undefined {
  if (!key) return undefined
  return PERSONAS_BY_KEY[key as PersonaKey]
}

// ── Helpers ──────────────────────────────────────────────────────

const has = (s: string | undefined | null, re: RegExp) => !!s && re.test(s)

function aiToolsList(r: StoredSubmission): string[] {
  return (r.aiTools || '')
    .split(/[,;|]/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s && s !== 'none' && s !== 'n/a')
}

function aiToolsCount(r: StoredSubmission): number {
  return aiToolsList(r).length
}

/** Detect "builder" tooling in the free-text aiTools field. */
function hasBuilderSignal(r: StoredSubmission): boolean {
  const tools = aiToolsList(r).join(' ')
  if (/\b(n8n|zapier|make\.com|api|sdk|claude code|cursor|windsurf|custom gpt|custom-gpt|agent|langchain)\b/i.test(tools)) return true
  if (/\b(engineer|developer|cto|architect|ml|data scientist)\b/i.test(r.jobTitle || '')) return true
  return false
}

// ── Stage inference (works with current quiz fields) ─────────────

/**
 * Infer Stage from whatever signals we have today. When Survey v2
 * lands with frequency/depth/breadth, this function will use those
 * directly. For now we map aiLevel + tool count + behavioural to a
 * best-effort stage.
 */
export function assignStage(r: StoredSubmission): {
  stage: StageKey
  score: number
  reason: string
} {
  const toolCount = aiToolsCount(r)
  const advanced = has(r.aiLevel, /advanced|power user|expert|fluent/i)
  const intermediate = has(r.aiLevel, /intermediate|comfortable|regular/i)
  const beginner = has(r.aiLevel, /beginner|just started|new to|some experience/i)
  const heardOf = has(r.aiLevel, /heard of|aware|familiar/i)
  const never = has(r.aiLevel, /never used|no experience|not yet/i)
  const builds = hasBuilderSignal(r)
  const goalBasics = has(r.mainGoal, /learn the basics|get started|introduction|fundamentals/i)
  const goalBuild = has(r.mainGoal, /build|automate|ship|integrate|develop/i)

  // S5 Builder — strongest signal first
  if (builds && (advanced || intermediate)) {
    return { stage: 'S5_builder', score: 5, reason: `Builder tooling detected · ${r.aiLevel || '—'}` }
  }
  if (advanced && toolCount >= 4) {
    return { stage: 'S5_builder', score: 5, reason: `Advanced · ${toolCount} tools` }
  }

  // S4 Power User
  if (advanced && toolCount >= 2) {
    return { stage: 'S4_power_user', score: 4, reason: `Advanced · ${toolCount} tools` }
  }
  if (advanced) {
    return { stage: 'S4_power_user', score: 4, reason: `Self-reported advanced` }
  }

  // S3 Practitioner
  if (intermediate || (toolCount >= 2 && !beginner && !heardOf && !never)) {
    return { stage: 'S3_practitioner', score: 3, reason: `${r.aiLevel || 'Tools: ' + toolCount}` }
  }
  if (goalBuild && toolCount >= 1) {
    return { stage: 'S3_practitioner', score: 3, reason: `Build intent · ${toolCount} tools` }
  }

  // S2 Experimenter
  if (beginner || (toolCount >= 1 && !goalBasics)) {
    return { stage: 'S2_experimenter', score: 2, reason: r.aiLevel ? r.aiLevel : `${toolCount} tool(s) tried` }
  }

  // S1 Curious
  if (heardOf || goalBasics) {
    return { stage: 'S1_curious', score: 1, reason: `${r.aiLevel || r.mainGoal || 'curious'}` }
  }

  // S0 Unaware
  if (never) {
    return { stage: 'S0_unaware', score: 0, reason: r.aiLevel || '—' }
  }

  // Behavioural fallback: Stripe customers without quiz data probably
  // use AI (they bought an AI newsletter / course). Default them to S2.
  if (r.lifetimeValueUsd && r.lifetimeValueUsd > 0) {
    return { stage: 'S2_experimenter', score: 2, reason: `Paying customer (no quiz data) - - assumed experimenter` }
  }
  if (r.beehiivStatus === 'active') {
    return { stage: 'S1_curious', score: 1, reason: `Active reader (no quiz data) - - assumed curious` }
  }

  return { stage: 'unknown', score: -1, reason: 'No usage signal - - enrich or wait for survey v2' }
}

// ── Persona inference (mostly from seniority + workArea) ─────────

export function assignPersona(r: StoredSubmission): {
  persona: PersonaKey
  reason: string
} {
  // Decision Maker — wins first
  if (has(r.seniority, /^(Founder|C-Suite|VP\/Director)$/)) {
    return { persona: 'decision_maker', reason: `Seniority: ${r.seniority}` }
  }
  if (has(r.jobLevel, /founder|ceo|cfo|cto|coo|cmo|cpo|vp|director|head of|chief/i)) {
    return { persona: 'decision_maker', reason: `Job level: ${r.jobLevel}` }
  }

  // Learner — students / interns
  if (has(r.seniority, /student|intern/i)) {
    return { persona: 'learner', reason: `Seniority: ${r.seniority}` }
  }
  if (has(r.jobLevel, /student|intern|entry/i)) {
    return { persona: 'learner', reason: `Job level: ${r.jobLevel}` }
  }

  // Maker — engineers, designers, data, researchers, product
  if (has(r.workArea, /coding|data|engineering|technical|research|design|product/i)) {
    return { persona: 'maker', reason: `Work area: ${r.workArea}` }
  }
  if (has(r.jobFunction, /engineering|data|product|research|design/i)) {
    return { persona: 'maker', reason: `Function: ${r.jobFunction}` }
  }
  if (has(r.jobTitle, /engineer|developer|designer|researcher|architect|scientist|analyst/i)) {
    return { persona: 'maker', reason: `Title: ${r.jobTitle}` }
  }

  // Operator — marketing, sales, growth, ops
  if (has(r.workArea, /marketing|sales|growth|operation/i)) {
    return { persona: 'operator', reason: `Work area: ${r.workArea}` }
  }
  if (has(r.jobFunction, /marketing|sales|growth|revenue|operation/i)) {
    return { persona: 'operator', reason: `Function: ${r.jobFunction}` }
  }
  if (has(r.jobTitle, /marketing|sales|growth|operations|manager|account exec|coo|cmo|cro/i)) {
    return { persona: 'operator', reason: `Title: ${r.jobTitle}` }
  }

  // Generic Manager (no function signal) → operator by default
  if (r.seniority === 'Manager') {
    return { persona: 'operator', reason: `Manager (function unclear)` }
  }

  // IC with no function → maker (working assumption: they ship things)
  if (r.seniority === 'Individual contributor') {
    return { persona: 'maker', reason: `IC (function unclear)` }
  }

  return { persona: 'unknown', reason: 'No role signal - - enrich first' }
}

// ── Combined ─────────────────────────────────────────────────────

export interface SegmentationV2Result {
  stage: StageKey
  stageScore: number
  stageReason: string
  persona: PersonaKey
  personaReason: string
}

export function assignSegmentationV2(r: StoredSubmission): SegmentationV2Result {
  const s = assignStage(r)
  const p = assignPersona(r)
  return {
    stage: s.stage,
    stageScore: s.score,
    stageReason: s.reason,
    persona: p.persona,
    personaReason: p.reason,
  }
}
