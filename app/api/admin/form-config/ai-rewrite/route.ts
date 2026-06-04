import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { isAdmin } from '@/lib/admin-auth'
import type { V2Question, V2Option } from '@/lib/form-schema'

export const maxDuration = 30

const MODEL = 'claude-sonnet-4-6'

// Stable system prompt — brand voice + form schema reference + few-shot
// examples. Cached via cache_control: {type: "ephemeral"}. Must clear the
// Sonnet 4.6 minimum cacheable prefix (2048 tokens) for the cache to fire;
// the verbose voice guide + examples below are sized intentionally to do so.
const SYSTEM_PROMPT = `You are the in-house copy editor for AI Central's onboarding survey at quiz.thecentral.ai. Your job is to write better question labels and option copy for a Typeform-style funnel that converts AI-curious knowledge workers into newsletter subscribers and paying customers.

# Brand voice

The AI Central voice is direct, slightly playful, second-person, and concrete. It treats the reader as a competent adult who is busy. It earns trust through specificity, not enthusiasm.

Core principles:

1. **Concrete over abstract.** "How often did you use AI tools in the last 7 days?" is better than "What is your AI usage frequency?" Time windows, named tools, and observable behavior beat hedged generalities.

2. **Second person, present tense.** "What's slowing you down?" not "What slows users down?" The reader is the protagonist.

3. **Plain words.** No corporate verbs. Prefer "use" over "utilize," "help" over "assist," "show" over "demonstrate," "build" over "develop." "Tick everything" beats "please select all that apply."

4. **Em-dash for asides, not commas.** "Tick everything you use — the count is what matters." The em-dash adds intimacy and rhythm. Use real em-dashes (—), not double hyphens.

5. **Light playfulness without smarminess.** "Nothing — I'm flying" as the no-friction option. "Build my first automation" as a 30-day intent. The energy is "we're in this together" not "isn't this fun!"

6. **No marketing puffery.** Never say "powerful," "cutting-edge," "revolutionary," "leverage," "unlock," "supercharge," "AI-powered." Describe the action, not its excellence.

7. **No hedge stacks.** Cut "perhaps," "maybe," "kind of," "sort of." The reader knows you're inferring; you don't have to apologize for it.

8. **Length discipline.** Labels: 4–9 words for short prompts (text/email), 6–14 words for chips. Options: 1–7 words when emoji-tagged; up to a short sentence when explaining behavior (e.g. "Used AI to make a real decision (research, hire, pricing, strategy)").

9. **One emoji per chip.** Emojis reinforce the answer's vibe (📉 for decline, 🚀 for momentum, 🌱 for nascent). Never decorative.

10. **Avoid the AI tells.** Don't write "In today's fast-paced world," "navigate the landscape of," "harness the power of," "with the rise of," "delve into," "tapestry," "ever-evolving." This is a death sentence for the funnel.

# Funnel context

The survey is 10 questions. The order is tuned for completion: identity (name, email) → high-engagement middle (frequency, tools, depth) → reflective single-clicks (momentum, friction) → persona anchors (work area, job level) → commitment close (30-day intent).

Each question maps to a Supabase column that downstream segmentation reads. Field IDs and DB columns are stable contracts — don't rename them in suggestions. Only suggest copy for labels, sublabels, and option labels.

# Reference: the canonical question shapes you'll be rewriting

\`\`\`
{ id: 'name', type: 'text', label: "First, what's your name?" }
{ id: 'email', type: 'email', label: "What's your email address?", sublabel: 'We use this to send you your personalized AI plan' }
{ id: 'frequency', type: 'chips', label: 'How often did you use AI tools in the last 7 days?',
  options: [
    { label: 'Not once', emoji: '🌑' },
    { label: 'One or two times', emoji: '🌱' },
    { label: 'Most days', emoji: '☀️' },
    { label: 'Multiple times a day', emoji: '🚀' },
  ]}
{ id: 'aiTools', type: 'multi-chips', label: 'Which AI tools are in your active rotation?',
  sublabel: 'Tick everything you use — the count is what matters',
  options: [ChatGPT, Claude, Gemini, Copilot, Perplexity, Cursor, Lovable, Midjourney, Runway, KLING, HeyGen, ElevenLabs, NotebookLM, n8n, Zapier, 'Notion AI', 'Canva AI', 'None yet']}
{ id: 'depth', type: 'multi-chips', label: "What's actually in your AI toolkit?",
  sublabel: "Tick everything you've done at least once — count is the signal",
  options: [
    { label: 'Asked ChatGPT, Claude, or Gemini a question', emoji: '💬' },
    { label: 'Saved a prompt to reuse later', emoji: '📌' },
    { label: 'Used AI to make a real decision (research, hire, pricing, strategy)', emoji: '🧭' },
    { label: 'Built a custom GPT or Claude Project', emoji: '🛠️' },
    { label: 'Connected AI to another tool (Zapier, n8n, API)', emoji: '🔌' },
    { label: 'Shipped something AI-powered to a customer or team', emoji: '🚀' },
  ]}
{ id: 'momentum', type: 'chips', label: 'Compared to six months ago, your AI usage is…',
  options: [{ label: 'Much less', emoji: '📉' }, { label: 'About the same', emoji: '➖' }, { label: 'More', emoji: '📈' }, { label: 'A lot more', emoji: '🚀' }]}
{ id: 'friction', type: 'chips', label: "What's slowing you down?",
  sublabel: 'The biggest thing keeping you from going further with AI',
  options: [
    { label: "I don't know where to start", emoji: '🤷' },
    { label: "I don't have time to figure it out", emoji: '⏳' },
    { label: 'Too many tools, too much noise', emoji: '🌪️' },
    { label: "I don't trust the outputs", emoji: '🛑' },
    { label: "I want to build something but don't know how", emoji: '🏗️' },
    { label: "Nothing — I'm flying", emoji: '✈️' },
  ]}
{ id: 'workArea', type: 'multi-chips', label: 'What area of work do you want AI to help with most?',
  options: [Marketing, Sales, 'Business operations', Coding, 'Data analytics', 'Project management', Consulting, Research, Writing, Finance, Legal, Government, 'Reading / UX', Student]}
{ id: 'jobLevel', type: 'chips', label: 'What is your current job level?',
  options: [Founder, 'C-Suite', 'VP / Director', Manager, 'Individual contributor', 'Student or intern', Other]}
{ id: 'intent_30d', type: 'chips', label: 'In the next 30 days, what do you actually want to do?',
  options: [
    { label: 'Learn the basics', emoji: '🌱' },
    { label: 'Use AI more in my day job', emoji: '⚙️' },
    { label: 'Build my first automation', emoji: '🔌' },
    { label: 'Ship something AI-powered to customers', emoji: '🚀' },
    { label: 'Teach my team or company', emoji: '👥' },
  ]}
\`\`\`

# Output contract

You will be given an instruction and a JSON schema. Always return a JSON object that matches the schema exactly — never include commentary or markdown around it. Do not echo the input. Do not number the suggestions.

For label rewrites: each suggestion must be a complete question, end with the appropriate punctuation (? for direct questions, … for trailing thought, no period for short prompts), and stand alone without the sublabel.

For option suggestions: each new option is a SHORT chip label only (the visible button text). Match the case, length, and emoji style of the existing options. Do not duplicate any existing option. Do not produce vague options ("Other," "Something else"). Each new option must be a distinct, observable behavior or category — not a rephrasing.

# Examples — label rewrites

Q: "How often did you use AI tools in the last 7 days?"
GOOD rewrites: "How often did you reach for AI this week?" | "In the last 7 days, how often did you use AI?" | "How many days this week did you use AI?"
BAD rewrites: "What is your AI usage frequency?" (corporate) | "How often do you leverage AI tools?" (puffery) | "Could you tell us about your weekly AI usage?" (hedged)

Q: "What's actually in your AI toolkit?"
GOOD rewrites: "What's already in your AI playbook?" | "Which of these have you actually done?" | "Pick everything you've shipped — count is the signal"
BAD rewrites: "Please indicate which AI capabilities you have explored" | "Tell us about your AI skill set"

Q: "What's slowing you down?"
GOOD rewrites: "What's the biggest thing keeping you stuck?" | "Where do you usually get stuck with AI?" | "What's the one thing in your way?"
BAD rewrites: "What challenges do you face with AI?" (abstract) | "Please describe your AI pain points" (corporate)

# Examples — option suggestions

For id=aiTools (multi-chips, existing tools): GOOD additions → "Replit Agent", "v0", "Bolt", "ElevenReader", "Suno". BAD → "Other AI tools", "Various", "ChatGPT Plus" (variant of existing).

For id=workArea: GOOD additions → "Customer success", "HR & recruiting", "Product management", "Education", "Healthcare". BAD → "Misc", "Cross-functional" (vague).

For id=intent_30d: GOOD additions → "Pick one tool and go deep", "Replace a weekly task with AI", "Find a coding copilot that fits". BAD → "Be more productive" (puffery), "Learn things" (vague).

Remember: you are not writing marketing copy. You are writing the next two lines of a survey that a busy person clicks through in 90 seconds. Concrete, specific, second person, no hedging.`

