// Form schema — shared by the live quiz, the admin editor, and the
// submission pipeline. Decoupled from any concrete question set so the
// editor can build/validate arbitrary configs.

export type V2QuestionType = 'welcome' | 'text' | 'email' | 'chips' | 'multi-chips' | 'split-text'

export interface V2Option {
  label: string
  value: string
  emoji?: string
  logo?: string
  /** Numeric score for chips that map to a numeric column */
  score?: number
}

/** Allowed DB columns. Adding a new collected field requires a Supabase
 *  ALTER TABLE migration AND extending this union — the editor exposes a
 *  fixed picker, not free text. */
export type V2DbColumn =
  | 'name' | 'email'
  | 'frequency_score' | 'depth_score' | 'breadth_score'
  | 'momentum' | 'friction' | 'intent_30d'
  | 'ai_tools' | 'work_area' | 'job_level'
  // Cost-of-the-gap answers. Sales signals only — deliberately NOT part of the
  // score or the stage, so historical rows stay comparable.
  | 'hours_lost' | 'hours_would_use_for'

export interface V2Question {
  id: string
  type: V2QuestionType
  label: string
  sublabel?: string
  required: boolean
  placeholder?: string
  options?: V2Option[]
  /** Maps onto a DB column when present */
  dbColumn?: V2DbColumn
  /** How the answer is converted to its DB value */
  scoring?: 'count' | 'value' | 'enum' | 'csv'
  /** Renamed-from list so analytics can resolve historical ids back to current */
  previousIds?: string[]
  /** Per-question branching rules. First matching rule wins. Empty/missing
   *  means fall through to the next question. */
  branching?: BranchingRule[]
  /** Welcome-screen specific: text on the proceed button. Defaults to "Get
   *  started" when empty. Ignored for non-welcome types. */
  ctaText?: string
  /** Render variant for chips-type questions. 'horizontal' lays them out as
   *  a single horizontal row (use for ordered scales like momentum where
   *  the options are evenly ranked). Defaults to vertical row layout. */
  layout?: 'rows' | 'horizontal'
  /** split-text only: label + placeholder for the left field. */
  firstFieldLabel?: string
  firstFieldPlaceholder?: string
  /** split-text only: label + placeholder for the right field. */
  secondFieldLabel?: string
  secondFieldPlaceholder?: string
}

export type BranchingOp = 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'contains'

/**
 * Facts about the PERSON and their context, as opposed to their answers.
 *
 * WHY THIS EXISTS. Until 2026-08-09 a branching condition could only read the
 * answers map, which meant the engine could ask "did they say they use AI
 * daily?" but never "is this a stranger we paid for?", "are they on a phone?",
 * or "are they already scoring at the ceiling?". Every adaptive idea worth
 * having needs the second kind, so none of them were expressible and the
 * engine sat unused with zero live rules.
 *
 *  - `source`  utm_source, e.g. li_ads, thecentral.ai, carousel
 *  - `device`  desktop | mobile. Some asks are only practical with a keyboard,
 *              pasting a LinkedIn URL being the obvious one.
 *  - `score`   the RUNNING score from answers so far, not the final one. This
 *              is the axis that matters: 22% of takers finish tied at the
 *              ceiling, so the only way to separate the top without making the
 *              quiz longer for everyone is to ask the harder question of the
 *              people who have already earned it.
 *  - `known`   'yes' when we arrived already holding a valid email, i.e. a
 *              subscriber clicking a newsletter link. 'no' for a stranger.
 */
export type BranchingContextKey = 'source' | 'device' | 'score' | 'known'

export interface BranchingContext {
  source?: string | null
  device?: 'desktop' | 'mobile' | null
  score?: number | null
  known?: boolean | null
}

export interface BranchingCondition {
  /** Read a previous answer. Mutually exclusive with `context`. */
  questionId?: string
  /** Read a fact about the person instead of an answer. */
  context?: BranchingContextKey
  op: BranchingOp
  value: string | string[]
}

export interface BranchingRule {
  /** All conditions must match (logical AND). */
  when: BranchingCondition[]
  /** Question id to jump to, or 'end' to finish the form. */
  goto: string | 'end'
}

/**
 * The columns that actually feed the score and the stage.
 *
 * Kept explicit rather than "sum every option score", because that would fold
 * in hours_lost, which carries big numbers (up to 18) and is deliberately a
 * sales signal only, never part of the ladder. Mirrors the inputs
 * segmentation-v2 really reads: frequency, depth, breadth, momentum.
 */
