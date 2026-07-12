'use client'

import { useEffect, useRef, useState } from 'react'
import { sendEvent } from '@/lib/events-client'
import { firePlacementView } from '@/components/CheckoutLink.client'

// FOMO trial notifications, v3: light translucent cards (soft radius, no
// pill), opening with a 24h ROUNDUP ("36 Marketing Directors started a
// trial…"), then individual buyers at RANDOMIZED intervals for an organic
// rhythm. Buyers from the visitor's country (Vercel geo header) surface
// first, and every event carries a map thumb: a self-contained pixel-world
// SVG with a pulsing pin at the buyer's location (no external tile
// services). Whole card checks out (placement v2_fomo_notification).

const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'

// Buyer pool mirrors the real converter profile (US-heavy, senior,
// practitioner roles; no India per owner decision). lat/lon feed the map.
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

/** Blocky "pixel world" landmasses on a 360x180 equirectangular grid
 *  (x = lon + 180, y = 90 - lat). Deliberately low-fi, brand-styled. */
const LAND: [number, number, number, number][] = [
  // North America
  [25, 25, 50, 18], [35, 43, 35, 14], [55, 57, 18, 10], [78, 62, 10, 8],
  // South America
  [95, 82, 18, 12], [98, 94, 14, 20], [102, 114, 8, 14],
  // Greenland
  [125, 12, 16, 12],
  // Europe
  [170, 28, 22, 16], [178, 44, 16, 8],
  // Africa
  [172, 55, 26, 16], [176, 71, 22, 22], [186, 93, 12, 12],
  // Asia
  [192, 20, 60, 22], [200, 42, 44, 14], [232, 56, 22, 12], [248, 40, 18, 14],
  // SE Asia / Indonesia
  [270, 78, 16, 6], [282, 84, 12, 5],
  // Australia
  [288, 100, 22, 14],
  // Japan-ish
  [278, 44, 6, 10],
]

function MapThumb({ pins, size = 78 }: { pins: { lat: number; lon: number }[]; size?: number }) {
  return (
    <span className="shrink-0 flex items-center justify-center" style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${RICH}`, backgroundColor: CREAM }} aria-hidden>
      <svg viewBox="0 0 360 180" style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="xMidYMid slice">
        <rect x="0" y="0" width="360" height="180" fill={CREAM} />
        {/* graticule */}
        {[30, 60, 90, 120, 150].map(y => <line key={`h${y}`} x1="0" y1={y} x2="360" y2={y} stroke="#E7DFCB" strokeWidth="1" />)}
        {[60, 120, 180, 240, 300].map(x => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="180" stroke="#E7DFCB" strokeWidth="1" />)}
        {/* landmasses */}
        {LAND.map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} rx="3" fill="#D9D0BC" />)}
        {/* pins */}
        {pins.map((p, i) => {
          const x = p.lon + 180
          const y = 90 - p.lat
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="11" fill={FULVOUS} opacity="0.28">
                <animate attributeName="r" values="7;15;7" dur="2.2s" repeatCount="indefinite" />
              </circle>
              <circle cx={x} cy={y} r="5.5" fill={FULVOUS} stroke={RICH} strokeWidth="1.6" />
            </g>
          )
        })}
      </svg>
    </span>
  )
}

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
      style={{ maxWidth: 480, height: 104, position: 'relative', marginTop: 26 }}
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
          <>
            <MapThumb pins={BUYERS.slice(0, 6).map(b => ({ lat: b.lat, lon: b.lon }))} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: MUTE }}>AI CENTRAL · LAST 24 HOURS</span>
                <span style={{ fontSize: 11, color: MUTE }}>now</span>
              </span>
              <span className="block" style={{ fontSize: 13.5, color: RICH, lineHeight: 1.35, marginTop: 3 }}>
                <strong>{item.count} {item.title}</strong> started a trial of the AI Library in the last 24 hours
              </span>
            </span>
          </>
        ) : (
          <>
            <MapThumb pins={[{ lat: item.buyer.lat, lon: item.buyer.lon }]} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: MUTE }}>AI CENTRAL · NEW TRIAL 🎉</span>
                <span style={{ fontSize: 11, color: MUTE }}>{item.buyer.ago} ago</span>
              </span>
              <span className="block" style={{ fontSize: 12.5, color: '#3C3C43', lineHeight: 1.4, marginTop: 3 }}>
                <strong style={{ color: RICH }}>{item.buyer.name}</strong> ({item.buyer.title}) from {item.buyer.flag} {item.buyer.city} started a trial of the AI Library
              </span>
            </span>
          </>
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
