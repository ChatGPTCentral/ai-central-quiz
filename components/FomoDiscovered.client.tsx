'use client'

import { useEffect, useRef, useState } from 'react'
import { firePlacementView } from '@/components/CheckoutLink.client'

// Landing-page FOMO: one fixed slot cycling "{First Last} from {Country}
// just discovered their AI Score" at randomized intervals (organic rhythm).
// The whole card starts the quiz, forwarding the landing's query params
// (utm etc.) like every other landing CTA.

const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'

const PEOPLE = [
  { name: 'James Reynolds', flag: '🇺🇸', country: 'United States', ago: '1m' },
  { name: 'Sarah Mitchell', flag: '🇺🇸', country: 'United States', ago: '6m' },
  { name: 'Laurent Dubois', flag: '🇫🇷', country: 'France', ago: '14m' },
  { name: 'Emily Kang', flag: '🇺🇸', country: 'United States', ago: '22m' },
  { name: 'Tom Whitfield', flag: '🇬🇧', country: 'United Kingdom', ago: '31m' },
  { name: 'Rachel Torres', flag: '🇺🇸', country: 'United States', ago: '45m' },
  { name: 'Daniel Park', flag: '🇺🇸', country: 'United States', ago: '58m' },
  { name: 'Anna Becker', flag: '🇩🇪', country: 'Germany', ago: '1h' },
  { name: "Kevin O'Brien", flag: '🇺🇸', country: 'United States', ago: '2h' },
  { name: 'Sofia Ruiz', flag: '🇪🇸', country: 'Spain', ago: '2h' },
]

const EXIT_MS = 280

export default function FomoDiscovered({ quizHref = '/quiz-v2' }: { quizHref?: string }) {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const paused = useRef(false)
  const reduced = useRef(false)

  useEffect(() => {
    firePlacementView('landing_fomo')
    try { reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* noop */ }

    let holdTimer: ReturnType<typeof setTimeout> | null = null
    let exitTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const scheduleNext = () => {
      if (stopped) return
      const hold = 3200 + Math.random() * 4300
      holdTimer = setTimeout(() => {
        if (stopped) return
        if (paused.current) { scheduleNext(); return }
        if (reduced.current) {
          setIdx(i => (i + 1) % PEOPLE.length)
          scheduleNext()
          return
        }
        setPhase('out')
        exitTimer = setTimeout(() => {
          if (stopped) return
          setIdx(i => (i + 1) % PEOPLE.length)
          setPhase('in')
          scheduleNext()
        }, EXIT_MS)
      }, hold)
    }
    scheduleNext()

    return () => {
      stopped = true
      if (holdTimer) clearTimeout(holdTimer)
      if (exitTimer) clearTimeout(exitTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const p = PEOPLE[idx]

  return (
    <div
      className="mx-auto w-full"
      style={{ maxWidth: 430, height: 74, position: 'relative' }}
      aria-label="People discovering their AI Score"
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
    >
      <a
        key={idx}
        href={quizHref}
        className={`ac-fomod ${reduced.current ? 'ac-fomod-fade' : phase === 'in' ? 'ac-fomod-in' : 'ac-fomod-out'}`}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '10px 16px',
          borderRadius: 14,
          backgroundColor: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(51,51,51,0.13)',
          textDecoration: 'none',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        aria-live="polite"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: MUTE }}>NEW SCORE 🎯</span>
          <span style={{ fontSize: 10.5, color: MUTE }}>{p.ago} ago</span>
        </span>
        <span className="block" style={{ fontSize: 12.5, color: '#3C3C43', lineHeight: 1.35, marginTop: 2 }}>
          <strong style={{ color: RICH }}>{p.name}</strong> from {p.flag} {p.country} just discovered their AI Score
        </span>
      </a>

      <style>{`
        .ac-fomod {
          box-shadow: 0 8px 24px rgba(0,0,0,0.10), 0 0 26px rgba(231,176,47,0.13);
          animation-fill-mode: both;
        }
        .ac-fomod-in { animation: ac-fomod-pop 0.42s cubic-bezier(0.25, 1.25, 0.4, 1) both }
        .ac-fomod-out { animation: ac-fomod-away 0.28s ease-in both }
        .ac-fomod-fade { animation: ac-fomod-soft 0.6s ease both }
        @keyframes ac-fomod-pop {
          0% { opacity: 0; transform: translateY(-12px) scale(0.97) }
          62% { opacity: 1; transform: translateY(2px) scale(1.004) }
          100% { opacity: 1; transform: translateY(0) scale(1) }
        }
        @keyframes ac-fomod-away {
          0% { opacity: 1; transform: translateY(0) scale(1) }
          100% { opacity: 0; transform: translateY(-10px) scale(0.98) }
        }
        @keyframes ac-fomod-soft { 0% { opacity: 0.35 } 100% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .ac-fomod-in, .ac-fomod-out { animation: none }
        }
      `}</style>
    </div>
  )
}
