'use client'

// Quiz shell — funnel-handoff design (mobile-first, no scroll, email last).
// The state machine and data pipeline are UNCHANGED from the previous shell:
// answers are keyed by question id, branching goes through resolveNextStep,
// the partial-lead POST fires once name + valid email exist, and completion
// POSTs {answers, utmSource, utmRef} to /api/submit-quiz-v2 before routing
// to /calculating with name/score/persona/stage/id.

import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { resolveNextStep, type V2Question } from '@/lib/form-schema'
import { QuestionRenderer } from '@/components/quiz/QuestionRenderer'
import { BandStrip } from '@/components/result/BandChart'
import { track } from '@/lib/track'

type Answers = Record<string, string | string[]>

interface Props {
  questions: V2Question[]
  accent?: string
}

const DEFAULT_ACCENT = '#E48715'
// localStorage key for the in-progress draft (answers + step), so a refresh
// or accidental navigation never loses what's been entered.
const DRAFT_KEY = 'ac_quiz_v2_draft'

// Design tokens (funnel handoff)
const INK = '#333333'
const RICH = '#1A1A1A'
const CREAM = '#FEF7E7'
const PAPER = '#FFFDFA'
const FULVOUS = '#E48715'
const XANTHOUS = '#E7B02F'
const MUTE = '#666666'
const HAIRLINE = '#D9D9D9'

// Per-question eyebrow metadata: axis label + remaining-time estimate
// (static labels per the handoff; recompute nothing).
const UI_META: Record<string, { axis?: string; secs?: string }> = {
  name: { secs: '~40 sec' },
  frequency: { axis: 'your habit', secs: '~36 sec' },
  aiTools: { axis: 'your toolkit', secs: '~32 sec' },
  depth: { axis: 'your depth', secs: '~27 sec' },
  momentum: { axis: 'your momentum', secs: '~23 sec' },
  friction: { axis: 'your blocker', secs: '~19 sec' },
  workArea: { axis: 'your focus', secs: '~14 sec' },
  jobLevel: { axis: 'your seniority', secs: '~10 sec' },
  intent_30d: { axis: 'your goal', secs: '~6 sec' },
}

// Multi-selects where one option clears the others (tools "None yet").
const EXCLUSIVE_VALUE: Record<string, string> = { aiTools: 'None' }

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Two-piece block button (label cell + arrow cell). */
function BlockNext({
  label, onClick, disabled = false, gold = false, fullWidth = false, submitting = false,
}: { label: string; onClick: () => void; disabled?: boolean; gold?: boolean; fullWidth?: boolean; submitting?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || submitting}
      className={`${fullWidth ? 'flex w-full' : 'inline-flex'} transition-transform active:scale-[0.98] disabled:active:scale-100`}
      style={{ opacity: disabled ? 0.35 : 1 }}
    >
      <span
        className="flex-1 inline-flex items-center justify-center"
        style={{
          backgroundColor: gold ? XANTHOUS : INK,
          color: gold ? RICH : CREAM,
          fontWeight: 600, fontSize: 16, height: 50, padding: '0 22px',
        }}
      >
        {submitting ? 'sending…' : label}
      </span>
      <span
        className="inline-flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: gold ? CREAM : FULVOUS,
          color: RICH, width: 50, height: 50,
          borderLeft: `2px solid ${RICH}`, fontWeight: 600, fontSize: 16,
        }}
        aria-hidden
      >
        ↗
      </span>
    </button>
  )
}