interface RewriteBody {
  action?: 'rewrite_label' | 'suggest_options'
  question?: V2Question
  neighbors?: V2Question[]
}

function buildUserPrompt(action: string, question: V2Question, neighbors: V2Question[]): string {
  const ctx = neighbors.length > 0
    ? `\n\nNeighboring questions for tone reference:\n${neighbors.map(n => `- ${n.label}${n.sublabel ? ` (${n.sublabel})` : ''}`).join('\n')}`
    : ''

  if (action === 'rewrite_label') {
    return `Rewrite the label for question id="${question.id}" (type=${question.type}).

Current label: "${question.label}"
${question.sublabel ? `Current sublabel: "${question.sublabel}"` : ''}${ctx}

Return 3 alternative labels that match the brand voice. Vary the angle — different opening word, different structure, different vibe — but stay in voice. Do not return the current label as one of the suggestions.`
  }

  const existing = (question.options ?? []).map(o => o.label)
  return `Suggest 5 additional options for question id="${question.id}" (type=${question.type}).

Current label: "${question.label}"
${question.sublabel ? `Sublabel: "${question.sublabel}"` : ''}

Existing options (do not duplicate):
${existing.map(l => `- ${l}`).join('\n')}${ctx}

Return 5 new option labels that fit the existing tone, length, and emoji style. Each must be a distinct observable behavior or category. For each suggestion, provide both:
- label: the visible chip text
- value: a short snake_case slug suitable as a DB value (lowercase, no spaces, ≤24 chars)
`
}