const SCORE_COLUMNS: V2DbColumn[] = ['frequency_score', 'depth_score', 'breadth_score', 'momentum']

/**
 * Score from the answers given SO FAR, for mid-quiz branching.
 *
 * Not the final score and not a substitute for it: the classifier still owns
 * the real number at submit time. This exists so a rule can say "this person is
 * already running hot, ask them the hard question" while they are still in the
 * quiz.
 */
export function runningScore(
  questions: V2Question[],
  answers: Record<string, string | string[]>,
): number {
  let total = 0
  for (const q of questions) {
    if (!q.dbColumn) continue
    // ai_tools writes a CSV but its contribution to the ladder is breadth,
    // i.e. how many they picked, so it counts even though the column differs.
    const countsForScore =
      SCORE_COLUMNS.includes(q.dbColumn) || q.dbColumn === 'ai_tools'
    if (!countsForScore) continue

    const raw = answers[q.id]
    if (raw === undefined) continue

    if (Array.isArray(raw)) {
      total += raw.length
    } else if (q.options) {
      const opt = q.options.find(o => o.value === raw)
      if (opt?.score != null) total += opt.score
    }
  }
  return total
}

/** Resolve what a condition is reading: an answer, or a fact about the person. */
function readOperand(
  c: BranchingCondition,
  answers: Record<string, string | string[]>,
  ctx?: BranchingContext,
): string | string[] | undefined {
  if (c.context) {
    if (!ctx) return undefined
    switch (c.context) {
      case 'source': return ctx.source ?? undefined
      case 'device': return ctx.device ?? undefined
      // Numbers are compared as strings by eq/in and coerced back by gt/lt,
      // matching how answer values already behave.
      case 'score': return ctx.score == null ? undefined : String(ctx.score)
      case 'known': return ctx.known == null ? undefined : ctx.known ? 'yes' : 'no'
    }
  }
  if (!c.questionId) return undefined
  return answers[c.questionId]
}

export function evalConditions(
  conditions: BranchingCondition[],
  answers: Record<string, string | string[]>,
  ctx?: BranchingContext,
): boolean {
  if (conditions.length === 0) return false
  for (const c of conditions) {
    const raw = readOperand(c, answers, ctx)
    if (raw === undefined) return false
    switch (c.op) {
      case 'eq':
        if (typeof raw === 'string' ? raw !== c.value : true) return false
        break
      case 'neq':
        if (typeof raw === 'string' ? raw === c.value : true) return false
        break
      case 'in': {
        const targets = Array.isArray(c.value) ? c.value : [c.value]
        if (typeof raw === 'string') {
          if (!targets.includes(raw)) return false
        } else if (Array.isArray(raw)) {
          if (!raw.some(v => targets.includes(v))) return false
        } else return false
        break
      }
      case 'contains': {
        if (!Array.isArray(raw)) return false
        const needle = Array.isArray(c.value) ? c.value[0] : c.value
        if (!raw.includes(needle)) return false
        break
      }
      case 'gt': {
        const n = Number(typeof raw === 'string' ? raw : '')
        const t = Number(Array.isArray(c.value) ? c.value[0] : c.value)
        if (!(n > t)) return false
        break
      }
      case 'lt': {
        const n = Number(typeof raw === 'string' ? raw : '')
        const t = Number(Array.isArray(c.value) ? c.value[0] : c.value)
        if (!(n < t)) return false
        break
      }
    }
  }
  return true
}

/** Resolve the next question index given the current question, accumulated
 *  answers, and the full questions array. Returns the next index (0-based) or
 *  the literal `'end'` to finish the form. Linear fall-through when no rule
 *  matches. */
export type NextStep = number | 'end'

export function resolveNextStep(
  currentIdx: number,
  questions: V2Question[],
  answers: Record<string, string | string[]>,
  ctx?: BranchingContext,
): NextStep {
  const cur = questions[currentIdx]
  if (cur?.branching && cur.branching.length > 0) {
    for (const rule of cur.branching) {
      if (evalConditions(rule.when, answers, ctx)) {
        if (rule.goto === 'end') return 'end'
        const targetIdx = questions.findIndex(q => q.id === rule.goto)
        if (targetIdx === -1 || targetIdx <= currentIdx) continue
        return targetIdx
      }
    }
  }
  const next = currentIdx + 1
  if (next >= questions.length) return 'end'
  return next
}

