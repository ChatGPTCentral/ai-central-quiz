'use client'

import { BUILTIN_TOKENS, type TokenDef } from '@/lib/piping'

interface Props {
  /** Where this picker is rendered — controls which tokens are surfaced.
   *  'quiz' shows only tokens with values during the quiz; 'result' adds
   *  persona/stage/score. */
  availability: 'quiz' | 'result'
  /** Optional dynamic tokens (e.g. {q.<id>} for upstream answers). */
  extras?: TokenDef[]
  /** Called with the token string `{tokenName}` when a chip is clicked. */
  onInsert: (literal: string) => void
}

export function TokenPicker({ availability, extras = [], onInsert }: Props) {
  const tokens = [...BUILTIN_TOKENS, ...extras].filter(
    t => t.availability === 'both' || t.availability === availability,
  )
  if (tokens.length === 0) return null
  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      <span className="text-[10px] text-[#9C9C9C] uppercase tracking-wider font-bold mr-1">Insert:</span>
      {tokens.map(t => (
        <button
          key={t.name}
          type="button"
          onClick={() => onInsert(`{${t.name}}`)}
          title={`Example: ${t.example}`}
          className="text-[10px] font-mono text-[#046BB1] bg-[#046BB1]/8 hover:bg-[#046BB1]/15 px-1.5 py-0.5 rounded"
        >
          {`{${t.name}}`}
        </button>
      ))}
    </div>
  )
}
