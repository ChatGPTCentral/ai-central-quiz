'use client'

import { useEffect, useRef, useState } from 'react'
import { sendEvent } from '@/lib/events-client'
import { firePlacementView } from '@/components/CheckoutLink.client'

// FOMO trial notifications: light translucent text cards (soft radius),
// opening with a 24h ROUNDUP ("36 Marketing Directors started a trial…"),
// then individual buyers at RANDOMIZED intervals for an organic rhythm.
// Buyers from the visitor's country (Vercel geo header) surface first.
// Whole card checks out (placement v2_fomo_notification).

const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'

// Buyer pool mirrors the real converter profile (US-heavy, senior,
// practitioner roles; no India per owner decision).
const BUYERS = [
  { name: 'James R.', title: 'VP of Operations', flag: '🇺🇸', city: 'New York, NY', country: 'US', lat: 40.7, lon: -74.0, ago: '2m' },
  { name: 'Sarah M.', title: 'Marketing Director', flag: '🇺🇸', city: 'San Francisco, CA', country: 'US', lat: 37.8, lon: -122.4, ago: '11m' },
  { name: 'Laurent D.', title: 'Product Manager', flag: '🇫🇷', city: 'Paris', country: 'FR', lat: 48.9, lon: 2.35, ago: '24m' },
  { name: 'Emily K.', title: 'HR Manager', flag: '🇺🇸', city: 'Austin, TX', country: 'US', lat: 30.3, lon: -97.7, ago: '38m' },
  { name: 'Tom W.', title: 'Head of Customer Success', flag: '🇬🇧', city: 'London', country: 'GB', lat: 51.5, lon: -0.13, ago: '52m' },
  { name: 'Rachel T.', title: 'Senior Business Analyst', flag: '🇺🇸', city: 'Chicago, IL', country: 'US', lat: 41.9, lon: -87.6, ago: '1h' },
  { name: 'Daniel P.', title: 'Founder', flag: '🇺🇸', city: 'Los Angeles, CA', country: 'US', lat: 34.1, lon: -118.2, ago: '1h' },
  { name: 'Anna B.', title: 'Operations Lead', flag: '🇩🇪', city: 'Berlin', country: 'DE', lat: 52.5, lon: 13.4, ago: '2h' },
  { name: 'Kevin O.', title: 'IT Systems Analyst', flag: '🇺🇸', city: 'Nashville, TN', country: 'US', lat: 36.2, lon: -86.8, ago: '2h' },
  { name: 'Sofia R.', title: 'Managing Director', flag: '🇪🇸', city: 'Madrid', country: 'ES', lat: 40.4, lon: -3.7, ago: '3h' },
]

// 24h roundups: count + PLURAL standardized buyer title.
const ROUNDUPS = [
  { count: 36, title: 'Marketing Directors' },
  { count: 21, title: 'Founders' },
  { count: 14, title: 'Business Analysts' },
  { count: 11, title: 'Operations Managers' },
]

type Item =
  | { kind: 'roundup'; count: number; title: string }
  | { kind: 'buyer'; buyer: (typeof BUYERS)[number] }

const EXIT_MS = 280