// ── End-screen blocks (result page) ─────────────────────────────────
// The result page is composed of a hero band (always rendered) plus an
// ordered list of body blocks. Existing hardcoded sections (gauge,
// stage card, testimonials, pricing) stay; blocks slot between the hero
// and the stage card.

export type EndScreenBlockType =
  | 'heading'
  | 'paragraph'
  | 'bullets'
  | 'image'
  | 'button'
  | 'divider'

export interface EndScreenBlockBase {
  id: string
  type: EndScreenBlockType
}

export interface HeadingBlock extends EndScreenBlockBase {
  type: 'heading'
  text: string
  level: 1 | 2 | 3
}

export interface ParagraphBlock extends EndScreenBlockBase {
  type: 'paragraph'
  text: string
}

export interface BulletsBlock extends EndScreenBlockBase {
  type: 'bullets'
  items: string[]
}

export interface ImageBlock extends EndScreenBlockBase {
  type: 'image'
  src: string
  alt: string
  caption?: string
}

export interface ButtonBlock extends EndScreenBlockBase {
  type: 'button'
  text: string
  url: string
  variant: 'primary' | 'secondary'
}

export interface DividerBlock extends EndScreenBlockBase {
  type: 'divider'
}

export type EndScreenBlock =
  | HeadingBlock
  | ParagraphBlock
  | BulletsBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock

export interface EndScreen {
  id: string
  /** Human label shown in the editor tab strip (not user-visible). */
  name: string
  /** Headline at the top of the result page. Falls back to the
   *  stage/persona-driven default when empty. Supports {firstName} token. */
  heroHeadline?: string
  /** Sub copy under the headline. */
  heroSubheadline?: string
  /** Primary CTA button text. Defaults to the existing intent-aware copy. */
  ctaText?: string
  /** Primary CTA URL. Defaults to PAYMENT_URL. */
  ctaUrl?: string
  /** Body blocks rendered between the hero and the stage card. */
  blocks: EndScreenBlock[]
  /** AND-combined predicates. Empty = matches everything (default fallback).
   *  Evaluation is array-order — first match wins; place the default last. */
  when: EndScreenCondition[]
}

export type EndScreenConditionField =
  | 'score' | 'persona' | 'stage' | 'intent' | 'friction'

export type EndScreenConditionOp = 'eq' | 'neq' | 'gte' | 'lte' | 'in'

export interface EndScreenCondition {
  field: EndScreenConditionField
  op: EndScreenConditionOp
  value: string | string[] | number
}

export interface EndScreenEvalContext {
  score?: number | null
  persona?: string | null
  stage?: string | null
  intent?: string | null
  friction?: string | null
}

export function evalEndScreenCondition(c: EndScreenCondition, ctx: EndScreenEvalContext): boolean {
  const raw = ctx[c.field]
  if (raw === undefined || raw === null) return false
  switch (c.op) {
    case 'eq':
      return String(raw).toLowerCase() === String(c.value).toLowerCase()
    case 'neq':
      return String(raw).toLowerCase() !== String(c.value).toLowerCase()
    case 'gte':
      return Number(raw) >= Number(c.value)
    case 'lte':
      return Number(raw) <= Number(c.value)
    case 'in': {
      const targets = Array.isArray(c.value) ? c.value : [String(c.value)]
      return targets.map(t => String(t).toLowerCase()).includes(String(raw).toLowerCase())
    }
  }
}

/** Pick the first matching end-screen. An end-screen with empty `when`
 *  always matches — treat it as the default and place it last. */
export function pickEndScreen(screens: EndScreen[], ctx: EndScreenEvalContext): EndScreen | null {
  for (const s of screens) {
    if (s.when.length === 0) return s
    if (s.when.every(c => evalEndScreenCondition(c, ctx))) return s
  }
  return null
}

export function defaultEndScreens(): EndScreen[] {
  return [{ id: 'default', name: 'Default', blocks: [], when: [] }]
}

/** Default empty end screen — kept as a helper for backwards
 *  compatibility with code that wants a single screen. */
export function emptyEndScreen(): EndScreen {
  return { id: 'default', name: 'Default', blocks: [], when: [] }
}
