// Form schema — shared by the live quiz, the admin editor, and the
// submission pipeline. Decoupled from any concrete question set so the
// editor can build/validate arbitrary configs.

export type V2QuestionType = 'welcome' | 'text' | 'email' | 'chips' | 'multi-chips'

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
}

export type BranchingOp = 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'contains'

export interface BranchingCondition {
  questionId: string
  op: BranchingOp
  value: string | string[]
}

export interface BranchingRule {
  /** All conditions must match (logical AND). */
  when: BranchingCondition[]
  /** Question id to jump to, or 'end' to finish the form. */
  goto: string | 'end'
}

export function evalConditions(
  conditions: BranchingCondition[],
  answers: Record<string, string | string[]>,
): boolean {
  if (conditions.length === 0) return false
  for (const c of conditions) {
    const raw = answers[c.questionId]
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
): NextStep {
  const cur = questions[currentIdx]
  if (cur?.branching && cur.branching.length > 0) {
    for (const rule of cur.branching) {
      if (evalConditions(rule.when, answers)) {
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
// archetype, testimonials, pricing) stay; blocks slot between the hero
// and the archetype card.

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
   *  archetype-driven default when empty. Supports {firstName} token. */
  heroHeadline?: string
  /** Sub copy under the headline. */
  heroSubheadline?: string
  /** Primary CTA button text. Defaults to the existing intent-aware copy. */
  ctaText?: string
  /** Primary CTA URL. Defaults to PAYMENT_URL. */
  ctaUrl?: string
  /** Body blocks rendered between the hero and the archetype card. */
  blocks: EndScreenBlock[]
  /** AND-combined predicates. Empty = matches everything (default fallback).
   *  Evaluation is array-order — first match wins; place the default last. */
  when: EndScreenCondition[]
}

export type EndScreenConditionField =
  | 'score' | 'persona' | 'stage' | 'archetype' | 'intent' | 'friction'

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
  archetype?: string | null
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
