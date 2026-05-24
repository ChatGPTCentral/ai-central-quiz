'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const ACCENT = '#046BB1'

const STEPS = [
  { label: 'Analyzing your responses', duration: 900 },
  { label: 'Matching your profile to our database', duration: 900 },
  { label: 'Selecting your workflow guides', duration: 900 },
  { label: 'Building your personalized plan', duration: 900 },
]

function CalculatingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const archetype = searchParams.get('archetype')
  const name = searchParams.get('name')
  const score = searchParams.get('score') || ''

  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  useEffect(() => {
    if (!archetype || !name) {
      router.replace('/')
      return
    }

    let stepIndex = 0

    const advance = () => {
      if (stepIndex < STEPS.length) {
        const delay = STEPS[stepIndex].duration
        setTimeout(() => {
          setCompletedSteps(prev => [...prev, stepIndex])
          stepIndex++
          setCurrentStep(stepIndex)
          if (stepIndex < STEPS.length) advance()
          else {
            setTimeout(() => {
              router.replace(`/result?archetype=${archetype}&name=${encodeURIComponent(name)}&score=${score}`)
            }, 400)
          }
        }, delay)
      }
    }

    advance()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalDuration = STEPS.reduce((a, s) => a + s.duration, 0)
  const elapsed = STEPS.slice(0, currentStep).reduce((a, s) => a + s.duration, 0)
  const progressPct = Math.min(100, Math.round((elapsed / totalDuration) * 100))

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top progress bar — matches quiz */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-gray-100 z-50">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%`, backgroundColor: ACCENT }}
        />
      </div>

      {/* Header — matches quiz */}
      <header className="flex items-center justify-between px-6 pt-8 pb-2 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-light-bg.png" alt="AI Central" className="h-6 w-auto" />
        <span className="text-sm font-medium text-gray-400 tabular-nums">Building plan…</span>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6 py-6">
        <div className="w-full max-w-[580px]">
          <div className="flex items-center gap-1.5 mb-5">
            <span className="text-[13px] font-bold" style={{ color: ACCENT }}>✦</span>
            <span className="text-[13px] font-medium text-gray-500">Generating your results</span>
          </div>

          <h1 className="text-[26px] sm:text-[30px] font-bold text-gray-900 leading-tight mb-2">
            Building your personalized plan
          </h1>
          <p className="text-[15px] text-gray-500 mb-8">
            Hang tight — we&apos;re tailoring your AI roadmap based on your answers.
          </p>

          {/* Steps list — minimal */}
          <div className="flex flex-col gap-3">
            {STEPS.map((step, i) => {
              const done = completedSteps.includes(i)
              const active = currentStep === i
              return (
                <div
                  key={step.label}
                  className={`flex items-center gap-3 text-[14px] transition-all duration-300 ${
                    done || active ? 'text-gray-900' : 'text-gray-300'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300 ${
                    done ? '' : active ? 'animate-pulse' : 'bg-gray-100'
                  }`}
                    style={done || active ? { backgroundColor: ACCENT } : {}}
                  >
                    {done && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5.5L3.8 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="font-medium">{step.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </main>

      {/* Footer — matches quiz */}
      <footer className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-gray-100">
        <span className="text-xs text-gray-400">{progressPct}% complete</span>
        <span className="text-xs text-gray-400">Almost there…</span>
      </footer>
    </div>
  )
}

export default function CalculatingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-gray-100 border-t-[#046BB1] animate-spin" />
      </div>
    }>
      <CalculatingContent />
    </Suspense>
  )
}
