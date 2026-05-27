// Persona segmentation — socio-demo-psycho-behavioural buckets.
//
// Each person gets EXACTLY ONE segment via priority-ordered rules.
// Money is NEVER an input. LTV / conversion / ARPU are downstream
// metrics we compute PER SEGMENT to answer "which persona converts
// best?" — defining a segment by LTV would short-circuit that question.
//
// Edit SEGMENTS to refine. The reassign endpoint re-classifies every
// row when rules change.

import type { StoredSubmission } from './kv'

export type SegmentKey =
  | 'decision_maker'
  | 'growth_operator'
  | 'technical_builder'
  | 'ai_power_user'
  | 'mid_career_operator'
  | 'curious_beginner'
  | 'student_early_career'
  | 'unclassified'

export interface SegmentDef {
  key: SegmentKey
  label: string
  emoji: string
  color: string
  priority: number
  /** Boolean: does this row match the segment? */
  detect: (r: StoredSubmission) => boolean
  /** Human-readable WHY this row matched */
  reason: (r: StoredSubmission) => string
  /** Internal sales note — surfaces on detail page */
  salesHypothesis: string
}

// ── Helpers ──────────────────────────────────────────────────────

const matchesAny = (s: string | undefined | null, re: RegExp) => !!s && re.test(s)
const aiToolsCount = (r: StoredSubmission) =>
  (r.aiTools || '').split(',').map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'none').length
const isAdvancedAI = (r: StoredSubmission) =>
  matchesAny(r.aiLevel, /advanced|power user|expert/i)
const isBeginnerAI = (r: StoredSubmission) =>
  matchesAny(r.aiLevel, /never used|heard of|beginner|just started|new to/i) ||
  matchesAny(r.mainGoal, /learn the basics|get started|introduction/i)

// ── Segments (priority order — first match wins) ────────────────

export const SEGMENTS: SegmentDef[] = [
  {
    key: 'decision_maker',
    label: 'Senior Decision Maker',
    emoji: '👑',
    color: '#3B4C99',
    priority: 1,
    detect: r => {
      if (matchesAny(r.seniority, /^(Founder|C-Suite|VP\/Director)$/)) return true
      if (matchesAny(r.jobLevel, /executive|founder|ceo|cfo|cto|coo|cmo|cpo|vp|director|head of/i)) return true
      return false
    },
    reason: r => `Seniority: ${r.seniority || r.jobLevel || '—'}`,
    salesHypothesis: 'High-leverage outreach · strategic-content briefings · advisory-call invites · enterprise tier',
  },
  {
    key: 'growth_operator',
    label: 'Growth Operator',
    emoji: '🚀',
    color: '#E48715',
    priority: 2,
    detect: r => {
      if (matchesAny(r.workArea, /marketing|sales|growth/i)) return true
      if (matchesAny(r.jobFunction, /marketing|sales|growth|revenue/i)) return true
      if (matchesAny(r.jobTitle, /marketing|sales|growth|account exec|bdr|sdr|cmo|cro/i)) return true
      return false
    },
    reason: r => `Function: ${r.workArea || r.jobFunction || r.jobTitle || '—'}`,
    salesHypothesis: 'Automation playbooks · ROI case studies · funnel templates · weekly tactical content',
  },
  {
    key: 'technical_builder',
    label: 'Technical Builder',
    emoji: '🔬',
    color: '#046BB1',
    priority: 3,
    detect: r => {
      if (matchesAny(r.workArea, /coding|data analytics|engineering|technical|research/i)) return true
      if (matchesAny(r.jobFunction, /engineering|data|product|research/i)) return true
      if (matchesAny(r.jobTitle, /engineer|developer|programmer|swe|data scientist|data analyst|architect|cto|researcher/i)) return true
      return false
    },
    reason: r => `Function: ${r.workArea || r.jobFunction || r.jobTitle || '—'}`,
    salesHypothesis: 'API access · agent frameworks · open-source integrations · deep-dive content',
  },
  {
    key: 'ai_power_user',
    label: 'AI Power User',
    emoji: '🧠',
    color: '#62A758',
    priority: 4,
    detect: r => isAdvancedAI(r) && aiToolsCount(r) >= 3,
    reason: r => `AI level: ${r.aiLevel || '—'} · ${aiToolsCount(r)} tools in use`,
    salesHypothesis: 'Advanced workflow content · premium tier · beta access · power-user community',
  },
  {
    key: 'mid_career_operator',
    label: 'Mid-Career Operator',
    emoji: '💼',
    color: '#2D8879',
    priority: 5,
    detect: r => {
      if (r.seniority === 'Manager') return true
      if (matchesAny(r.jobLevel, /mid|manager|senior\b/i)) return true
      return false
    },
    reason: r => `Career: ${r.seniority || r.jobLevel || '—'}`,
    salesHypothesis: 'Pragmatic ROI content · team-rollout playbooks · standard subscription tier',
  },
  {
    key: 'curious_beginner',
    label: 'Curious Beginner',
    emoji: '🌱',
    color: '#E7B02F',
    priority: 6,
    detect: r => isBeginnerAI(r),
    reason: r => `AI level: ${r.aiLevel || '—'} · goal: ${r.mainGoal || '—'}`,
    salesHypothesis: 'Onboarding nurture · bite-sized education · free tier funnel',
  },
  {
    key: 'student_early_career',
    label: 'Student / Early-Career',
    emoji: '📚',
    color: '#E26F8E',
    priority: 7,
    detect: r => {
      if (r.seniority === 'Student or intern') return true
      if (matchesAny(r.jobLevel, /student|intern|entry|junior/i)) return true
      return false
    },
    reason: r => `Career stage: ${r.seniority || r.jobLevel || '—'}`,
    salesHypothesis: 'Educational content · student discounts · long-term-relationship play',
  },
  {
    key: 'unclassified',
    label: 'Unclassified',
    emoji: '👻',
    color: '#9C9C9C',
    priority: 8,
    detect: () => true,  // catch-all
    reason: () => 'Insufficient signals — enrich for a clearer persona',
    salesHypothesis: 'Run ✨ Enrich · then re-segment · quarterly nurture in the meantime',
  },
]

const BY_KEY: Record<SegmentKey, SegmentDef> = Object.fromEntries(
  SEGMENTS.map(s => [s.key, s]),
) as Record<SegmentKey, SegmentDef>

/** Resolve segment for a row. Priority-ordered, first match wins. */
export function assignSegment(r: StoredSubmission): { segment: SegmentKey; score: number; reason: string } {
  for (const s of SEGMENTS) {
    if (s.detect(r)) {
      return { segment: s.key, score: s.priority, reason: s.reason(r) }
    }
  }
  // Unreachable — 'unclassified' is the catch-all
  return { segment: 'unclassified', score: 8, reason: 'fallback' }
}

export function segmentDef(key: string | undefined | null): SegmentDef | undefined {
  if (!key) return undefined
  return BY_KEY[key as SegmentKey]
}