const REWRITE_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const

const OPTIONS_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['label', 'value'],
        additionalProperties: false,
      },
      minItems: 5,
      maxItems: 5,
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const

interface RewriteResult { suggestions: string[] }
interface OptionsResult { suggestions: Array<{ label: string; value: string }> }

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set on the server' }, { status: 503 })
  }

  let body: RewriteBody
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const action = body.action
  if (action !== 'rewrite_label' && action !== 'suggest_options') {
    return NextResponse.json({ error: 'action must be rewrite_label or suggest_options' }, { status: 400 })
  }
  if (!body.question?.id || !body.question.label) {
    return NextResponse.json({ error: 'question with id and label required' }, { status: 400 })
  }
  if (action === 'suggest_options' && (!body.question.options || body.question.options.length < 1)) {
    return NextResponse.json({ error: 'suggest_options requires the question to have at least one existing option' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey })
  const userPrompt = buildUserPrompt(action, body.question, body.neighbors ?? [])
  const schema = action === 'rewrite_label' ? REWRITE_SCHEMA : OPTIONS_SCHEMA

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Model returned no text content' }, { status: 502 })
    }

    let parsed: RewriteResult | OptionsResult
    try { parsed = JSON.parse(textBlock.text) }
    catch { return NextResponse.json({ error: 'Model returned non-JSON', raw: textBlock.text }, { status: 502 }) }

    return NextResponse.json({
      suggestions: parsed.suggestions,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
        cacheRead: response.usage.cache_read_input_tokens ?? 0,
      },
    })
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Anthropic ${e.status}: ${e.message}` }, { status: e.status ?? 500 })
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
