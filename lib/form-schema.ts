// Form schema — shared by the live quiz, the admin editor, and the
// submission pipeline. Decoupled from any concrete question set so the
// editor can build/validate arbitrary configs.

export type V2QuestionType = 'text' | 'email' | 'chips' | 'multi-chips'

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
}
