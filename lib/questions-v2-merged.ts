// Survey v2 — the merged 10-question quiz.
//
// Replaces 4 weak v1 questions (aiLevel, learningStyle, timeCommitment,
// mainGoal) with 5 strong v2 questions (frequency, depth, momentum,
// friction, intent_30d), keeps the 4 high-value v1 questions
// (name, email, workArea, aiTools, jobLevel), uses aiTools count as
// breadth_score, and adds 1 net question.
//
// Order: the proven production flow (email second — captures the lead
// early and keeps the funnel smooth), with the handoff's editorial shell
// on top:
//   identity (name, email) →
//   high-engagement middle (frequency, aiTools, depth) →
//   reflective single-clicks (momentum, friction) →
//   persona anchors (workArea, jobLevel) →
//   commitment close (intent_30d)

import type { V2Question } from './form-schema'
export type { V2Question, V2QuestionType, V2Option, V2DbColumn, BranchingRule, BranchingCondition, BranchingOp } from './form-schema'

export const QUESTIONS_V2_MERGED: V2Question[] = [
  // ── Identity ────────────────────────────────────────────────────
  {
    id: 'name',
    type: 'split-text',
    label: "First, what's your name?",
    sublabel: 'It goes on your member pass, spelled exactly like this',
    required: true,
    dbColumn: 'name',
    firstFieldLabel: 'First name',
    firstFieldPlaceholder: 'John',
    secondFieldLabel: 'Last name',
    secondFieldPlaceholder: 'Doe',
  },
  {
    id: 'email',
    type: 'email',
    label: "What's your email address?",
    sublabel: 'We use this to send you your personalized AI plan',
    required: true,
    placeholder: 'name@example.com',
    dbColumn: 'email',
  },

  // ── Stage signal: objective AI usage ───────────────────────────
  {
    id: 'frequency',
    type: 'chips',
    label: 'How often did you use AI tools in the last 7 days?',
    required: true,
    dbColumn: 'frequency_score',
    scoring: 'value',
    options: [
      { label: 'Not once',             value: '0', score: 0 },
      { label: 'One or two times',     value: '1', score: 1 },
      { label: 'Most days',            value: '2', score: 2 },
      { label: 'Multiple times a day', value: '3', score: 3 },
    ],
  },

  {
    id: 'aiTools',
    type: 'multi-chips',
    label: 'Which AI tools have you used?',
    sublabel: 'Tap all that apply',
    required: true,
    dbColumn: 'ai_tools',
    scoring: 'csv',  // also writes ai_tools as CSV; breadth_score = length
    options: [
      { label: 'ChatGPT',    value: 'ChatGPT',    logo: '/logos/chatgpt_logo.svg' },
      { label: 'Claude',     value: 'Claude',     logo: '/logos/claude_logo.svg' },
      { label: 'Gemini',     value: 'Gemini',     logo: '/logos/gemini-color.svg' },
      { label: 'Copilot',    value: 'Copilot',    logo: '/logos/copilot-icon.svg' },
      { label: 'Perplexity', value: 'Perplexity', logo: '/logos/perplexity_logo.svg' },
      { label: 'Cursor',     value: 'Cursor',     logo: '/logos/cursor.svg' },
      { label: 'Lovable',    value: 'Lovable',    logo: '/logos/lovable-color.svg' },
      { label: 'Midjourney', value: 'Midjourney', logo: '/logos/midjourney.svg' },
      { label: 'Runway',     value: 'Runway',     logo: '/logos/runway.svg' },
      { label: 'ElevenLabs', value: 'ElevenLabs', logo: '/logos/elevenlabs_logo.svg' },
      { label: 'NotebookLM', value: 'NotebookLM', logo: '/logos/notebooklm.svg' },
      { label: 'n8n',        value: 'n8n',        logo: '/logos/n8n-color.svg' },
      { label: 'Zapier',     value: 'Zapier',     logo: '/logos/zapier_logo.webp' },
      { label: 'Notion AI',  value: 'Notion AI',  logo: '/logos/notion.svg' },
      { label: 'Canva AI',   value: 'Canva AI',   logo: '/logos/canva-icon.svg' },
      { label: 'None yet',   value: 'None',       emoji: '🚫' },
    ],
  },

  {
    id: 'depth',
    type: 'multi-chips',
    label: 'Which of these have you actually done with AI?',
    sublabel: "Pick everything you've done at least once",
    required: true,
    dbColumn: 'depth_score',
    scoring: 'count',
    options: [
      { label: 'Asked ChatGPT, Claude, or Gemini a question',                                value: 'asked' },
      { label: 'Saved a prompt to reuse later',                                              value: 'saved_prompt' },
      { label: 'Used AI to make a real decision (research, hire, pricing, strategy)',        value: 'decided' },
      { label: 'Built a custom GPT or Claude Project',                                       value: 'custom_gpt' },
      { label: 'Connected AI to another tool (Zapier, n8n, API)',                            value: 'connected' },
      { label: 'Shipped something AI-powered to a customer or team',                         value: 'shipped' },
    ],
  },

  // ── Velocity ───────────────────────────────────────────────────
  {
    id: 'momentum',
    type: 'chips',
    label: 'Compared to 6 months ago, your AI usage is…',
    required: true,
    dbColumn: 'momentum',
    scoring: 'value',
    options: [
      { label: 'Much less',       value: '-2', score: -2 },
      { label: 'A bit less',      value: '-1', score: -1 },
      { label: 'About the same',  value: '0',  score: 0  },
      { label: 'A bit more',      value: '1',  score: 1  },
      { label: 'A lot more',      value: '2',  score: 2  },
    ],
  },

  // ── Sales hook ─────────────────────────────────────────────────
  {
    id: 'friction',
    type: 'chips',
    label: "What's slowing you down?",
    sublabel: 'The biggest thing keeping you from going further',
    required: true,
    dbColumn: 'friction',
    scoring: 'enum',
    options: [
      { label: "I don't know where to start",                value: 'no_starting_point', emoji: '🤷' },
      { label: "I don't have time to figure it out",         value: 'no_time',           emoji: '⏳' },
      { label: 'Too many tools, too much noise',             value: 'too_noisy',         emoji: '🌪️' },
      { label: "I don't trust the outputs",                  value: 'no_trust',          emoji: '🛑' },
      { label: "I want to build something but don't know how", value: 'cant_build',      emoji: '🏗️' },
      { label: "Nothing, I'm flying",                        value: 'no_friction',       emoji: '✈️' },
    ],
  },

  // ── Persona ────────────────────────────────────────────────────
  {
    id: 'workArea',
    type: 'multi-chips',
    label: 'What area of work do you want AI to help with most?',
    sublabel: 'Tap all that apply',
    required: true,
    dbColumn: 'work_area',
    scoring: 'csv',
    options: [
      { label: 'Marketing',           value: 'Marketing' },
      { label: 'Sales',               value: 'Sales' },
      { label: 'Business operations', value: 'Business operations' },
      { label: 'Coding',              value: 'Coding' },
      { label: 'Data analytics',      value: 'Data analytics' },
      { label: 'Project management',  value: 'Project management' },
      { label: 'Consulting',          value: 'Consulting' },
      { label: 'Research',            value: 'Research' },
      { label: 'Writing',             value: 'Writing' },
      { label: 'Finance',             value: 'Finance' },
      { label: 'Legal',               value: 'Legal' },
      { label: 'Government',          value: 'Government' },
      { label: 'Reading / UX',        value: 'Reading/UX' },
      { label: 'Student',             value: 'Student' },
    ],
  },

  {
    id: 'jobLevel',
    type: 'chips',
    label: 'What is your current job level?',
    required: true,
    dbColumn: 'job_level',
    options: [
      { label: 'Founder',                value: 'Founder' },
      { label: 'C-Suite',                value: 'C-Suite' },
      { label: 'VP / Director',          value: 'VP/Director' },
      { label: 'Manager',                value: 'Manager' },
      { label: 'Individual contributor', value: 'Individual contributor' },
      { label: 'Student or intern',      value: 'Student or intern' },
      { label: 'Other',                  value: 'Other' },
    ],
  },

  // ── Commitment close ──────────────────────────────────────────
  {
    id: 'intent_30d',
    type: 'chips',
    label: 'In the next 30 days, what do you actually want to do?',
    required: true,
    dbColumn: 'intent_30d',
    scoring: 'enum',
    options: [
      { label: 'Learn the basics',                       value: 'learn_basics' },
      { label: 'Use AI more in my day job',              value: 'use_more' },
      { label: 'Build my first automation',              value: 'first_automation' },
      { label: 'Ship something AI-powered to customers', value: 'ship_to_customers' },
      { label: 'Teach my team or company',               value: 'teach_team' },
    ],
  },

]

