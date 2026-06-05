'use client'

import { useRef, useEffect } from 'react'
import type { V2Question } from '@/lib/form-schema'
import { resolveTokens, type TokenContext } from '@/lib/piping'

interface Props {
  question: V2Question
  /** Current single-answer value (used for text/email/chips) */
  singleAnswer: string
  /** Current multi-answer value (used for multi-chips) */
  multiAnswer: string[]
  /** Step number shown in the header (1-indexed) */
  stepNumber: number
  /** Error to display under the text input */
  inputError?: string
  /** Accent color (theme override). Default matches the historical brand blue. */
  accent?: string
  /** Whether to autofocus the text input on mount/step-change */
  autoFocus?: boolean
  /** Token context for piping in label/sublabel. Quiz-time tokens like
   *  {firstName} resolve from in-progress answers; result-only tokens
   *  ({persona}, {score}) fall back to empty. */
  tokens?: TokenContext
  /** Single-select / text handlers */
  onSingleSelect: (value: string) => void
  onMultiToggle: (value: string) => void
  onTextChange: (value: string) => void
  /** Submit via Enter on text input */
  onEnterKey?: () => void
}

const DEFAULT_ACCENT = '#046BB1'

export function QuestionRenderer({
  question: q,
  singleAnswer,
  multiAnswer,
  stepNumber,
  inputError,
  accent = DEFAULT_ACCENT,
  autoFocus = false,
  tokens,
  onSingleSelect,
  onMultiToggle,
  onTextChange,
  onEnterKey,
}: Props) {
  // Resolve tokens in label + sublabel. When `tokens` is undefined,
  // resolveTokens with an empty ctx still strips unknown tokens — which
  // is the right behavior for the editor preview before any state hookup.
  const label = resolveTokens(q.label, tokens ?? {})
  const sublabel = q.sublabel ? resolveTokens(q.sublabel, tokens ?? {}) : undefined
  const inputRef = useRef<HTMLInputElement>(null)
  const isText = q.type === 'text' || q.type === 'email'
  const isSingle = q.type === 'chips'
  const isMulti = q.type === 'multi-chips'
  const isLargeGrid = isMulti && (q.options?.length ?? 0) > 4

  useEffect(() => {
    if (isText && autoFocus && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 380)
      return () => clearTimeout(t)
    }
  }, [isText, autoFocus, q.id])

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEnterKey?.()
    }
  }

  const letter = (i: number) => String.fromCharCode(65 + i)

  return (
    <>
      <div className="flex items-center gap-1.5 mb-5">
        <span className="text-[13px] font-bold" style={{ color: accent }}>{stepNumber}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>

      <h1 className="text-[26px] sm:text-[30px] font-bold text-gray-900 leading-tight mb-2">{label}</h1>
      {sublabel ? <p className="text-[15px] text-gray-500 mb-2">{sublabel}</p> : <div className="mb-6" />}
      {sublabel && <div className="mb-3" />}

      {isText && (
        <div className="mb-7" onKeyDown={onInputKeyDown}>
          <input
            ref={inputRef}
            type={q.type === 'email' ? 'email' : 'text'}
            value={singleAnswer}
            onChange={e => onTextChange(e.target.value)}
            placeholder={q.placeholder}
            className={`w-full text-[17px] text-gray-900 placeholder-gray-300 bg-transparent border-b-2 pb-3 outline-none transition-colors duration-200 ${inputError ? 'border-red-400' : 'border-gray-200'}`}
            style={!inputError ? { borderBottomColor: undefined } : {}}
            onFocus={e => { if (!inputError) e.currentTarget.style.borderBottomColor = accent }}
            onBlur={e => { e.currentTarget.style.borderBottomColor = '' }}
          />
          {inputError && <p className="mt-2 text-sm text-red-500">{inputError}</p>}
          <p className="mt-3 text-xs text-gray-400">Press <kbd className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[11px] text-gray-500 font-mono">Enter ↵</kbd> to continue</p>
        </div>
      )}

      {isSingle && q.options && (
        <div className="flex flex-col gap-2.5 mb-7">
          {q.options.map((opt, i) => {
            const sel = singleAnswer === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSingleSelect(opt.value)}
                className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-150 active:scale-[0.99] ${sel ? 'bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}
                style={sel ? { borderColor: accent } : {}}
              >
                <span className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold transition-all duration-150 ${sel ? 'text-white' : 'bg-gray-100 text-gray-500'}`} style={sel ? { backgroundColor: accent } : {}}>
                  {letter(i)}
                </span>
                {opt.emoji && <span className="text-[17px] leading-none">{opt.emoji}</span>}
                <span className={`font-medium text-[15px] ${sel ? '' : 'text-gray-800'}`} style={sel ? { color: accent } : {}}>{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {isMulti && q.options && (
        <div className={`mb-7 ${isLargeGrid ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5'}`}>
          {q.options.map(opt => {
            const sel = multiAnswer.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onMultiToggle(opt.value)}
                className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-150 active:scale-[0.99] ${sel ? 'bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}
                style={sel ? { borderColor: accent } : {}}
              >
                <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border-2 transition-all duration-150 ${sel ? '' : 'border-gray-300 bg-white'}`} style={sel ? { borderColor: accent, backgroundColor: accent } : {}}>
                  {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L3.8 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </span>
                {opt.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={opt.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                ) : opt.emoji ? (
                  <span className="text-[17px] leading-none">{opt.emoji}</span>
                ) : null}
                <span className={`font-medium text-[14px] leading-snug ${sel ? '' : 'text-gray-800'}`} style={sel ? { color: accent } : {}}>{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
