'use client'

import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'

type Answers = Record<string, string | string[]>
const QUESTIONS = QUESTIONS_V2_MERGED
const TOTAL_STEPS = QUESTIONS.length
const ACCENT = '#046BB1'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function QuizV2Content() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState(1)
  const [answers, setAnswers] = useState<Answers>({})
  const [inputError, setInputError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [direction, setDirection] = useState<'fwd' | 'back'>('fwd')
  const [animKey, setAnimKey] = useState(0)
  const advanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emailPrefilled = useRef(false)

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

  // Pre-fill email from ?email=
  useEffect(() => {
    if (emailPrefilled.current) return
    const urlEmail = searchParams.get('email')
    if (!urlEmail) return
    emailPrefilled.current = true
    const cleaned = urlEmail.trim().toLowerCase()
    setAnswers(prev => ({ ...prev, email: cleaned }))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const q = QUESTIONS[step - 1]
  const singleAnswer = (answers[q.id] as string) || ''
  const multiAnswer = (answers[q.id] as string[]) || []

  const isLastStep = step === TOTAL_STEPS
  const isText = q.type === 'text' || q.type === 'email'
  const isMulti = q.type === 'multi-chips'
  const isSingle = q.type === 'chips'
  const isAutoAdvance = isSingle && !isLastStep
  const showContinue = !isAutoAdvance

  const progressPct = Math.round((step / TOTAL_STEPS) * 100)

  useEffect(() => {
    if (isText && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 380)
    }
  }, [step, isText])

  const canProceed = useCallback((): boolean => {
    if (isMulti) return !q.required || multiAnswer.length > 0
    if (!q.required) return true
    return singleAnswer.trim().length > 0
  }, [isMulti, q.required, multiAnswer, singleAnswer])

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

  const goForward = useCallback((targetStep?: number) => {
    setDirection('fwd')
    setAnimKey(k => k + 1)
    if (targetStep !== undefined) setStep(targetStep)
    else setStep(s => s + 1)
  }, [])

  const goBack = useCallback(() => {
    if (advanceTimeout.current) clearTimeout(advanceTimeout.current)
    if (step <= 1) return
    setDirection('back')
    setAnimKey(k => k + 1)
    setStep(s => s - 1)
    setInputError('')
    setSubmitError('')
  }, [step])

  const advance = useCallback(async () => {
    if (!canProceed() || !validateStep()) return

    if (step < TOTAL_STEPS) {
      // If on step 1 (name) and email was pre-filled, skip step 2
      if (step === 1) {
        const urlEmail = searchParams.get('email')?.trim().toLowerCase()
        if (urlEmail && isValidEmail(urlEmail)) {
          goForward(3)
          return
        }
      }
      goForward()
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
      sessionStorage.setItem('ac_quiz_offer_start', String(Date.now()))
      if (isEmbed) {
        postToParent({
          type: 'form_submitted',
          archetype: data.archetype,
          name: data.name,
          score: data.score,
          email: String(answers.email || ''),
        })
        setSubmitting(false)
        return
      }
      router.push(`/calculating?archetype=${data.archetype}&name=${encodeURIComponent(data.name)}&score=${data.score}`)
    } catch {
      setSubmitError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }, [step, answers, canProceed, goForward, router, searchParams, isEmbed, postToParent]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSingleSelect = (value: string) => {
    setAnswers(prev => ({ ...prev, [q.id]: value }))
    setInputError('')
    if (isAutoAdvance) {
      if (advanceTimeout.current) clearTimeout(advanceTimeout.current)
      advanceTimeout.current = setTimeout(goForward, 300)
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
  const handleSkip = () => { if (!q.required && step < TOTAL_STEPS) goForward() }

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

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); advance() }
  }
  const letter = (i: number) => String.fromCharCode(65 + i)
  const isLargeGrid = isMulti && (q.options?.length ?? 0) > 4

  return (
    <div className={`${isEmbed ? 'min-h-0' : 'min-h-screen'} bg-white flex flex-col`}>
      <div className={`${isEmbed ? 'sticky' : 'fixed'} top-0 left-0 right-0 h-[3px] bg-gray-100 z-50`}>
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPct}%`, backgroundColor: ACCENT }} />
      </div>

      {!isEmbed && (
        <header className="flex items-center justify-between px-6 pt-8 pb-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-full-light-bg.png" alt="AI Central" className="h-6 w-auto" />
          <span className="text-sm font-medium text-gray-400 tabular-nums">
            {step} <span className="text-gray-300">/ {TOTAL_STEPS}</span>
            <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-[#E48715]/15 text-[#E48715] text-[10px] font-bold uppercase tracking-wider">v2</span>
          </span>
        </header>
      )}
      {isEmbed && (
        <div className="flex items-center justify-end px-6 pt-3 pb-1 text-[11px] text-gray-400 tabular-nums">
          {step} / {TOTAL_STEPS}
        </div>
      )}

      <main className="flex-1 flex items-center justify-center px-6 py-6 overflow-hidden">
        <div className="w-full max-w-[580px]">
          <div key={animKey} className={direction === 'fwd' ? 'tf-enter-fwd' : 'tf-enter-back'}>
            <div className="flex items-center gap-1.5 mb-5">
              <span className="text-[13px] font-bold" style={{ color: ACCENT }}>{step}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

            <h1 className="text-[26px] sm:text-[30px] font-bold text-gray-900 leading-tight mb-2">{q.label}</h1>
            {q.sublabel ? <p className="text-[15px] text-gray-500 mb-2">{q.sublabel}</p> : <div className="mb-6" />}
            {q.sublabel && <div className="mb-3" />}

            {isText && (
              <div className="mb-7" onKeyDown={onInputKeyDown}>
                <input
                  ref={inputRef}
                  type={q.type === 'email' ? 'email' : 'text'}
                  value={singleAnswer}
                  onChange={e => handleTextChange(e.target.value)}
                  placeholder={q.placeholder}
                  className={`w-full text-[17px] text-gray-900 placeholder-gray-300 bg-transparent border-b-2 pb-3 outline-none transition-colors duration-200 ${inputError ? 'border-red-400' : 'border-gray-200 focus:border-[#046BB1]'}`}
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
                      onClick={() => handleSingleSelect(opt.value)}
                      className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-150 active:scale-[0.99] ${sel ? 'border-[#046BB1] bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}
                    >
                      <span className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold transition-all duration-150 ${sel ? 'text-white' : 'bg-gray-100 text-gray-500'}`} style={sel ? { backgroundColor: ACCENT } : {}}>
                        {letter(i)}
                      </span>
                      {opt.emoji && <span className="text-[17px] leading-none">{opt.emoji}</span>}
                      <span className={`font-medium text-[15px] ${sel ? 'text-[#046BB1]' : 'text-gray-800'}`}>{opt.label}</span>
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
                      onClick={() => handleMultiToggle(opt.value)}
                      className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-150 active:scale-[0.99] ${sel ? 'border-[#046BB1] bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}
                    >
                      <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border-2 transition-all duration-150 ${sel ? 'border-[#046BB1]' : 'border-gray-300 bg-white'}`} style={sel ? { backgroundColor: ACCENT } : {}}>
                        {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.5L3.8 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      {opt.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={opt.logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                      ) : opt.emoji ? (
                        <span className="text-[17px] leading-none">{opt.emoji}</span>
                      ) : null}
                      <span className={`font-medium text-[14px] leading-snug ${sel ? 'text-[#046BB1]' : 'text-gray-800'}`}>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            )}

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
            <button onClick={goBack} disabled={step === 1} title="Previous" className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 ${step === 1 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-500 hover:bg-gray-100'}`}>
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

export default function QuizV2Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-gray-100 border-t-[#046BB1] animate-spin" />
      </div>
    }>
      <QuizV2Content />
    </Suspense>
  )
}