// ── Score formula (replaces lib/score.ts:calculateAIScore for v2) ─

export function calculateScoreV2(opts: {
  frequencyScore?: number  // 0..3
  depthScore?: number      // 0..6 (now includes "decided")
  breadthScore?: number    // 0..N (count of named tools, excluding 'None')
}): number {
  const fq = opts.frequencyScore ?? 0
  const dp = opts.depthScore ?? 0
  const br = opts.breadthScore ?? 0
  // Each axis normalized to 0..1, weighted 30/40/30
  const fqN = Math.min(fq / 3, 1)
  const dpN = Math.min(dp / 5, 1)   // 5 not 6 — "decided" is bonus, full at 5
  const brN = Math.min(br / 5, 1)
  const raw = fqN * 30 + dpN * 40 + brN * 30
  // Map 0..100 → 5..95 so the lowest score isn't 0 (ugly UX)
  return Math.round(5 + (raw / 100) * 90)
}

// ── Form → DB value converter ────────────────────────────────────

export interface V2DbValues {
  name?: string
  email?: string
  ai_tools?: string         // CSV
  work_area?: string        // CSV
  job_level?: string
  frequency_score?: number
  depth_score?: number
  breadth_score?: number
  momentum?: number
  friction?: string
  intent_30d?: string
}