function QuizV2Content({ questions, accent = DEFAULT_ACCENT }: Props) {
  const QUESTIONS = questions
  const TOTAL_STEPS = QUESTIONS.length
  const ACCENT = accent

  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState(1)
  const [history, setHistory] = useState<number[]>([1])
  const [answers, setAnswers] = useState<Answers>({})
  const [inputError, setInputError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [direction, setDirection] = useState<'fwd' | 'back'>('fwd')
  const [animKey, setAnimKey] = useState(0)
  // Checkpoint interstitial (after the friction question): holds the step it
  // continues to; null = hidden.
  const [checkpoint, setCheckpoint] = useState<number | null>(null)
  const advanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emailPrefilled = useRef(false)
  const partialSent = useRef(false)
  const startTracked = useRef(false)
  const stepShownAt = useRef(Date.now())

  // Embed-mode plumbing (same protocol as /quiz)
  const isEmbed = searchParams.get('embed') === '1' || searchParams.get('ac-embed-id') !== null
  const embedId = searchParams.get('ac-embed-id') || ''
  const postToParent = useCallback((data: Record<string, unknown>) => {
    if (typeof window === 'undefined' || window.parent === window) return
    window.parent.postMessage({ ...data, embedId, source: 'ai-central-quiz' }, '*')
  }, [embedId])
  useEffect(() => { if (isEmbed) postToParent({ type: 'embed_ready' }) }, [isEmbed, postToParent])
  useEffect(() => {
    if (!isEmbed) return
    const send = () => postToParent({ type: 'form_resized', size: document.body.scrollHeight })
    send()
    const t = setTimeout(send, 400)
    return () => clearTimeout(t)
  }, [step, isEmbed, postToParent])

  // Mount: (1) restore an in-progress draft so a refresh / accidental nav
  // doesn't lose answers, then (2) pre-fill the email answer from ?email=
  // (the URL param wins over a stale draft email). We do NOT jump the step
  // for the email param — the advance logic skips the email question when
  // it's reached (it now sits at the END of the flow).
  useEffect(() => {
    if (emailPrefilled.current) return
    emailPrefilled.current = true

    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw) as { answers?: Answers; step?: number; history?: number[]; ts?: number }
        const fresh = draft.ts && Date.now() - draft.ts < 1000 * 60 * 60 * 24 // 24h
        if (fresh && draft.answers && Object.keys(draft.answers).length > 0) {
          setAnswers(draft.answers)
          if (typeof draft.step === 'number' && draft.step >= 1 && draft.step <= TOTAL_STEPS) {
            setStep(draft.step)
            setHistory(Array.isArray(draft.history) && draft.history.length ? draft.history : [draft.step])
          }
        }
      }
    } catch { /* ignore corrupt draft */ }

    const urlEmail = searchParams.get('email')
    if (urlEmail) {
      const cleaned = urlEmail.trim().toLowerCase()
      setAnswers(prev => ({ ...prev, email: cleaned }))
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // quiz_start — Q1 shown (once per mount, after possible draft restore).
  useEffect(() => {
    if (startTracked.current) return
    startTracked.current = true
    track('quiz_start')
  }, [])

  // Persist the in-progress draft on every answer/step change.
  useEffect(() => {
    if (Object.keys(answers).length === 0) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, step, history, ts: Date.now() }))
    } catch { /* storage full / unavailable — non-fatal */ }
  }, [answers, step, history])

  // Server-side in-progress capture: once we have a name + a valid email,
  // POST a partial (once) so the lead is collected even if they abandon.
  // With email as the last step this effectively fires right before submit,
  // acting as a safety net if the final POST fails (accepted trade-off in
  // the handoff: pre-Q10 abandoners are not captured).
  useEffect(() => {
    if (partialSent.current) return
    const name = String(answers.name || '').trim()
    const email = String(answers.email || '').trim().toLowerCase()
    if (!name || !isValidEmail(email)) return
    partialSent.current = true
    const utmSource =
      searchParams.get('utm_source') || searchParams.get('utmSource') || searchParams.get('source') || ''
    const utmRef =
      searchParams.get('utm_ref') || searchParams.get('ref') || searchParams.get('utm_medium') || searchParams.get('utm_campaign') || ''
    fetch('/api/submit-quiz-v2/partial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers, utmSource, utmRef }),
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ })
  }, [answers, searchParams])

  const q = QUESTIONS[step - 1]
  const singleAnswer = (answers[q.id] as string) || ''
  const multiAnswer = (answers[q.id] as string[]) || []

  const nextResolved = resolveNextStep(step - 1, QUESTIONS, answers)
  const isLastStep = nextResolved === 'end'
  const isWelcome = q.type === 'welcome'
  const isText = q.type === 'text' || q.type === 'email'
  const isSplit = q.type === 'split-text'
  const isMulti = q.type === 'multi-chips'
  const isSingle = q.type === 'chips'
  const isEmailStep = q.type === 'email' || q.id === 'email'
  const isAutoAdvance = isSingle && !isLastStep

  // Reset the on-screen timer whenever the step changes; fire email_view.
  useEffect(() => {
    stepShownAt.current = Date.now()
    if (isEmailStep) track('email_view')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const canProceed = useCallback((): boolean => {
    if (isWelcome) return true
    if (isMulti) return !q.required || multiAnswer.length > 0
    if (!q.required) return true
    if (q.type === 'split-text') {
      const parts = singleAnswer.split(/\s+/).filter(Boolean)
      return parts.length >= 2
    }
    return singleAnswer.trim().length > 0
  }, [isWelcome, isMulti, q.required, q.type, multiAnswer, singleAnswer])

  const validateStep = (): boolean => {
    if (q.type === 'email') {
      if (!isValidEmail(singleAnswer)) {
        setInputError('Please enter a valid email address')
        return false
      }
    }
    setInputError('')
    return true
  }

  const trackAnswered = useCallback(() => {
    track('q_answered', { n: step, ms_on_screen: Date.now() - stepShownAt.current })
  }, [step])

  const goForward = useCallback((targetStep: number) => {
    setDirection('fwd')
    setAnimKey(k => k + 1)
    setStep(targetStep)
    setHistory(h => h[h.length - 1] === targetStep ? h : [...h, targetStep])
  }, [])

  const goBack = useCallback(() => {
    if (advanceTimeout.current) clearTimeout(advanceTimeout.current)
    if (history.length <= 1) return
    setDirection('back')
    setAnimKey(k => k + 1)
    const prev = history.slice(0, -1)
    setHistory(prev)
    setStep(prev[prev.length - 1])
    setInputError('')
    setSubmitError('')
  }, [history])

  const advance = useCallback(async () => {
    if (!canProceed() || !validateStep()) return

    if (!isLastStep) {
      trackAnswered()
      const target = nextResolved + 1
      const targetQ = QUESTIONS[target - 1]
      // If the next question IS the email step and we have a valid pre-filled
      // email, skip over it (position-independent — with email last, skipping
      // lands on 'end', which we reach by advancing from the current step
      // once more via submit on the email step; here we only skip when email
      // is NOT last, or fall through to it otherwise).
      const urlEmail = searchParams.get('email')?.trim().toLowerCase()
      if (
        targetQ &&
        (targetQ.id === 'email' || targetQ.type === 'email') &&
        urlEmail && isValidEmail(urlEmail)
      ) {
        const afterEmail = resolveNextStep(target - 1, QUESTIONS, answers)
        goForward(afterEmail === 'end' ? target : afterEmail + 1)
        return
      }
      goForward(target)
      return
    }

    setSubmitting(true)
    setSubmitError('')
    try {
      const utmSource =
        searchParams.get('utm_source') ||
        searchParams.get('utmSource') ||
        searchParams.get('source') || ''
      const utmRef =
        searchParams.get('utm_ref') ||
        searchParams.get('ref') ||
        searchParams.get('utm_medium') ||
        searchParams.get('utm_campaign') || ''

      const res = await fetch('/api/submit-quiz-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, utmSource, utmRef }),
      })
      const data = await res.json()
      if (!data.success) {
        setSubmitError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      trackAnswered()
      track('email_submitted')
      // Submitted successfully — clear the in-progress draft.
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* non-fatal */ }
      sessionStorage.setItem('ac_quiz_offer_start', String(Date.now()))
      if (isEmbed) {
        postToParent({
          type: 'form_submitted',
          persona: data.persona,
          name: data.name,
          score: data.score,
          email: String(answers.email || ''),
        })
        setSubmitting(false)
        return
      }
      const params = new URLSearchParams({
        name: data.name,
        score: String(data.score),
      })
      if (data.persona) params.set('persona', data.persona)
      if (data.stage) params.set('stage', data.stage)
      if (data.id) params.set('id', data.id)
      router.push(`/calculating?${params.toString()}`)
    } catch {
      setSubmitError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }, [step, answers, canProceed, goForward, router, searchParams, isEmbed, postToParent, isLastStep, nextResolved, trackAnswered]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSingleSelect = (value: string) => {
    const newAnswers = { ...answers, [q.id]: value }
    setAnswers(newAnswers)
    setInputError('')
    if (isAutoAdvance) {
      if (advanceTimeout.current) clearTimeout(advanceTimeout.current)
      const nr = resolveNextStep(step - 1, QUESTIONS, newAnswers)
      if (nr === 'end') return
      // 250ms select-paint beat; 900ms on the friction question so the
      // LOGGED strip can land (handoff 1g). Friction also opens the
      // checkpoint interstitial instead of advancing directly.
      const isFriction = q.id === 'friction'
      const delay = isFriction ? 900 : 250
      advanceTimeout.current = setTimeout(() => {
        trackAnswered()
        if (isFriction && !isEmbed) {
          setCheckpoint(nr + 1)
          track('checkpoint_view')
        } else {
          goForward(nr + 1)
        }
      }, delay)
    }
  }
  const handleMultiToggle = (value: string) => {
    setAnswers(prev => {
      const cur = (prev[q.id] as string[]) || []
      const exclusive = EXCLUSIVE_VALUE[q.id]
      let next: string[]
      if (cur.includes(value)) {
        next = cur.filter(v => v !== value)
      } else if (exclusive && value === exclusive) {
        next = [value] // "None yet" clears everything else
      } else {
        next = [...cur.filter(v => v !== exclusive), value] // any pick clears "None yet"
      }
      return { ...prev, [q.id]: next }
    })
    setInputError('')
  }
  const handleTextChange = (value: string) => {
    setAnswers(prev => ({ ...prev, [q.id]: value }))
    setInputError('')
  }

  // Checkpoint continue (tap or 5s auto).
  const continueFromCheckpoint = useCallback((skipped: boolean) => {
    setCheckpoint(prev => {
      if (prev === null) return null
      if (skipped) track('checkpoint_skip')
      goForward(prev)
      return null
    })
  }, [goForward])
  useEffect(() => {
    if (checkpoint === null) return
    const t = setTimeout(() => continueFromCheckpoint(false), 5000)
    return () => clearTimeout(t)
  }, [checkpoint, continueFromCheckpoint])

  useEffect(() => {
    if (!isSingle || !q.options) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const idx = e.key.toUpperCase().charCodeAt(0) - 65
      if (idx >= 0 && idx < (q.options?.length ?? 0)) {
        e.preventDefault()
        handleSingleSelect(q.options![idx].value)
      }
      if (e.key === 'Enter' && singleAnswer) {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, singleAnswer, isSingle]) // eslint-disable-line react-hooks/exhaustive-deps

  // Whether the answers so far show any AI usage signal (checkpoint headline).
  const hasUsageSignal = (() => {
    const freq = String(answers.frequency ?? '')
    const tools = (answers.aiTools as string[]) || []
    const depth = (answers.depth as string[]) || []
    return (freq !== '' && freq !== '0') || tools.some(t => t !== 'None') || depth.length > 0
  })()

  const meta = UI_META[q.id] || {}
  const eyebrow = isEmailStep
    ? 'LAST STEP · PASS NO. AC-0723 DRAFTED'
    : `QUESTION ${step} OF ${TOTAL_STEPS}${meta.axis ? ` · ${meta.axis.toUpperCase()}` : ''}${meta.secs ? ` · ${meta.secs.toUpperCase()}` : ''}`

  const multiCount = multiAnswer.length

  return (
    <div className={`${isEmbed ? 'min-h-0' : 'min-h-[100dvh] h-[100dvh]'} flex flex-col overflow-hidden`} style={{ backgroundColor: PAPER }}>
      {/* Progress: 10 segments, full-bleed top */}
      <div className={`${isEmbed ? 'sticky' : 'fixed'} top-0 left-0 right-0 z-50 flex`} style={{ gap: 2, height: 4 }}>
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className="flex-1 transition-colors duration-300"
            style={{ backgroundColor: i < step - 1 ? INK : i === step - 1 ? FULVOUS : HAIRLINE }}
          />
        ))}
      </div>

      {/* Header: back · wordmark · counter */}
      {!isEmbed && (
        <header
          className="flex items-center justify-between shrink-0 px-1.5 min-[900px]:px-8"
          style={{ height: 42, marginTop: 4 }}
        >
          <button
            onClick={goBack}
            disabled={history.length <= 1}
            aria-label="Previous question"
            className="flex items-center justify-center"
            style={{ width: 44, height: 42, color: history.length <= 1 ? HAIRLINE : INK, fontSize: 18 }}
          >
            ←
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-full-light-bg.png" alt="AI Central" style={{ height: 13, width: 'auto' }} />
          <span className="font-mono text-right" style={{ width: 44, fontSize: 11, color: MUTE, paddingRight: 6 }}>
            Q{step}/{TOTAL_STEPS}
          </span>
        </header>
      )}

      {/* Body */}
      <main className="flex-1 min-h-0 overflow-y-auto px-5 min-[900px]:px-8 pt-3 min-[900px]:pt-8 pb-4">
        <div className="w-full max-w-[800px] mx-auto">
          <div key={animKey} className={direction === 'fwd' ? 'tf-enter-fwd' : 'tf-enter-back'}>
            <p className="uppercase mb-2.5" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: FULVOUS }}>
              {eyebrow}
            </p>

            <QuestionRenderer
              question={q}
              singleAnswer={singleAnswer}
              multiAnswer={multiAnswer}
              stepNumber={step}
              inputError={inputError}
              accent={ACCENT}
              autoFocus
              tokens={{ answers }}
              onSingleSelect={handleSingleSelect}
              onMultiToggle={handleMultiToggle}
              onTextChange={handleTextChange}
              onEnterKey={advance}
            />

            {submitError && (
              <div className="mt-4 p-3" style={{ border: '2px solid #BE3B3B', backgroundColor: '#FFF5F5' }}>
                <p style={{ fontSize: 13, color: '#BE3B3B' }}>{submitError}</p>
              </div>
            )}

            {/* Text steps: block button right under the inputs (keyboard-safe) */}
            {(isText || isSplit || isWelcome) && !isWelcome && (
              <div className="mt-5">
                <BlockNext
                  label={isEmailStep ? 'get my result' : 'next'}
                  onClick={advance}
                  disabled={!canProceed()}
                  submitting={submitting}
                  fullWidth
                />
                {isEmailStep && (
                  <div className="mt-3 text-center">
                    <p style={{ fontSize: 11.5, color: MUTE }}>no spam, 1 weekly editorial drop, unsubscribe anytime</p>
                    <p className="mt-1" style={{ fontSize: 11.5, color: '#9C9C9C' }}>2,768 professionals took this quiz this month</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Multi-select pinned bottom bar: "N selected" + next */}
      {isMulti && (
        <div
          className="shrink-0 flex items-center justify-between gap-4 px-5 min-[900px]:px-8 py-3"
          style={{ borderTop: `2px solid ${INK}`, backgroundColor: PAPER, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <span className="font-mono" style={{ fontSize: 11, letterSpacing: '0.08em', color: multiCount > 0 ? INK : '#9C9C9C' }}>
            {multiCount} SELECTED
          </span>
          <BlockNext label="next" onClick={advance} disabled={!canProceed()} submitting={submitting} />
        </div>
      )}

      {/* Checkpoint interstitial (after Q6 friction) */}
      {checkpoint !== null && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-6 text-center cursor-pointer"
          style={{ backgroundColor: RICH, color: CREAM }}
          onClick={() => continueFromCheckpoint(true)}
        >
          <p className="font-mono uppercase" style={{ fontSize: 11, letterSpacing: '0.14em', color: XANTHOUS }}>
            Checkpoint · 6 of {TOTAL_STEPS} answered
          </p>
          <h2 className="mt-4 font-bold" style={{ fontSize: 'clamp(26px, 3.2vw, 38px)', lineHeight: 1.05, letterSpacing: '-0.03em' }}>
            {hasUsageSignal ? "You're already past 84% of the planet" : 'Your starting line is being drawn'}
          </h2>

          <div className="w-full max-w-[420px] mt-7 text-left">
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: CREAM, opacity: 0.6 }}>
                YOUR POSITION SO FAR
              </span>
              {hasUsageSignal && (
                <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: XANTHOUS }}>
                  AHEAD OF ~84%
                </span>
              )}
            </div>
            <div className="relative">
              <BandStrip height={56} />
              <span
                className="absolute cp-blink"
                style={{
                  top: '50%', left: hasUsageSignal ? '61%' : '25%',
                  transform: 'translate(-50%, -50%)',
                  width: 11, height: 11, borderRadius: '50%',
                  backgroundColor: FULVOUS, border: `2px solid ${CREAM}`,
                  boxShadow: '0 0 0 4px rgba(228,135,21,.3)',
                }}
                aria-hidden
              />
            </div>
          </div>

          <p className="mt-6" style={{ fontSize: 14.5, color: CREAM, opacity: 0.75 }}>
            4 questions left, your pass is half-stamped
          </p>
          <div className="mt-6" onClick={e => { e.stopPropagation(); continueFromCheckpoint(true) }}>
            <BlockNext label="keep going" onClick={() => continueFromCheckpoint(true)} gold />
          </div>
          <p className="mt-4" style={{ fontSize: 11, color: CREAM, opacity: 0.5 }}>auto-continues in 5 seconds</p>

          <style>{`
            @keyframes cp-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
            .cp-blink { animation: cp-blink 1.2s step-end infinite; }
            @media (prefers-reduced-motion: reduce) { .cp-blink { animation: none; } }
          `}</style>
        </div>
      )}
    </div>
  )
}

export default function QuizV2Client({ questions, accent }: Props) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFDFA' }}>
        <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: '#E8E4DF', borderTopColor: '#E48715' }} />
      </div>
    }>
      <QuizV2Content questions={questions} accent={accent} />
    </Suspense>
  )
}
