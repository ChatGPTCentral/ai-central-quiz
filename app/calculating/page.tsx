'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FomoPopup from '@/components/FomoPopup'

// Viridian for "computation in progress" - - distinct from Azul (form focus)
// and Fulvous (energy / CTA). Keeps the three surfaces visually
// recognizable while staying inside the brand palette.
const ACCENT = '#2D8879'

const STEPS = [
 { label: 'Analyzing your responses',               duration: 900 },
 { label: 'Placing you on the AI adoption ladder',  duration: 900 },
 { label: 'Matching your persona to our playbooks', duration: 900 },
 { label: 'Building your personalized plan',        duration: 900 },
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
  <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: '#FFFDFA' }}>
   {/* Top progress bar */}
   <div className="fixed top-0 left-0 right-0 h-[6px] z-50" style={{ backgroundColor: '#EFEAE2' }}>
    <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progressPct}%`, backgroundColor: ACCENT }} />
   </div>

   {/* Header */}
   <header className="flex items-center justify-center px-6 pt-8 pb-2 shrink-0">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/logo-full-light-bg.png" alt="AI Central" className="h-6 w-auto" />
   </header>

   {/* Main — vertically + horizontally centered */}
   <main className="flex-1 flex items-center justify-center px-6 py-6">
    <div className="w-full max-w-[520px] text-center">
     {/* Animated halo / spinner — sleeker than the bullet list */}
     <div className="relative mx-auto mb-7 sm:mb-9" style={{ width: 84, height: 84 }}>
      {/* Outer pulsing ring */}
      <span
       className="absolute inset-0 rounded-full"
       style={{ border: `1.5px solid ${ACCENT}55`, animation: 'ac-ping 2s cubic-bezier(0,0,0.2,1) infinite' }}
      />
      {/* Rotating arc */}
      <svg
       className="absolute inset-0"
       viewBox="0 0 100 100"
       style={{ animation: 'ac-spin 1.4s linear infinite', transformOrigin: '50% 50%' }}
       aria-hidden
      >
       <circle cx="50" cy="50" r="42" fill="none" stroke="#EFEAE2" strokeWidth="6" />
       <circle
        cx="50" cy="50" r="42"
        fill="none" stroke={ACCENT} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={2 * Math.PI * 42}
        strokeDashoffset={2 * Math.PI * 42 * 0.72}
       />
      </svg>
      {/* Center percentage */}
      <div className="absolute inset-0 flex items-center justify-center">
       <span className="text-[16px] font-black tabular-nums" style={{ color: ACCENT }}>{progressPct}%</span>
      </div>
      <style>{`
       @keyframes ac-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
       @keyframes ac-ping {
        0%   { transform: scale(1);    opacity: 0.85; }
        80%  { transform: scale(1.35); opacity: 0; }
        100% { transform: scale(1.35); opacity: 0; }
       }
      `}</style>
     </div>

     <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-3" style={{ color: ACCENT }}>
      Generating your results
     </p>
     <h1 className="text-[28px] sm:text-[34px] font-black leading-[1.1] mb-3" style={{ color: '#333333' }}>
      Building your personalized plan
     </h1>
     <p className="text-[15px] mb-9 mx-auto max-w-[420px]" style={{ color: '#555' }}>
      Hang tight. We&apos;re tailoring your AI roadmap based on your answers.
     </p>

     {/* Steps — centered, current one highlighted */}
     <div className="flex flex-col items-center gap-3">
      {STEPS.map((step, i) => {
       const done = completedSteps.includes(i)
       const active = currentStep === i
       const stateColor = active ? '#333333' : done ? '#555555' : '#9C9C9C'
       const stateOpacity = active ? 1 : done ? 0.45 : 0.3
       return (
        <div
         key={step.label}
         className="flex items-center gap-3 text-[14px] transition-all duration-500"
         style={{ color: stateColor, opacity: stateOpacity }}
        >
         <div
          className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300 ${active ? 'animate-pulse' : ''}`}
          style={done || active ? { backgroundColor: ACCENT } : { backgroundColor: '#F5F5F5' }}
         >
          {done && (
           <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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

   <FomoPopup variant="completed" />
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
