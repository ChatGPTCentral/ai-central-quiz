'use client'

import { useEffect, useState } from 'react'
import { firePlacementView } from '@/components/CheckoutLink.client'

// Right-middle vertical marquee of recent quiz-takers, continuously scrolling.
// Uses plausible first-name + last-initial people (not real submitters) so no
// one's identity or scraped photo is exposed publicly; each card carries an
// initial avatar as its picture. Desktop only (a side rail), reduced-motion
// aware. Impression tracked once as landing_fomo.

const US = [
  ['James R.', '🇺🇸', 'New York'], ['Sarah M.', '🇺🇸', 'San Francisco'], ['Michael T.', '🇺🇸', 'Chicago'],
  ['Emily K.', '🇺🇸', 'Austin'], ['David L.', '🇺🇸', 'Boston'], ['Jennifer W.', '🇺🇸', 'Seattle'],
  ['Robert H.', '🇺🇸', 'Denver'], ['Lisa C.', '🇺🇸', 'Atlanta'], ['Amanda S.', '🇺🇸', 'Dallas'],
  ['Daniel P.', '🇺🇸', 'Los Angeles'], ['Rachel N.', '🇺🇸', 'Portland'], ['Kevin O.', '🇺🇸', 'Nashville'],
] as const
const INTL = [
  ['Oliver B.', '🇬🇧', 'London'], ['Sophie L.', '🇫🇷', 'Paris'], ['Hans M.', '🇩🇪', 'Berlin'],
  ['Emma V.', '🇳🇱', 'Amsterdam'], ['Luca R.', '🇮🇹', 'Milan'], ['Ana P.', '🇪🇸', 'Madrid'],
  ['Erik S.', '🇸🇪', 'Stockholm'], ['Claire F.', '🇨🇭', 'Zurich'], ['Marco T.', '🇵🇹', 'Lisbon'],
] as const

const AVATAR_COLORS = ['#0F8A6D', '#E48715', '#0A66C2', '#8E5BD1', '#BE593B', '#2E7D32', '#546E7A', '#C77D11']

function initials(name: string): string {
  return name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}
function colorFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

interface Card { name: string; flag: string; city: string; ago: string }

function buildCards(n: number): Card[] {
  const out: Card[] = []
  const used = new Set<string>()
  let mins = 1
  while (out.length < n) {
    const pool = Math.random() < 0.7 ? US : INTL
    const [name, flag, city] = pool[Math.floor(Math.random() * pool.length)]
    if (used.has(name)) continue
    used.add(name)
    mins += 1 + Math.floor(Math.random() * 6)
    out.push({ name, flag, city, ago: `${mins} min ago` })
  }
  return out
}

export default function FomoMarquee() {
  const [cards, setCards] = useState<Card[]>([])
  useEffect(() => {
    setCards(buildCards(10))
    try { firePlacementView('landing_fomo') } catch { /* noop */ }
  }, [])
  if (cards.length === 0) return null

  return (
    <div
      className="hidden xl:block fixed z-40"
      style={{ right: 18, top: '50%', transform: 'translateY(-50%)', width: 244, height: 360, overflow: 'hidden', pointerEvents: 'none', WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 14%, #000 86%, transparent)', maskImage: 'linear-gradient(to bottom, transparent, #000 14%, #000 86%, transparent)' }}
      aria-hidden
    >
      <div className="ac-fomo-col" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[...cards, ...cards].map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FFFFFF', border: '1px solid #EDE7DA', borderRadius: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.06)', padding: '10px 12px' }}>
            <span className="shrink-0 flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: '50%', background: colorFor(c.name), color: '#FFFFFF', fontSize: 12.5, fontWeight: 800 }}>
              {initials(c.name)}
            </span>
            <span className="min-w-0">
              <span className="block" style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.2 }}>
                {c.name} <span style={{ fontWeight: 400 }}>{c.flag}</span>
              </span>
              <span className="block" style={{ fontSize: 11, color: '#6B6B6B', lineHeight: 1.3 }}>just took the quiz · {c.city}</span>
              <span className="block" style={{ fontSize: 10, color: '#B7B0A4' }}>{c.ago}</span>
            </span>
          </div>
        ))}
      </div>
      <style>{`
        .ac-fomo-col { animation: ac-fomo-up 26s linear infinite; will-change: transform }
        @keyframes ac-fomo-up { from { transform: translateY(0) } to { transform: translateY(-50%) } }
        @media (prefers-reduced-motion: reduce) { .ac-fomo-col { animation: none } }
      `}</style>
    </div>
  )
}
