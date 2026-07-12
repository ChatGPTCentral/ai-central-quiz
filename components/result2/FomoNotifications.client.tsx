'use client'

import { useEffect, useRef, useState } from 'react'
import { sendEvent } from '@/lib/events-client'
import { firePlacementView } from '@/components/CheckoutLink.client'

// FOMO trial notifications as an Apple Dynamic-Island capsule: a black
// rounded pill with the iconic ambient glow, popping/expanding in ONE
// fixed slot, cycling through buyers. Seamless — no band, no borders;
// it floats on whatever section hosts it (below the trial CTA). Whole
// capsule checks out (placement v2_fomo_notification).

// Buyer pool mirrors the real converter profile. Owner decision: no India.
const BUYERS = [
  { name: 'James R.', title: 'VP of Operations', flag: '🇺🇸', city: 'New York, NY', ago: '2m' },
  { name: 'Sarah M.', title: 'Marketing Director', flag: '🇺🇸', city: 'San Francisco, CA', ago: '11m' },
  { name: 'Laurent D.', title: 'Product Manager', flag: '🇫🇷', city: 'Paris', ago: '24m' },
  { name: 'Emily K.', title: 'HR Manager', flag: '🇺🇸', city: 'Austin, TX', ago: '38m' },
  { name: 'Tom W.', title: 'Head of Customer Success', flag: '🇬🇧', city: 'London', ago: '52m' },
  { name: 'Rachel T.', title: 'Senior Business Analyst', flag: '🇺🇸', city: 'Chicago, IL', ago: '1h' },
  { name: 'Daniel P.', title: 'Founder', flag: '🇺🇸', city: 'Los Angeles, CA', ago: '1h' },
  { name: 'Anna B.', title: 'Operations Lead', flag: '🇩🇪', city: 'Berlin', ago: '2h' },
  { name: 'Kevin O.', title: 'IT Systems Analyst', flag: '🇺🇸', city: 'Nashville, TN', ago: '2h' },
  { name: 'Sofia R.', title: 'Managing Director', flag: '🇪🇸', city: 'Madrid', ago: '3h' },
]

const HOLD_MS = 4200
const EXIT_MS = 300

export function FomoNotifications({ checkoutUrl, submissionId }: { checkoutUrl: string; submissionId?: string }) {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const paused = useRef(false)
  const reduced = useRef(false)

  useEffect(() => {
    firePlacementView('v2_fomo_notification', submissionId)
    try { reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* noop */ }

    let exitTimer: ReturnType<typeof setTimeout> | null = null
    const interval = setInterval(() => {
      if (paused.current) return
      if (reduced.current) {
        setIdx(i => (i + 1) % BUYERS.length)
        return
      }
      setPhase('out')
      exitTimer = setTimeout(() => {
        setIdx(i => (i + 1) % BUYERS.length)
        setPhase('in')
      }, EXIT_MS)
    }, HOLD_MS)

    return () => { clearInterval(interval); if (exitTimer) clearTimeout(exitTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const b = BUYERS[idx]

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 460, height: 84, position: 'relative', marginTop: 26 }}
      aria-label="Recent trial notifications"
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
    >
      <a
        key={idx}
        href={checkoutUrl}
        onClick={() => sendEvent('checkout_click', { props: { placement: 'v2_fomo_notification' }, submissionId })}
        className={`ac-island ${reduced.current ? 'ac-island-fade' : phase === 'in' ? 'ac-island-in' : 'ac-island-out'}`}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', gap: 13,
          padding: '0 22px 0 12px',
          borderRadius: 999,
          backgroundColor: '#0A0A0A',
          textDecoration: 'none',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        aria-live="polite"
      >
        {/* app icon in a circle, like the island's leading element */}
        <span className="flex items-center justify-center shrink-0" style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: '#1C1C1E', overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-square.svg" alt="" style={{ width: 34, height: 34, display: 'block' }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)' }}>
              AI CENTRAL · NEW TRIAL 🎉
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{b.ago} ago</span>
          </span>
          <span className="block" style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.92)', lineHeight: 1.35, marginTop: 3 }}>
            <strong style={{ color: '#FFFFFF' }}>{b.name}</strong> ({b.title}) from {b.flag} {b.city} started a trial of the AI Library
          </span>
        </span>
      </a>

      <style>{`
        .ac-island {
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.07),
            0 14px 38px rgba(0,0,0,0.35),
            0 0 44px rgba(231,176,47,0.30),
            0 0 90px rgba(4,107,177,0.18);
          animation-fill-mode: both;
        }
        .ac-island-in { animation: ac-island-pop 0.5s cubic-bezier(0.34, 1.42, 0.44, 1) both }
        .ac-island-out { animation: ac-island-away 0.3s ease-in both }
        .ac-island-fade { animation: ac-island-soft 0.6s ease both }
        @keyframes ac-island-pop {
          0% { opacity: 0; transform: scale(0.62, 0.82) }
          62% { opacity: 1; transform: scale(1.025, 1.01) }
          100% { opacity: 1; transform: scale(1, 1) }
        }
        @keyframes ac-island-away {
          0% { opacity: 1; transform: scale(1) }
          100% { opacity: 0; transform: scale(0.8, 0.9) }
        }
        @keyframes ac-island-soft { 0% { opacity: 0.35 } 100% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .ac-island-in, .ac-island-out { animation: none }
        }
      `}</style>
    </div>
  )
}
