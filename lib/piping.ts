// Piping — token substitution shared by the live quiz, the result page,
// and the editor. Tokens are written as {tokenName} in any text field.
// Unknown tokens (or tokens with no available value) resolve to the
// fallback you pass in, defaulting to an empty string so empty answers
// don't render literal `{firstName}` chrome to the user.

import type { V2Question } from './form-schema'

export type TokenName = 'firstName' | 'lastName' | 'persona' | 'stage' | 'score' | 'intent' | 'friction'

export interface TokenContext {
  /** Raw question answers, keyed by question id. */
  answers?: Record<string, string | string[] | undefined>
  /** Derived persona key (e.g. 'experimenter'). */
  persona?: string | null
  /** Human label for the persona, used as the display value of {persona}. */
  personaLabel?: string | null
  /** Derived stage key (e.g. 'maker'). */
  stage?: string | null
  /** Human label for the stage. */
  stageLabel?: string | null
  /** Numeric score 0–100. */
  score?: number | null
  /** Optional intent_30d value. */
  intentLabel?: string | null
  /** Optional friction value. */
  frictionLabel?: string | null
  /** Optional explicit fallback for any token that resolves to empty. */
  fallback?: string
}

export interface TokenDef {
  name: TokenName | string
  label: string
  /** Where this token has a value: at quiz-time, on the result page, or both. */
  availability: 'quiz' | 'result' | 'both'
  /** Example value shown in the picker UI. */
  example: string
}

/** Built-in token catalog. Question-answer tokens ({q.<id>}) are matched
 *  dynamically and aren't in this list. */
export const BUILTIN_TOKENS: TokenDef[] = [
  { name: 'firstName', label: 'First name', availability: 'both', example: 'Alex' },
  { name: 'lastName', label: 'Last name', availability: 'both', example: 'Fiore' },
  { name: 'persona', label: 'Persona', availability: 'result', example: 'Maker' },
  { name: 'stage', label: 'Stage', availability: 'result', example: 'Experimenter' },
  { name: 'score', label: 'Score', availability: 'result', example: '78' },
  { name: 'intent', label: '30-day intent', availability: 'both', example: 'Build my first automation' },
  { name: 'friction', label: 'Top friction', availability: 'both', example: 'Too many tools, too much noise' },
]

/** Resolve all tokens in a text string. Unknown / missing values resolve to
 *  ctx.fallback (default ''). Supports the special {q.<id>} pattern. */
export function resolveTokens(text: string, ctx: TokenContext): string {
  if (!text) return ''
  const fallback = ctx.fallback ?? ''
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9_.]*)\}/g, (_match, token: string) => {
    const v = resolveOne(token, ctx)
    return v !== undefined && v !== '' ? v : fallback
  })
}

function resolveOne(token: string, ctx: TokenContext): string | undefined {
  // {q.<id>} → raw answer value (joined with ", " for arrays)
  if (token.startsWith('q.')) {
    const id = token.slice(2)
    const raw = ctx.answers?.[id]
    if (raw === undefined) return undefined
    return Array.isArray(raw) ? raw.join(', ') : String(raw)
  }
  switch (token) {
    case 'firstName':
      return extractFirstName(ctx.answers?.['name'])
    case 'lastName':
      return extractLastName(ctx.answers?.['name'])
    case 'persona':
      return ctx.personaLabel ?? (ctx.persona ?? undefined)
    case 'stage':
      return ctx.stageLabel ?? (ctx.stage ?? undefined)
    case 'score':
      return typeof ctx.score === 'number' ? String(Math.round(ctx.score)) : undefined
    case 'intent':
      return ctx.intentLabel ?? undefined
    case 'friction':
      return ctx.frictionLabel ?? undefined
    default:
      return undefined
  }
}

function extractFirstName(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  return raw.trim().split(/\s+/)[0]
}

function extractLastName(raw: string | string[] | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined
  const parts = raw.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : undefined
}

/** Helper for editor UIs that want to also surface dynamic per-question
 *  tokens ({q.<id>}) in the picker. */
export function dynamicQuestionTokens(questions: V2Question[]): TokenDef[] {
  return questions
    .filter(q => q.type === 'text' || q.type === 'email' || q.type === 'chips')
    .map(q => ({
      name: `q.${q.id}`,
      label: `Answer to "${q.label.slice(0, 32)}${q.label.length > 32 ? '…' : ''}"`,
      availability: 'both' as const,
      example: q.options?.[0]?.label ?? '…',
    }))
}