export function FomoNotifications({ checkoutUrl, submissionId, visitorCountry }: { checkoutUrl: string; submissionId?: string; visitorCountry?: string }) {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const paused = useRef(false)
  const reduced = useRef(false)
  const itemsRef = useRef<Item[]>([])

  // Build the cycle once: roundup first, buyers geo-prioritized, another
  // roundup mid-stream for texture.
  if (itemsRef.current.length === 0) {
    const cc = (visitorCountry || '').toUpperCase()
    const local = BUYERS.filter(b => b.country === cc)
    const rest = BUYERS.filter(b => b.country !== cc)
    const ordered = [...local, ...rest]
    const items: Item[] = [{ kind: 'roundup', ...ROUNDUPS[0] }]
    ordered.forEach((b, i) => {
      items.push({ kind: 'buyer', buyer: b })
      const r = ROUNDUPS[1 + Math.floor(i / 4)]
      if ((i + 1) % 4 === 0 && r) items.push({ kind: 'roundup', count: r.count, title: r.title })
    })
    itemsRef.current = items
  }

  useEffect(() => {
    firePlacementView('v2_fomo_notification', submissionId)
    try { reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* noop */ }

    let holdTimer: ReturnType<typeof setTimeout> | null = null
    let exitTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const scheduleNext = () => {
      if (stopped) return
      // Organic cadence: 3s–7.5s, uniformly jittered per tick.
      const hold = 3000 + Math.random() * 4500
      holdTimer = setTimeout(() => {
        if (stopped) return
        if (paused.current) { scheduleNext(); return }
        if (reduced.current) {
          setIdx(i => (i + 1) % itemsRef.current.length)
          scheduleNext()
          return
        }
        setPhase('out')
        exitTimer = setTimeout(() => {
          if (stopped) return
          setIdx(i => (i + 1) % itemsRef.current.length)
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

  const item = itemsRef.current[idx % itemsRef.current.length]

  return (
    <div
      className="mx-auto"
      style={{ maxWidth: 480, height: 88, position: 'relative', marginTop: 26 }}
      aria-label="Recent trial notifications"
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
    >
      <a
        key={idx}
        href={checkoutUrl}
        onClick={() => sendEvent('checkout_click', { props: { placement: 'v2_fomo_notification' }, submissionId })}
        className={`ac-fomo3 ${reduced.current ? 'ac-fomo3-fade' : phase === 'in' ? 'ac-fomo3-in' : 'ac-fomo3-out'}`}
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', gap: 13,
          padding: '12px 16px 12px 12px',
          borderRadius: 16,
          backgroundColor: 'rgba(255,255,255,0.86)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(51,51,51,0.14)',
          textDecoration: 'none',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        aria-live="polite"
      >
        {item.kind === 'roundup' ? (
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: MUTE }}>LAST 24 HOURS</span>
              <span style={{ fontSize: 11, color: MUTE }}>now</span>
            </span>
            <span className="block" style={{ fontSize: 13.5, color: RICH, lineHeight: 1.35, marginTop: 3 }}>
              <strong>{item.count} {item.title}</strong> started a trial of the AI Library in the last 24 hours
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: MUTE }}>NEW TRIAL 🎉</span>
              <span style={{ fontSize: 11, color: MUTE }}>{item.buyer.ago} ago</span>
            </span>
            <span className="block" style={{ fontSize: 12.5, color: '#3C3C43', lineHeight: 1.4, marginTop: 3 }}>
              <strong style={{ color: RICH }}>{item.buyer.name}</strong> ({item.buyer.title}) from {item.buyer.flag} {item.buyer.city} started a trial of the AI Library
            </span>
          </span>
        )}
      </a>

      <style>{`
        .ac-fomo3 {
          box-shadow: 0 8px 26px rgba(0,0,0,0.10), 0 0 30px rgba(231,176,47,0.14);
          animation-fill-mode: both;
        }
        .ac-fomo3-in { animation: ac-fomo3-pop 0.44s cubic-bezier(0.25, 1.25, 0.4, 1) both }
        .ac-fomo3-out { animation: ac-fomo3-away 0.28s ease-in both }
        .ac-fomo3-fade { animation: ac-fomo3-soft 0.6s ease both }
        @keyframes ac-fomo3-pop {
          0% { opacity: 0; transform: translateY(-13px) scale(0.965) }
          62% { opacity: 1; transform: translateY(2px) scale(1.004) }
          100% { opacity: 1; transform: translateY(0) scale(1) }
        }
        @keyframes ac-fomo3-away {
          0% { opacity: 1; transform: translateY(0) scale(1) }
          100% { opacity: 0; transform: translateY(-11px) scale(0.975) }
        }
        @keyframes ac-fomo3-soft { 0% { opacity: 0.35 } 100% { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .ac-fomo3-in, .ac-fomo3-out { animation: none }
        }
      `}</style>
    </div>
  )
}