export function answersToDb(
  answers: Record<string, string | string[]>,
  questions: V2Question[] = QUESTIONS_V2_MERGED,
): V2DbValues {
  const out: V2DbValues = {}
  for (const q of questions) {
    if (!q.dbColumn) continue
    const raw = answers[q.id]
    if (raw === undefined) continue

    if (q.scoring === 'csv' && Array.isArray(raw)) {
      const joined = raw.join(', ')
      if (q.dbColumn === 'ai_tools') {
        out.ai_tools = joined
        // breadth_score = count of distinct tools excluding 'None'
        out.breadth_score = raw.filter(v => v !== 'None').length
      } else if (q.dbColumn === 'work_area') {
        out.work_area = joined
      }
    } else if (q.scoring === 'count' && Array.isArray(raw)) {
      // depth_score = count of selections
      out.depth_score = raw.length
    } else if (q.scoring === 'value' && typeof raw === 'string') {
      const n = Number(raw)
      if (!Number.isNaN(n)) {
        if (q.dbColumn === 'frequency_score') out.frequency_score = n
        else if (q.dbColumn === 'momentum') out.momentum = n
      }
    } else if (q.scoring === 'enum' && typeof raw === 'string') {
      if (q.dbColumn === 'friction') out.friction = raw
      else if (q.dbColumn === 'intent_30d') out.intent_30d = raw
    } else if (typeof raw === 'string') {
      if (q.dbColumn === 'name')     out.name = raw
      else if (q.dbColumn === 'email')    out.email = raw.toLowerCase().trim()
      else if (q.dbColumn === 'job_level') out.job_level = raw
    }
  }
  return out
}
