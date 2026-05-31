'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Viridian for "computation in progress" - - distinct from Azul (form focus)
// and Fulvous (energy / CTA). Keeps the three surfaces visually
// recognizable while staying inside the brand palette.
const ACCENT = '#2D8879'

const STEPS = [
 { label: 'Analyzing your responses',        duration: 900 },
 { label: 'Placing you on the AI adoption ladder',  duration: 900 },
 { label: 'Matching your persona to our playbooks', duration: 900 },
 { label: 'Building your personalized plan',     duration: 900 },
]

function CalculatingContent() {
 const router = useRouter()
 const searchParams = useSearchParams()
 const archetype = searchParams.get('archetype')
 const name = searchParams.get('name')
 const score = searchParams.get('score') || ''
 const id = searchParams.get('id') || ''

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
       const params = new URLSearchParams({
        archetype: archetype!,
        name: name!,
        score,
       })
       if (id) params.set('id', id)
       router.replace(`/result?${params.toString()}`)
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
  <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#FFFDFA' }}>
   {/* Top progress bar */}
   <div className="fixed top-0 left-0 right-0 h-[3px] z-50" style={{ backgroundColor: '#F5F5F5' }}>
    <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPct}%`, backgroundColor: ACCENT }} />
   </div>

   {/* Header */}
   <header className="flex items-center justify-between px-6 pt-8 pb-2 shrink-0">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/logo-full-light-bg.png" alt="AI Central" className="h-6 w-auto" />
    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#9C9C9C' }}>
     Building your plan
    </span>
   </header>

   {/* Main */}
   <main className="flex-1 flex items-center justify-center px-6 py-6">
    <div className="w-full max-w-[580px]">
     <div className="flex items-center gap-1.5 mb-5">
      <span className="text-[13px] font-bold" style={{ color: ACCENT }}>✦</span>
      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: ACCENT }}>
       Generating your results
      </span>
     </div>

     <h1 className="text-[28px] sm:text-[32px] font-black leading-[1.1] mb-3" style={{ color: '#333333' }}>
      Building your personalized plan
     </h1>
     <p className="text-[15px] mb-8" style={{ color: '#555' }}>
      Hang tight. We&apos;re tailoring your AI roadmap based on your answers
     </p>

     {/* Steps list */}
     <div className="flex flex-col gap-3">
      {STEPS.map((step, i) => {
       const done = completedSteps.includes(i)
       const active = currentStep === i
       const stateColor = done || active ? '#333333' : '#9C9C9C'
       return (
        <div
         key={step.label}
         className="flex items-center gap-3 text-[14px] transition-all duration-300"
         style={{ color: stateColor, opacity: done || active ? 1 : 0.5 }}
        >
         <div
          className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300 ${active ? 'animate-pulse' : ''}`}
          style={done || active ? { backgroundColor: ACCENT } : { backgroundColor: '#F5F5F5' }}
         >
          {done && (
           <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
            <path d="M2 5.5L3.8 7.5L8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
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

   {/* Footer */}
   <footer
    className="shrink-0 flex items-center justify-between px-6 py-4 border-t"
    style={{ borderColor: '#E8E4DF' }}
   >
    <span className="text-[11px] tabular-nums" style={{ color: '#9C9C9C' }}>{progressPct}% complete</span>
    <span className="text-[11px]" style={{ color: '#9C9C9C' }}>Almost there</span>
   </footer>
  </div>
 )
}

export default function CalculatingPage() {
 return (
  <Suspense fallback={
   <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFDFA' }}>
    <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: '#E8E4DF', borderTopColor: '#2D8879' }} />
   </div>
  }>
   <CalculatingContent />
  </Suspense>
 )
}
