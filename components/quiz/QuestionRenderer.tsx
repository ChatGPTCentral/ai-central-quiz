'use client'

// Question renderer — funnel-handoff shell. Same props API as before (the
// admin editor preview mounts this component too); only the presentation
// changed: mono key squares, 3px-reading fulvous selected states, 2-col
// compact grids for long multi-selects, editorial input fields, the friction
// "LOGGED" strip, and the blinking ADVANCING… microlabel.

import { useRef, useEffect, useState } from 'react'
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
  /** Accent color (theme override). The funnel design is token-fixed; the
   *  accent only tints editor-configured welcome CTAs. */
  accent?: string
  /** Whether to autofocus the text input on mount/step-change */
  autoFocus?: boolean
  /** Whether single-selects auto-advance on tap (false on the final step,
   *  where the shell renders a submit button instead). Gates the
   *  "tap an answer to continue" / "ADVANCING…" microlabels. */
  autoAdvances?: boolean
  /** Token context for piping in label/sublabel. */
  tokens?: TokenContext
  onSingleSelect: (value: string) => void
  onMultiToggle: (value: string) => void
  onTextChange: (value: string) => void
  onEnterKey?: () => void
}

const INK = '#333333'
const RICH = '#1A1A1A'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const MUTE = '#666666'

const KEYS = 'ABCDEFGHIJ'

function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block font-mono mb-1.5" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: MUTE }}>
      {children}
    </span>
  )
}

/** Editorial text field: 2px ink border, 3px-reading fulvous focus state. */
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { inputRef?: React.Ref<HTMLInputElement> }) {
  const { inputRef, style, onFocus, onBlur, ...rest } = props
  const [focused, setFocused] = useState(false)
  return (
    <input
      ref={inputRef}
      {...rest}
      onFocus={e => { setFocused(true); onFocus?.(e) }}
      onBlur={e => { setFocused(false); onBlur?.(e) }}
      className="w-full outline-none"
      style={{
        fontSize: 16, // ≥16px prevents iOS zoom
        padding: '13px 14px',
        color: RICH,
        backgroundColor: '#FFFFFF',
        border: `2px solid ${focused ? FULVOUS : INK}`,
        boxShadow: focused ? `inset 0 0 0 1px ${FULVOUS}` : 'none',
        borderRadius: 0,
        ...style,
      }}
    />
  )
}

