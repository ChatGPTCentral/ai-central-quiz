'use client'

import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { resolveNextStep, type V2Question } from '@/lib/form-schema'
import { QuestionRenderer } from '@/components/quiz/QuestionRenderer'

type Answers = Record<string, string | string[]>

interface Props {
  questions: V2Question[]
  accent?: string
}

const DEFAULT_ACCENT = '#046BB1'
// localStorage key for the in-progress draft (answers + step), so a refresh
// or accidental navigation never loses what's been entered.
const DRAFT_KEY = 'ac_quiz_v2_draft'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
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
  const advanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emailPrefilled = useRef(false)
  const partialSent = useRef(false)

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
  // for the email param — the user still starts at Q1 (name); the advance
  // logic below skips the email question when it's reached.
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

  // Persist the in-progress draft on every answer/step change so nothing is
  // lost if the tab is closed or refreshed. Cleared on successful submit.
  useEffect(() => {
    if (Object.keys(answers).length === 0) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, step, history, ts: Date.now() }))
    } catch { /* storage full / unavailable — non-fatal */ }
  }, [answers, step, history])

  // Server-side in-progress capture: once we have a name + a valid email,
  // POST a partial (once) so the lead is collected even if they abandon.
  // No enrichment / Beehiiv / email runs on this — it's deleted on complete.
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

  // Branching-aware "what's next" for this step + answers snapshot.
  const nextResolved = resolveNextStep(step - 1, QUESTIONS, answers)
  const isLastStep = nextResolved === 'end'
  const isWelcome = q.type === 'welcome'
  const isText = q.type === 'text' || q.type === 'email'
  const isMulti = q.type === 'multi-chips'
  const isSingle = q.type === 'chips'
  const isAutoAdvance = isSingle && !isLastStep
  // Welcome screens supply their own CTA inside the renderer; hide the
  // standard Continue button.
  const showContinue = !isAutoAdvance && !isWelcome

  // Visit-count-based progress (fall back to linear) so skipped questions
  // don't show as 0% complete.
  const progressPct = Math.round((step / TOTAL_STEPS) * 100)

  const canProceed = useCallback((): boolean => {
    if (isWelcome) return true
    if (isMulti) return !q.required || multiAnswer.length > 0
    if (!q.required) return true
    // split-text requires BOTH halves filled in (non-whitespace on each side).
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

  // Push a new step onto the visited history and animate forward.
  const goForward = useCallback((targetStep: number) => {
    setDirection('fwd')
    setAnimKey(k => k + 1)
    setStep(targetStep)
    setHistory(h => h[h.length - 1] === targetStep ? h : [...h, targetStep])
  }, [])

  // Pop the visited history so branching paths replay correctly.
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
      // nextResolved is narrowed to a number here (1-indexed target = +1).
      const target = nextResolved + 1
      const targetQ = QUESTIONS[target - 1]
      // If the next question IS the email step and we have a valid pre-filled
      // email, skip over it (position-independent — works wherever email sits).
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
      if (data.id) params.set('id', data.id)
      router.push(`/calculating?${params.toString()}`)
    } catch {
      setSubmitError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }, [step, answers, canProceed, goForward, router, searchParams, isEmbed, postToParent, isLastStep, nextResolved]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSingleSelect = (value: string) => {
    const newAnswers = { ...answers, [q.id]: value }
    setAnswers(newAnswers)
    setInputError('')
    if (isAutoAdvance) {
      if (advanceTimeout.current) clearTimeout(advanceTimeout.current)
      // Re-resolve next using the new value (branching may depend on it).
      const nr = resolveNextStep(step - 1, QUESTIONS, newAnswers)
      if (nr === 'end') return
      advanceTimeout.current = setTimeout(() => goForward(nr + 1), 300)
    }
  }
  const handleMultiToggle = (value: string) => {
    setAnswers(prev => {
      const cur = (prev[q.id] as string[]) || []
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
      return { ...prev, [q.id]: next }
    })
    setInputError('')
  }
  const handleTextChange = (value: string) => {
    setAnswers(prev => ({ ...prev, [q.id]: value }))
    setInputError('')
  }
  const handleSkip = () => {
    if (q.required || isLastStep) return
    goForward(nextResolved + 1)
  }

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

  return (
    <div className={`${isEmbed ? 'min-h-0' : 'min-h-[100dvh] h-[100dvh]'} bg-white flex flex-col overflow-hidden`}>
      <div className={`${isEmbed ? 'sticky' : 'fixed'} top-0 left-0 right-0 h-[6px] bg-[#EFEAE2] z-50`}>
        <div className="h-full transition-all duration-500 ease-out shadow-sm" style={{ width: `${progressPct}%`, backgroundColor: ACCENT }} />
      </div>

      {!isEmbed && (
        <header className="flex items-center justify-center px-4 sm:px-6 pt-3 sm:pt-6 pb-1 sm:pb-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-full-light-bg.png" alt="AI Central" className="h-5 sm:h-6 w-auto" />
        </header>
      )}

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-6 py-3 sm:py-6 overflow-y-auto">
        <div className="w-full max-w-[560px]">
          <div key={animKey} className={direction === 'fwd' ? 'tf-enter-fwd' : 'tf-enter-back'}>
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

            {submitError && <div className="mb-5 p-3.5 bg-red-50 rounded-xl border border-red-100"><p className="text-sm text-red-600">{submitError}</p></div>}

            {showContinue && (
              <div className="flex items-center gap-4">
                <button
                  onClick={advance}
                  disabled={!canProceed() || submitting}
                  className={`inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-[15px] transition-all duration-150 shadow-sm ${canProceed() && !submitting ? 'text-white hover:opacity-90 active:scale-[0.98]' : 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none'}`}
                  style={canProceed() && !submitting ? { backgroundColor: ACCENT } : {}}
                >
                  {submitting ? (
                    <><svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" /></svg> Building your plan…</>
                  ) : (
                    <>{isLastStep ? 'Finish' : 'OK'} <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></>
                  )}
                </button>
                {!q.required && isMulti && (
                  <button onClick={handleSkip} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Skip</button>
                )}
                {isText && <span className="text-xs text-gray-400 hidden sm:block">or press <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[11px] font-mono">Enter ↵</kbd></span>}
              </div>
            )}

            {isAutoAdvance && singleAnswer && (
              <p className="text-xs text-gray-400 mt-3">Press <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[11px] font-mono">Enter ↵</kbd> to continue</p>
            )}
          </div>
        </div>
      </main>

      {!isEmbed && (
        <footer className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <span className="text-xs text-gray-400">{progressPct}% complete</span>
          <div className="flex items-center gap-1">
            <button onClick={goBack} disabled={history.length <= 1} title="Previous" className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 ${history.length <= 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-100'}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button onClick={advance} disabled={!canProceed()} title="Next" className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 ${canProceed() ? 'text-gray-500 hover:bg-gray-100' : 'text-gray-200 cursor-not-allowed'}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}

export default function QuizV2Client({ questions, accent }: Props) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-gray-100 border-t-[#046BB1] animate-spin" />
      </div>
    }>
      <QuizV2Content questions={questions} accent={accent} />
    </Suspense>
  )
}
