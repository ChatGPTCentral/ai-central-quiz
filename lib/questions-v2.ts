// Survey v2 — the 6 new questions that detect AI-adoption STAGE and
// transition velocity. Designed to slot into the existing /quiz flow
// later; for now they live in the sandbox so we can validate the
// question copy and scoring rules against ourselves first.

export type V2QuestionType = 'chips' | 'multi-chips'

export interface V2QuestionOption {
  label: string
  value: string
  emoji?: string
  /** Numeric score this option contributes (for chips that map to a score). */
  score?: number
}

export interface V2Question {
  id: 'frequency' | 'depth' | 'breadth' | 'momentum' | 'friction' | 'intent_30d'
  type: V2QuestionType
  label: string
  sublabel?: string
  required: boolean
  options: V2QuestionOption[]
  /** Which column this question writes to */
  dbColumn: 'frequency_score' | 'depth_score' | 'breadth_score' | 'momentum' | 'friction' | 'intent_30d'
  /** Whether the value is the count of selections (multi) or a single option's score */
  scoring: 'count' | 'value' | 'enum'
}

export const QUESTIONS_V2: V2Question[] = [
  // 1. Frequency — last 7 days
  {
    id: 'frequency',
    type: 'chips',
    label: 'How often did you use AI tools in the last 7 days?',
    required: true,
    dbColumn: 'frequency_score',
    scoring: 'value',
    options: [
      { label: 'Not once', value: '0', emoji: '🌑', score: 0 },
      { label: 'One or two times', value: '1', emoji: '🌱', score: 1 },
      { label: 'Most days', value: '2', emoji: '☀️', score: 2 },
      { label: 'Multiple times a day', value: '3', emoji: '🚀', score: 3 },
    ],
  },

  // 2. Depth — tick all that apply
  {
    id: 'depth',
    type: 'multi-chips',
    label: "What's actually in your AI toolkit?",
    sublabel: 'Tick everything you\'ve done at least once - - count is what matters',
    required: false,
    dbColumn: 'depth_score',
    scoring: 'count',
    options: [
      { label: 'Asked ChatGPT, Claude, or Gemini a question', value: 'asked' },
      { label: 'Saved a prompt to reuse later', value: 'saved_prompt' },
      { label: 'Built a custom GPT or Claude Project', value: 'custom_gpt' },
      { label: 'Connected AI to another tool (Zapier, n8n, an API)', value: 'connected' },
      { label: 'Shipped something AI-powered to a customer or your team', value: 'shipped' },
    ],
  },

  // 3. Breadth — named tools (count distinct ticks)
  {
    id: 'breadth',
    type: 'multi-chips',
    label: 'Which AI tools do you actively use?',
    sublabel: 'Count of named tools = breadth signal',
    required: false,
    dbColumn: 'breadth_score',
    scoring: 'count',
    options: [
      { label: 'ChatGPT', value: 'chatgpt' },
      { label: 'Claude', value: 'claude' },
      { label: 'Gemini', value: 'gemini' },
      { label: 'Perplexity', value: 'perplexity' },
      { label: 'Cursor', value: 'cursor' },
      { label: 'Lovable / v0', value: 'lovable' },
      { label: 'Midjourney', value: 'midjourney' },
      { label: 'ElevenLabs', value: 'elevenlabs' },
      { label: 'NotebookLM', value: 'notebooklm' },
      { label: 'n8n / Zapier AI', value: 'automation' },
      { label: 'Custom API work', value: 'api' },
    ],
  },

  // 4. Momentum
  {
    id: 'momentum',
    type: 'chips',
    label: 'Compared to six months ago, your AI usage is…',
    required: true,
    dbColumn: 'momentum',
    scoring: 'value',
    options: [
      { label: 'Much less', value: '-1', emoji: '📉', score: -1 },
      { label: 'About the same', value: '0', emoji: '➖', score: 0 },
      { label: 'More', value: '1', emoji: '📈', score: 1 },
      { label: 'A lot more', value: '2', emoji: '🚀', score: 2 },
    ],
  },

  // 5. Friction
  {
    id: 'friction',
    type: 'chips',
    label: "What's slowing you down?",
    sublabel: 'The biggest thing keeping you from going further with AI',
    required: true,
    dbColumn: 'friction',
    scoring: 'enum',
    options: [
      { label: "I don't know where to start", value: 'no_starting_point', emoji: '🤷' },
      { label: "I don't have time to figure it out", value: 'no_time', emoji: '⏳' },
      { label: 'Too many tools, too much noise', value: 'too_noisy', emoji: '🌪️' },
      { label: "I don't trust the outputs", value: 'no_trust', emoji: '🛑' },
      { label: "I want to build something but don't know how", value: 'cant_build', emoji: '🏗️' },
      { label: "Nothing - - I'm flying", value: 'no_friction', emoji: '✈️' },
    ],
  },

  // 6. 30-day intent
  {
    id: 'intent_30d',
    type: 'chips',
    label: 'In the next 30 days, what do you actually want to do?',
    required: true,
    dbColumn: 'intent_30d',
    scoring: 'enum',
    options: [
      { label: 'Learn the basics', value: 'learn_basics', emoji: '🌱' },
      { label: 'Use AI more in my day job', value: 'use_more', emoji: '⚙️' },
      { label: 'Build my first automation', value: 'first_automation', emoji: '🔌' },
      { label: 'Ship something AI-powered to customers', value: 'ship_to_customers', emoji: '🚀' },
      { label: 'Teach my team or company', value: 'teach_team', emoji: '👥' },
    ],
  },
]

// ── Scoring helpers ──────────────────────────────────────────────

export interface V2Answers {
  frequency_score?: number    // 0..3
  depth_score?: number        // 0..5 (count of ticks)
  breadth_score?: number      // 0..N (count of tools)
  momentum?: number           // -1..2
  friction?: string           // enum
  intent_30d?: string         // enum
}

/** Convert UI form state (Record<questionId, string | string[]>) into the
 * typed V2Answers shape ready to write to the DB. */
export function answersToV2(answers: Record<string, string | string[]>): V2Answers {
  const out: V2Answers = {}
  for (const q of QUESTIONS_V2) {
    const raw = answers[q.id]
    if (raw === undefined) continue
    if (q.scoring === 'count' && Array.isArray(raw)) {
      const dbKey = q.dbColumn as 'depth_score' | 'breadth_score'
      out[dbKey] = raw.length
    } else if (q.scoring === 'value' && typeof raw === 'string') {
      const n = Number(raw)
      if (!Number.isNaN(n)) {
        const dbKey = q.dbColumn as 'frequency_score' | 'momentum'
        out[dbKey] = n
      }
    } else if (q.scoring === 'enum' && typeof raw === 'string') {
      const dbKey = q.dbColumn as 'friction' | 'intent_30d'
      out[dbKey] = raw
    }
  }
  return out
}