export function QuestionRenderer({
  question: q,
  singleAnswer,
  multiAnswer,
  inputError,
  accent = FULVOUS,
  autoFocus = false,
  autoAdvances = true,
  tokens,
  onSingleSelect,
  onMultiToggle,
  onTextChange,
  onEnterKey,
}: Props) {
  const label = resolveTokens(q.label, tokens ?? {})
  const sublabel = q.sublabel ? resolveTokens(q.sublabel, tokens ?? {}) : undefined
  const inputRef = useRef<HTMLInputElement>(null)
  const isWelcome = q.type === 'welcome'
  const isText = q.type === 'text' || q.type === 'email'
  const isSplit = q.type === 'split-text'
  const isSingle = q.type === 'chips'
  const isMulti = q.type === 'multi-chips'
  // 2-col compact grid for long option lists (tools 16, work areas 14) so
  // everything fits one mobile viewport; short lists stay full-width rows.
  const isGrid = isMulti && (q.options?.length ?? 0) > 8

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
      const t = setTimeout(() => inputRef.current?.focus(), 300)
      return () => clearTimeout(t)
    }
  }, [q.id, isText, isSplit, autoFocus])

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onEnterKey?.() }
  }

  if (isWelcome) {
    return (
      <div className="py-6">
        <h1 className="font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.05, letterSpacing: '-0.03em', color: RICH }}>
          {label}
        </h1>
        {sublabel && <p className="mt-3 whitespace-pre-wrap" style={{ fontSize: 14.5, color: MUTE, lineHeight: 1.5 }}>{sublabel}</p>}
        <button
          type="button"
          onClick={() => onEnterKey?.()}
          className="mt-6 inline-flex items-center justify-center transition-transform active:scale-[0.98]"
          style={{ backgroundColor: accent, color: '#FFFFFF', fontWeight: 600, fontSize: 16, padding: '15px 26px' }}
        >
          {q.ctaText?.trim() || 'Get started'} ↗
        </button>
      </div>
    )
  }

  return (
    <>
      <h2 className="font-bold" style={{ fontSize: 'clamp(24px, 2.8vw, 40px)', lineHeight: 1.08, letterSpacing: '-0.03em', color: RICH }}>
        {label}
      </h2>
      {sublabel ? <p className="mt-1.5" style={{ fontSize: 13, color: MUTE }}>{sublabel}</p> : null}
      {/* Gap before options — compresses on short viewports (no-scroll budget) */}
      <div style={{ height: 'clamp(8px, 1.8dvh, 24px)' }} />

      {/* ── Name (split text): stacked fields, mono microlabels ── */}
      {isSplit && (
        <div onKeyDown={onInputKeyDown} className="flex flex-col gap-3.5">
          <label className="block">
            <MonoLabel>{(q.firstFieldLabel || 'First name').toUpperCase()}</MonoLabel>
            <Field
              inputRef={inputRef}
              type="text"
              value={splitParts.first}
              onChange={e => onFirstChange(e.target.value)}
              placeholder={q.firstFieldPlaceholder}
              autoComplete="given-name"
              autoCapitalize="words"
              enterKeyHint="next"
            />
          </label>
          <label className="block">
            <MonoLabel>{(q.secondFieldLabel || 'Last name').toUpperCase()}</MonoLabel>
            <Field
              type="text"
              value={splitParts.second}
              onChange={e => onSecondChange(e.target.value)}
              placeholder={q.secondFieldPlaceholder}
              autoComplete="family-name"
              autoCapitalize="words"
              enterKeyHint="next"
            />
          </label>
          {inputError && <p style={{ fontSize: 12.5, color: '#BE3B3B' }}>{inputError}</p>}
        </div>
      )}

      {/* ── Text / email ─────────────────────────────────────── */}
      {isText && (
        <div onKeyDown={onInputKeyDown}>
          <label className="block">
            <MonoLabel>{q.type === 'email' ? 'EMAIL' : 'YOUR ANSWER'}</MonoLabel>
            <Field
              inputRef={inputRef}
              type={q.type === 'email' ? 'email' : 'text'}
              value={singleAnswer}
              onChange={e => onTextChange(e.target.value)}
              placeholder={q.placeholder}
              inputMode={q.type === 'email' ? 'email' : undefined}
              autoComplete={q.type === 'email' ? 'email' : undefined}
              enterKeyHint={q.type === 'email' ? 'go' : 'next'}
              style={inputError ? { borderColor: '#BE3B3B', boxShadow: 'inset 0 0 0 1px #BE3B3B' } : undefined}
            />
          </label>
          {inputError && <p className="mt-2" style={{ fontSize: 12.5, color: '#BE3B3B' }}>{inputError}</p>}
        </div>
      )}

      {/* ── Single select: key-square rows, tap advances ─────── */}
      {isSingle && q.options && (
        <div className="flex flex-col" style={{ gap: 'clamp(5px, 1dvh, 8px)' }}>
          {q.options.map((opt, i) => {
            const sel = singleAnswer === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSingleSelect(opt.value)}
                className="w-full flex items-center gap-3 text-left transition-all duration-100 active:scale-[0.98]"
                style={{
                  border: `2px solid ${sel ? FULVOUS : INK}`,
                  boxShadow: sel ? `inset 0 0 0 1px ${FULVOUS}` : 'none',
                  backgroundColor: sel ? CREAM : '#FFFFFF',
                  padding: 'clamp(7px, 1.3dvh, 11px) 14px',
                }}
              >
                <span
                  className="flex-shrink-0 flex items-center justify-center font-mono"
                  style={{
                    width: 26, height: 26, fontSize: 12, fontWeight: 600,
                    backgroundColor: sel ? FULVOUS : INK,
                    color: sel ? RICH : CREAM,
                  }}
                >
                  {KEYS[i] ?? '·'}
                </span>
                <span style={{ fontSize: 15, fontWeight: 500, color: RICH, lineHeight: 1.3 }}>{opt.label}</span>
                {sel && <span className="ml-auto flex-shrink-0" style={{ color: FULVOUS, fontWeight: 700, fontSize: 16 }} aria-hidden>✓</span>}
              </button>
            )
          })}

          {autoAdvances && !singleAnswer && (
            <p className="text-center mt-1.5" style={{ fontSize: 11.5, color: '#9C9C9C' }}>
              tap an answer to continue
            </p>
          )}
          {autoAdvances && singleAnswer && (
            <p className="text-center mt-1.5 font-mono qr-blink" style={{ fontSize: 10.5, letterSpacing: '0.1em', color: FULVOUS }}>
              ADVANCING…
            </p>
          )}
        </div>
      )}

      {/* ── Multi select: compact 2-col grid or full-width rows ── */}
      {isMulti && q.options && (
        <div
          className={isGrid ? 'grid grid-cols-2' : 'flex flex-col'}
          style={{ gap: 'clamp(5px, 1dvh, 8px)' }}
        >
          {q.options.map(opt => {
            const sel = multiAnswer.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onMultiToggle(opt.value)}
                className="flex items-center gap-2.5 text-left transition-all duration-100 active:scale-[0.98]"
                style={{
                  border: `2px solid ${sel ? FULVOUS : INK}`,
                  backgroundColor: sel ? CREAM : '#FFFFFF',
                  padding: isGrid ? 'clamp(6px, 1.2dvh, 10px) 10px' : 'clamp(7px, 1.3dvh, 11px) 14px',
                }}
              >
                <span
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: 15, height: 15,
                    border: `2px solid ${sel ? FULVOUS : INK}`,
                    backgroundColor: sel ? FULVOUS : '#FFFFFF',
                  }}
                  aria-hidden
                >
                  {sel && (
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5.5L4 8L8.5 2.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {opt.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={opt.logo} alt="" className="flex-shrink-0 object-contain" style={{ width: 18, height: 18 }} />
                ) : opt.emoji ? (
                  <span className="flex-shrink-0" style={{ fontSize: 15, lineHeight: 1 }}>{opt.emoji}</span>
                ) : null}
                <span style={{ fontSize: isGrid ? 13 : 14, fontWeight: 500, color: RICH, lineHeight: 1.3 }}>
                  {opt.label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes qr-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
        .qr-blink { animation: qr-blink 1s step-end infinite; }
        @media (prefers-reduced-motion: reduce) { .qr-blink { animation: none; } }
      `}</style>
    </>
  )
}
