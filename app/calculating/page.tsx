'use client'

// Assembling beat (funnel handoff 1m): a ~3-second dark scoring screen with
// a ticking mono checklist and the member pass carrying the user's real
// name, then redirect to /result with name/score/persona/stage/id intact.

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Barcode } from '@/components/result/PassCard'
import { track } from '@/lib/track'

const RICH = '#1A1A1A'
const CREAM = '#FEF7E7'
const INK = '#333333'
const FULVOUS = '#E48715'
const XANTHOUS = '#E7B02F'

const CHECKS = ['10 ANSWERS SCORED', 'PLACED AMONG 8.1B PEOPLE', 'SEQUENCING MONTH 1']
const TICK_MS = 850          // one checklist line per beat
const REDIRECT_AT_MS = 3000  // "takes about 3 seconds"

function CalculatingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const persona = searchParams.get('persona') || ''
  const stage = searchParams.get('stage') || ''
  const name = searchParams.get('name')
  const score = searchParams.get('score') || ''
  const id = searchParams.get('id') || ''

  const [done, setDone] = useState(0) // how many checklist lines have ticked

  useEffect(() => {
    if (!name) {
      router.replace('/')
      return
    }
    track('assembling_view')

    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i <= CHECKS.length; i++) {
      timers.push(setTimeout(() => setDone(i), TICK_MS * i))
    }
    timers.push(setTimeout(() => {
      const params = new URLSearchParams({ name: name!, score })
      if (persona) params.set('persona', persona)
      if (stage) params.set('stage', stage)
      if (id) params.set('id', id)
      router.replace(`/result?${params.toString()}`)
    }, REDIRECT_AT_MS))
    return () => timers.forEach(clearTimeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const passName = (name || 'YOUR NAME').trim()

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-10" style={{ backgroundColor: RICH }}>
      <p className="font-mono uppercase" style={{ fontSize: 11, letterSpacing: '0.16em', color: XANTHOUS }}>
        Scoring
      </p>
      <h1 className="mt-3 font-bold text-center" style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', letterSpacing: '-0.03em', color: CREAM }}>
        Assembling your pass
      </h1>

      {/* Checklist — lines tick in sequence, the live one blinks */}
      <div className="mt-7 flex flex-col gap-2.5 font-mono" style={{ fontSize: 12, letterSpacing: '0.1em' }}>
        {CHECKS.map((c, i) => {
          const ticked = done > i
          const active = done === i
          return (
            <div
              key={c}
              className={`flex items-center gap-2.5 ${active ? 'as-blink' : ''}`}
              style={{ color: ticked ? CREAM : active ? XANTHOUS : CREAM, opacity: ticked ? 1 : active ? 1 : 0.35 }}
            >
              <span style={{ width: 16, color: ticked ? '#62A758' : XANTHOUS }}>{ticked ? '✓' : '→'}</span>
              {c}
            </div>
          )
        })}
      </div>

      {/* Member pass with the real name */}
      <div className="mt-9 w-full max-w-[360px]" style={{ transform: 'rotate(-2deg)' }}>
        <div style={{ backgroundColor: INK, border: `3px solid #000000`, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
          <div className="px-5 pt-4 pb-4">
            <div className="flex items-center justify-between">
              <span className="font-mono" style={{ fontSize: 9.5, letterSpacing: '0.16em', color: CREAM, opacity: 0.65 }}>
                AI CENTRAL · MEMBER PASS
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-avatar-light.png" alt="" width={18} height={18} style={{ display: 'block' }} />
            </div>
            <div className="mt-3 font-black uppercase break-words" style={{ fontSize: 'clamp(24px, 7vw, 34px)', letterSpacing: '-0.02em', lineHeight: 1, color: CREAM }}>
              {passName}
            </div>
            <div className="mt-2.5 font-mono as-blink" style={{ fontSize: 11, letterSpacing: '0.1em', color: XANTHOUS }}>
              CLASS: SCORING…
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-2.5" style={{ backgroundColor: CREAM, borderTop: '3px solid #000000' }}>
            <Barcode seed="AC-0723" width={140} height={18} />
            <span className="font-mono font-semibold flex-shrink-0" style={{ fontSize: 10.5, color: RICH }}>NO. AC-0723</span>
          </div>
        </div>
      </div>

      <p className="mt-7" style={{ fontSize: 11.5, color: CREAM, opacity: 0.5 }}>takes about 3 seconds</p>

      <style>{`
        @keyframes as-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .as-blink { animation: as-blink 1.1s step-end infinite; }
        @media (prefers-reduced-motion: reduce) { .as-blink { animation: none; } }
      `}</style>
    </div>
  )
}

export default function CalculatingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1A1A1A' }}>
        <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: '#333333', borderTopColor: '#E7B02F' }} />
      </div>
    }>
      <CalculatingContent />
    </Suspense>
  )
}
