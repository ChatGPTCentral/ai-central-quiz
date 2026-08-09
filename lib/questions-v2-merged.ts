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
    // "First," was true under the old PII-first order and became a lie when
    // question-first shipped: this is step 10 of 11, and the eyebrow above it
    // says so. This is also where the real leak is (89.1% retention, the
    // worst step in the quiz), so the wording here deserves a proper A/B
    // rather than another guess - - see the board card.
    label: "What's your name?",
    sublabel: 'It goes on your member pass, spelled exactly like this',
    required: true,
    dbColumn: 'name',
    firstFieldLabel: 'First name',
    firstFieldPlaceholder: 'John',
    secondFieldLabel: 'Last name',
    secondFieldPlaceholder: 'Doe',
  },
  // REWORDED 2026-08-09, owner's wording. This step loses 13.3%, three times
  // the next worst, and the loss is almost entirely cold paid traffic: li_ads
  // drops 34.2% here while thecentral.ai drops 0%, because newsletter links
  // carry ?email= and skip the step outright.
  //
  // "What's your email address?" is a request for their data. "Where should we
  // send it?" is a delivery question about something they have already earned,
  // and it names the two things they are owed - - the pass and the result -
  // instead of a vague "personalized AI plan". Same field, same column, same
  // validation. Nothing stored changes.
  {
    id: 'email',
    type: 'email',
    label: 'Where should we send your pass and your result?',
    sublabel: 'Both land in your inbox in about a minute',
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

  // ── The cost of the gap ────────────────────────────────────────
  // The quiz's job is not only to measure, it is to make the taker state, in
  // their own number, what the status quo costs them. The result page quotes
  // this straight back ("you said 4-7 hours a week"), and nobody argues with
  // their own answer. Sales signal only: NOT scored, NOT part of the stage.
  //
  // REWORDED 2026-08-09 on PostHog timing data. This question was taking a
  // median of 13.1 seconds against 6.0 for question 1, and losing 4.7% of
  // takers, five times any other content question. Length was NOT the cause:
  // workArea takes the longest of all at 21.3 seconds and loses only 1.7%.
  // The cause was the KIND of thinking. Scanning a list of options and tapping
  // what applies is recognition and it is cheap. "How many hours go on work AI
  // could already be doing" asks you to first model what AI is capable of, then
  // estimate a quantity about yourself you have never counted, then admit it is
  // wasted. Three hard steps, at question 2, before anyone is invested.
  //
  // So the main line is now short and instantly recognisable, and the modelling
  // moved into the smaller supporting line where it costs less. The option
  // VALUES and scores are untouched on purpose: costLine() on the result page
  // derives its band from the number, never the label, so this changes how the
  // question reads without changing a single stored answer or breaking any
  // comparison with historical data.
  {
    id: 'hoursLost',
    type: 'chips',
    label: 'How many hours a week do you lose to busywork?',
    sublabel: 'Work a good AI could already do for you. A rough guess is fine.',
    required: true,
    dbColumn: 'hours_lost',
    scoring: 'value',
    layout: 'rows',
    options: [
      { label: 'Under 1 hour',     value: '0.5', score: 0.5 },
      { label: '1 to 3 hours',     value: '2',   score: 2 },
      { label: '4 to 7 hours',     value: '5.5', score: 5.5 },
      { label: '8 to 15 hours',    value: '11',  score: 11 },
      { label: 'More than 15',     value: '18',  score: 18 },
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
    label: 'Compared to 6 months ago, are you gaining ground on AI or falling behind?',
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
    label: "What's actually stopping you going further?",
    sublabel: 'Be honest, this is what we build your plan around',
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

  // Turns the hours into something they WANT. The plan is then framed as
  // buying this back, not as buying tutorials.
  {
    id: 'hoursFor',
    type: 'chips',
    label: 'If you got those hours back, what would you actually do with them?',
    required: true,
    dbColumn: 'hours_would_use_for',
    scoring: 'enum',
    options: [
      { label: 'The real work I never get to', value: 'real_work',   emoji: '🎯' },
      { label: 'Grow the business',            value: 'grow',        emoji: '📈' },
      { label: 'Learn or build something new', value: 'learn_build', emoji: '🛠️' },
      { label: 'Finish on time, for once',     value: 'log_off',     emoji: '🌅' },
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
    // Reverted 2026-08-07 to the original wording, at the owner's request.
    // It was reframed that morning on the belief that it cost 17.5% of
    // finishers; measured properly it retains 99.6%, so there was nothing to
    // fix and no reason to keep a change made for a wrong reason.
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

  // An intent_30d question ("30 days from now, what do you want to be true?")
  // used to sit here as a commitment close. Cut 2026-08-07: it cost 3.6 points
  // of completion and nothing consumed the answer, which appeared only on admin
  // screens. The submissions.intent_30d COLUMN and every historical answer are
  // untouched, so reinstating it loses nothing. The verbatim definition and the
  // two follow-up edits it needs are on the roadmap board, card "PARKED,
  // recoverable: intent_30d question", or in `git show f80d784` on this file.


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
  depth_actions?: string    // CSV of the raw depth selections (for display)
  breadth_score?: number
  momentum?: number
  friction?: string
  intent_30d?: string
  // Cost-of-the-gap answers. Sales signals; never fed into calculateScoreV2 or
  // assignStage, so every historical score and stage stays comparable.
  hours_lost?: number
  hours_would_use_for?: string
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
      // depth_score = count of selections; depth_actions keeps the raw
      // selections so the notification can show what they actually did.
      out.depth_score = raw.length
      if (q.dbColumn === 'depth_score') out.depth_actions = raw.join(',')
    } else if (q.scoring === 'value' && typeof raw === 'string') {
      const n = Number(raw)
      if (!Number.isNaN(n)) {
        if (q.dbColumn === 'frequency_score') out.frequency_score = n
        else if (q.dbColumn === 'momentum') out.momentum = n
        else if (q.dbColumn === 'hours_lost') out.hours_lost = n
      }
    } else if (q.scoring === 'enum' && typeof raw === 'string') {
      if (q.dbColumn === 'friction') out.friction = raw
      else if (q.dbColumn === 'intent_30d') out.intent_30d = raw
      else if (q.dbColumn === 'hours_would_use_for') out.hours_would_use_for = raw
    } else if (typeof raw === 'string') {
      if (q.dbColumn === 'name')     out.name = raw
      else if (q.dbColumn === 'email')    out.email = raw.toLowerCase().trim()
      else if (q.dbColumn === 'job_level') out.job_level = raw
    }
  }
  return out
}
