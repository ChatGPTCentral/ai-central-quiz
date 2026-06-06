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
  const isWelcome = q.type === 'welcome'
  const isText = q.type === 'text' || q.type === 'email'
  const isSplit = q.type === 'split-text'
  const isSingle = q.type === 'chips'
  const isMulti = q.type === 'multi-chips'
  // Switch to a 2-col grid only when the option list is long enough that a
  // single column would dominate the viewport (tools/work-area, 14+ items).
  // Mid-sized multi-chips with verbose labels (depth, 6 items with long
  // sentences) stay single-column so each label can breathe on its own row.
  const isLargeGrid = isMulti && (q.options?.length ?? 0) > 8

  // Split the underlying string answer into two halves for the
  // split-text renderer. We use the first whitespace run as the boundary
  // so "Alex Fiore" → first="Alex", second="Fiore". Multi-token last
  // names work ("Van Der Berg" → first="Van", second="Der Berg").
  const splitParts = (() => {
    if (!isSplit) return { first: '', second: '' }
    const idx = singleAnswer.indexOf(' ')
    if (idx === -1) return { first: singleAnswer, second: '' }
    return { first: singleAnswer.slice(0, idx), second: singleAnswer.slice(idx + 1) }
  })()
  const onFirstChange = (v: string) => onTextChange(`${v} ${splitParts.second}`.replace(/\s+$/, ''))
  const onSecondChange = (v: string) => onTextChange(`${splitParts.first} ${v}`.replace(/^\s+/, ''))

  useEffect(() => {
    if ((isText || isSplit) && autoFocus && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 380)
      return () => clearTimeout(t)
    }
  }, [isText, isSplit, autoFocus, q.id])

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEnterKey?.()
    }
  }

  const letter = (i: number) => String.fromCharCode(65 + i)

  // Welcome screen — full-bleed hero with a single CTA. No step number,
  // no input. Clicking the CTA advances via the same onEnterKey hook
  // QuizV2Client uses for text-input Enter.
  if (isWelcome) {
    return (
      <div className="text-center py-4 sm:py-10">
        <h1 className="text-[28px] sm:text-[36px] md:text-[40px] font-black text-gray-900 leading-[1.05] mb-3 sm:mb-4">
          {label}
        </h1>
        {sublabel && (
          <p className="text-[15px] sm:text-[17px] text-gray-500 leading-relaxed mb-6 sm:mb-9 max-w-md mx-auto whitespace-pre-wrap">
            {sublabel}
          </p>
        )}
        <button
          type="button"
          onClick={() => onEnterKey?.()}
          className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl font-bold text-[15px] text-white transition-all active:scale-[0.99] hover:opacity-90"
          style={{ backgroundColor: accent }}
        >
          {q.ctaText?.trim() || 'Get started'} →
        </button>
        <p className="mt-5 text-[11px] text-gray-400">
          Takes about 90 seconds · Press <kbd className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] text-gray-500 font-mono">Enter ↵</kbd> to begin
        </p>
      </div>
    )
  }

  return (
    <>
      {/* A small accent chevron marks the prompt without exposing a question
          number — numbering is misleading once steps can be skipped. */}
      <div className="flex items-center gap-1.5 mb-3 sm:mb-5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>

      <h1 className="text-[22px] sm:text-[26px] md:text-[30px] font-bold text-gray-900 leading-tight mb-1.5 sm:mb-2">{label}</h1>
      {sublabel ? <p className="text-[13px] sm:text-[15px] text-gray-500 mb-3 sm:mb-4">{sublabel}</p> : <div className="mb-4 sm:mb-6" />}

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

      {isSplit && (
        <div className="mb-7" onKeyDown={onInputKeyDown}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              {q.firstFieldLabel && (
                <span className="block text-[11px] uppercase tracking-widest text-gray-400 mb-1.5">{q.firstFieldLabel}</span>
              )}
              <input
                ref={inputRef}
                type="text"
                value={splitParts.first}
                onChange={e => onFirstChange(e.target.value)}
                placeholder={q.firstFieldPlaceholder}
                className="w-full text-[17px] text-gray-900 placeholder-gray-300 bg-transparent border-b-2 pb-3 outline-none transition-colors duration-200 border-gray-200"
                onFocus={e => { e.currentTarget.style.borderBottomColor = accent }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = '' }}
              />
            </label>
            <label className="block">
              {q.secondFieldLabel && (
                <span className="block text-[11px] uppercase tracking-widest text-gray-400 mb-1.5">{q.secondFieldLabel}</span>
              )}
              <input
                type="text"
                value={splitParts.second}
                onChange={e => onSecondChange(e.target.value)}
                placeholder={q.secondFieldPlaceholder}
                className="w-full text-[17px] text-gray-900 placeholder-gray-300 bg-transparent border-b-2 pb-3 outline-none transition-colors duration-200 border-gray-200"
                onFocus={e => { e.currentTarget.style.borderBottomColor = accent }}
                onBlur={e => { e.currentTarget.style.borderBottomColor = '' }}
              />
            </label>
          </div>
          {inputError && <p className="mt-2 text-sm text-red-500">{inputError}</p>}
          <p className="mt-3 text-xs text-gray-400">Press <kbd className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[11px] text-gray-500 font-mono">Enter ↵</kbd> to continue</p>
        </div>
      )}

      {isSingle && q.options && q.layout === 'horizontal' && (
        <div className="mb-5 sm:mb-7">
          {/* Connector track that runs through all the chip centers. */}
          <div className="relative">
            <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-[2px] bg-gray-200" aria-hidden />
            <div className="relative grid gap-2" style={{ gridTemplateColumns: `repeat(${q.options.length}, minmax(0, 1fr))` }}>
              {q.options.map((opt, i) => {
                const sel = singleAnswer === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onSingleSelect(opt.value)}
                    className={`relative flex flex-col items-center justify-center gap-1.5 py-3 sm:py-4 rounded-xl border-2 transition-all duration-150 active:scale-[0.97] ${sel ? '' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                    style={sel ? { borderColor: accent, backgroundColor: `${accent}10` } : {}}
                  >
                    <span className={`flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-black transition-all duration-150 ${sel ? 'text-white' : 'bg-gray-100 text-gray-500'}`} style={sel ? { backgroundColor: accent } : {}}>
                      {i + 1}
                    </span>
                    {opt.emoji && <span className="text-[16px] leading-none">{opt.emoji}</span>}
                    <span className={`text-[11px] sm:text-[12px] font-bold text-center leading-tight px-1 ${sel ? '' : 'text-gray-700'}`} style={sel ? { color: accent } : {}}>
                      {opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {isSingle && q.options && q.layout !== 'horizontal' && (
        <div className="flex flex-col gap-2 sm:gap-2.5 mb-4 sm:mb-7">
          {q.options.map((opt, i) => {
            const sel = singleAnswer === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSingleSelect(opt.value)}
                className={`flex items-center gap-3 w-full px-3.5 sm:px-4 py-2.5 sm:py-3.5 rounded-xl border-2 text-left transition-all duration-150 active:scale-[0.99] ${sel ? 'bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}
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
        <div className={`mb-4 sm:mb-7 ${isLargeGrid ? 'grid grid-cols-2 gap-2 sm:gap-2.5' : 'flex flex-col gap-2 sm:gap-2.5'}`}>
          {q.options.map(opt => {
            const sel = multiAnswer.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onMultiToggle(opt.value)}
                className={`flex items-center gap-3 w-full px-3.5 sm:px-4 py-2.5 sm:py-3.5 rounded-xl border-2 text-left transition-all duration-150 active:scale-[0.99] ${sel ? 'bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}
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
