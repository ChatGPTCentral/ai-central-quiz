'use client'

import { useEffect, useRef, useState } from 'react'
import { sendEvent } from '@/lib/events-client'
import { firePlacementView } from '@/components/CheckoutLink.client'

// FOMO trial notifications styled as iPhone push notifications: ONE fixed
// slot under the hero where notifications pop in, hold, slide away, and
// the next buyer pops into the exact same spot. Whole card checks out
// (placement v2_fomo_notification). Pauses on hover; reduced-motion gets
// a gentle crossfade instead of the pop.

const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'

// Buyer pool mirrors the real converter profile (US-heavy, senior,
// practitioner roles). Owner decision: no India entries.
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

const HOLD_MS = 3800
const EXIT_MS = 320

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
    <section
      style={{ borderTop: '3px solid #333333', backgroundColor: '#FEF7E7', padding: '22px 16px' }}
      aria-label="Recent trial notifications"
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
    >
      {/* Fixed-height slot: notifications swap in place, layout never shifts */}
      <div className="mx-auto" style={{ maxWidth: 430, height: 96, position: 'relative' }}>
        <a
          key={idx}
          href={checkoutUrl}
          onClick={() => sendEvent('checkout_click', { props: { placement: 'v2_fomo_notification' }, submissionId })}
          className={`ac-ios-notif ${reduced.current ? 'ac-ios-fade' : phase === 'in' ? 'ac-ios-in' : 'ac-ios-out'}`}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '12px 14px',
            borderRadius: 18,
            backgroundColor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            boxShadow: '0 10px 34px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.06)',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
          aria-live="polite"
        >
          {/* app icon */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-square.svg"
            alt=""
            style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, display: 'block', marginTop: 2 }}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(60,60,67,0.72)' }}>AI CENTRAL</span>
              <span style={{ fontSize: 11.5, color: 'rgba(60,60,67,0.55)' }}>{b.ago} ago</span>
            </span>
            <span className="block" style={{ fontSize: 13.5, fontWeight: 700, color: RICH, marginTop: 2, lineHeight: 1.3 }}>
              New trial started 🎉
            </span>
            <span className="block" style={{ fontSize: 12.5, color: 'rgba(60,60,67,0.85)', lineHeight: 1.35, marginTop: 1 }}>
              <strong>{b.name}</strong> ({b.title}) from {b.flag} {b.city} started a trial of the AI Library
            </span>
          </span>
        </a>
      </div>
      <p className="text-center" style={{ fontSize: 10.5, color: MUTE, marginTop: 10, letterSpacing: '0.04em' }}>
        LIVE · people joining the library right now
      </p>

      <style>{`
        .ac-ios-in { animation: ac-ios-pop 0.42s cubic-bezier(0.2, 1.1, 0.35, 1.05) both }
        .ac-ios-out { animation: ac-ios-away 0.32s ease-in both }
        .ac-ios-fade { animation: ac-ios-soft 0.6s ease both }
        @keyframes ac-ios-pop {
          0% { opacity: 0; transform: translateY(-16px) scale(0.96) }
          60% { opacity: 1; transform: translateY(2px) scale(1.005) }
          100% { opacity: 1; transform: translateY(0) scale(1) }
        }
        @keyframes ac-ios-away {
          0% { opacity: 1; transform: translateY(0) scale(1) }
          100% { opacity: 0; transform: translateY(-14px) scale(0.97) }
        }
        @keyframes ac-ios-soft { 0% { opacity: 0.35 } 100% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .ac-ios-in, .ac-ios-out { animation: none }
        }
      `}</style>
    </section>
  )
}
