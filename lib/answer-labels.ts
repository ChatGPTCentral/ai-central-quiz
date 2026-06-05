// Maps a stored submission value back to the human label + emoji the user
// actually saw in the form. Built off the live question schema so it never
// drifts. Used by the admin email (and reusable anywhere a raw enum needs to
// read back as "🔌 Build my first automation").

import { QUESTIONS_V2_MERGED } from './questions-v2-merged'
import type { V2Option } from './form-schema'

export interface AnswerDisplay {
  label: string
  emoji?: string
}

// questionId → (value | score, both stringified) → option
const BY_ID: Record<string, Map<string, V2Option>> = {}
for (const q of QUESTIONS_V2_MERGED) {
  if (!q.options) continue
  const m = new Map<string, V2Option>()
  for (const opt of q.options) {
    m.set(String(opt.value), opt)
    if (opt.score !== undefined) m.set(String(opt.score), opt) // frequency_score / momentum store the numeric score
  }
  BY_ID[q.id] = m
}

/** Single-value lookup. `raw` may be the option value OR its numeric score
 *  (frequency_score, momentum). Falls back to the raw string when unknown so
 *  display never breaks. */
export function answerDisplay(questionId: string, raw: string | number | null | undefined): AnswerDisplay | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null
  const opt = BY_ID[questionId]?.get(String(raw))
  if (opt) return { label: opt.label, emoji: opt.emoji }
  return { label: String(raw) }
}

/** Multi-value (CSV) lookup — ai_tools, work_area. Each token resolved to its
 *  option; unknown tokens pass through as their own label. */
export function answerDisplayList(questionId: string, csv: string | null | undefined): AnswerDisplay[] {
  if (!csv) return []
  return csv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(token => {
      const opt = BY_ID[questionId]?.get(token)
      return opt ? { label: opt.label, emoji: opt.emoji } : { label: token }
    })
}

/** Render an AnswerDisplay as "emoji label" (emoji optional). */
export function formatDisplay(d: AnswerDisplay | null): string {
  if (!d) return ''
  return d.emoji ? `${d.emoji} ${d.label}` : d.label
}
