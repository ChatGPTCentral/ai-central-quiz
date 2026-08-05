'use client'

import { useEffect, useRef, useState } from 'react'
import CheckoutLink from '@/components/CheckoutLink.client'
import PayBadges from '@/components/result2/PayBadges.client'
import { sendEvent } from '@/lib/events-client'

// The unlock reveal — a wheel that is honest about what it is.
//
// The owner's original idea was a wheel rigged 99.9% to the discount, framed as
// luck. That exact shape is blacklisted in the EU (UCPD Annex I point 31,
// "creating the false impression that the consumer has already won a prize")
// and AI Central is an Italian company, so it is not a risk/reward call. This
// keeps every bit of the theatre and drops the lie.
//
// Rules it follows:
//   - Never says won, lucky, chance or congratulations. Every segment is a real
//     thing included with membership, so the wheel is a TOUR OF THE OFFER
//     rather than a lottery with losing tickets.
//   - Framing is EARNED, not won: "you finished all 10 questions, here is what
//     that opens". True, and it flatters the person rather than the machine.
//   - It says so on the page. If a mechanic only works when people
//     misunderstand it, it is the wrong mechanic.
//
// Why it should convert anyway: the checkout autopsy found 30 of 38 people
// close the payment form within 10 seconds, median 5s — they click a button
// promising ACCESS and are asked for a CARD. This lands on $4.99 BEFORE any
// click, inside a moment worth having. The rigged version would not have helped
// that at all: "you won 95% off" still does not warn anyone a card is next.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const XANTHOUS = '#E7B02F'

const SEEN_KEY = 'ac_unlock_revealed'

const SEGMENTS = [
  { label: '1,200+ tutorials', color: '#E48715' },
  { label: '50+ templates', color: '#046BB1' },
  { label: 'Your 30-day plan', color: '#2D6A26' },
  { label: 'Prompt packs', color: '#7A4FB5' },
  { label: 'Weekly drops', color: '#C0392B' },
  { label: '$4.99 first month', color: '#1A1A1A' },
]
/** The segment the pointer settles on. Not secret, not random, not called luck. */
const LANDS_ON = 5

const CX = 150
const CY = 150
const R = 132

function pt(angleDeg: number, r: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }
}

function sector(i: number, per: number) {
  const a0 = i * per
  const a1 = (i + 1) * per
  const p0 = pt(a0, R)
  const p1 = pt(a1, R)
  return `M ${CX} ${CY} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${R} ${R} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`
}

export function UnlockReveal({
  firstName, checkoutUrl, submissionId, ctaLabel,
}: {
  firstName?: string | null
  checkoutUrl: string
  submissionId?: string
  ctaLabel: string
}) {
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle')
  const [turns, setTurns] = useState(0)
  const [pop, setPop] = useState(false)
  const fired = useRef(false)

  const per = 360 / SEGMENTS.length
  const finalTurns = 6 * 360 + (360 - (LANDS_ON * per + per / 2))

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY) === '1') { setPhase('done'); setTurns(finalTurns) }
    } catch { /* storage blocked — they see it again, no harm */ }
  }, [finalTurns])

  const spin = () => {
    if (phase !== 'idle') return
    setPhase('spinning')
    sendEvent('unlock_reveal_spin', { submissionId })
    setTurns(finalTurns)
    window.setTimeout(() => {
      setPhase('done')
      setPop(true)
      window.setTimeout(() => setPop(false), 700)
      try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* non-fatal */ }
      if (!fired.current) { fired.current = true; sendEvent('unlock_reveal_done', { submissionId }) }
    }, 4200)
  }

  return (
    <section style={{ borderTop: `3px solid ${INK}`, background: `radial-gradient(circle at 50% 22%, #FFF6DF 0%, ${CREAM} 55%)` }} aria-label="What you unlocked">
      <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-12 sm:py-16 text-center">
        <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}>
          You finished all 10 questions
        </span>
        <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(28px, 3.8vw, 44px)', lineHeight: 1.0, letterSpacing: '-0.04em', color: RICH }}>
          {firstName ? `${firstName}, here's what that opens` : "Here's what that opens"}
        </h2>
        <p className="mt-3 mx-auto max-w-[560px]" style={{ fontWeight: 300, fontSize: 16.5, lineHeight: 1.5, color: BODY }}>
          Every wedge is included with membership. Spin it to see the whole thing.
        </p>

        <div className="mx-auto" style={{ position: 'relative', width: 300, height: 320, marginTop: 24 }}>
          {/* pointer */}
          <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden
            style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 3, filter: 'drop-shadow(0 2px 0 rgba(0,0,0,.25))' }}>
            <path d="M17 29 L3 3 A2 2 0 0 1 6 1 L28 1 A2 2 0 0 1 31 3 Z" fill={XANTHOUS} stroke={RICH} strokeWidth="2.5" strokeLinejoin="round" />
          </svg>

          <div
            style={{
              width: 300, height: 300, position: 'absolute', top: 14, left: 0,
              transform: `rotate(${turns}deg) scale(${pop ? 1.04 : 1})`,
              transition: phase === 'spinning'
                ? 'transform 4s cubic-bezier(0.12, 0.72, 0.16, 1)'
                : pop ? 'transform .25s ease-out' : 'none',
            }}
          >
            <svg viewBox="0 0 300 300" width="300" height="300" role="img"
              aria-label="Wheel showing everything included with membership"
              style={{ display: 'block', filter: 'drop-shadow(0 8px 20px rgba(26,26,26,.22))' }}>
              <circle cx={CX} cy={CY} r={R + 9} fill={XANTHOUS} stroke={RICH} strokeWidth="4" />
              {/* rim studs */}
              {SEGMENTS.map((_, i) => {
                const p = pt(i * per, R + 9)
                return <circle key={`s${i}`} cx={p.x} cy={p.y} r="3.6" fill={RICH} />
              })}
              {SEGMENTS.map((s, i) => (
                <path key={s.label} d={sector(i, per)} fill={s.color} stroke={RICH} strokeWidth="2" />
              ))}
              {SEGMENTS.map((s, i) => {
                const mid = i * per + per / 2
                const p = pt(mid, R * 0.62)
                // Radial text past the horizontal reads upside down; flipping it
                // 180° keeps every wedge legible without moving the layout.
                const flip = mid > 90 && mid < 270
                return (
                  <text
                    key={`t${s.label}`}
                    x={p.x} y={p.y}
                    transform={`rotate(${flip ? mid + 180 : mid}, ${p.x}, ${p.y})`}
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: 12.5, fontWeight: 800, fill: '#FFFFFF', letterSpacing: '-0.01em' }}
                  >
                    {s.label}
                  </text>
                )
              })}
            </svg>
          </div>

          {/* hub */}
          <div aria-hidden
            style={{
              position: 'absolute', top: 164, left: '50%', transform: 'translate(-50%, -50%)',
              width: 78, height: 78, borderRadius: '50%', background: CREAM, border: `4px solid ${RICH}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
              fontSize: 11, fontWeight: 800, color: RICH, letterSpacing: '0.05em', textAlign: 'center', lineHeight: 1.15,
              boxShadow: '0 3px 10px rgba(26,26,26,.2)',
            }}>
            AI<br />CENTRAL
          </div>
        </div>

        {phase !== 'done' ? (
          <button
            type="button" onClick={spin} disabled={phase === 'spinning'}
            className="transition-transform hover:-translate-y-px active:scale-[0.98]"
            style={{
              marginTop: 10, background: RICH, color: CREAM, border: `3px solid ${RICH}`,
              fontWeight: 800, fontSize: 17, height: 54, padding: '0 34px',
              cursor: phase === 'spinning' ? 'wait' : 'pointer', opacity: phase === 'spinning' ? 0.75 : 1,
              boxShadow: phase === 'idle' ? `0 0 0 6px rgba(228,135,21,.22)` : 'none',
            }}
          >
            {phase === 'spinning' ? 'spinning…' : '🎡 spin the wheel'}
          </button>
        ) : (
          <div className="mt-4" style={{ animation: 'ac-rise .45s ease-out' }}>
            <div className="mx-auto" style={{ maxWidth: 470, border: `3px solid ${INK}`, background: '#FFFFFF', padding: '22px 24px 24px', boxShadow: '0 10px 30px rgba(26,26,26,.13)' }}>
              <div className="font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: '0.18em', color: FULVOUS, fontWeight: 700 }}>
                All six, for
              </div>
              <div className="mt-2 flex items-baseline justify-center" style={{ gap: 10 }}>
                <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-0.045em', color: RICH, lineHeight: 1 }}>$4.99</span>
                <span style={{ fontSize: 15.5, color: BODY, fontWeight: 300 }}>for your first month</span>
              </div>
              <p className="mt-2" style={{ fontSize: 13, color: MUTE, lineHeight: 1.5 }}>
                Then $59.75/year, and we email you before it renews. Cancel any time in the first
                month and you pay nothing more.
              </p>
              <div className="mt-5 flex flex-col items-center" style={{ gap: 10 }}>
                <CheckoutLink
                  href={checkoutUrl}
                  placement="v2_unlock_reveal"
                  submissionId={submissionId}
                  className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]"
                  style={{ textDecoration: 'none' }}
                >
                  <span className="inline-flex items-center justify-center" style={{ backgroundColor: INK, color: CREAM, fontWeight: 700, fontSize: 17, height: 56, padding: '0 26px' }}>{ctaLabel}</span>
                  <span className="inline-flex items-center justify-center" style={{ backgroundColor: FULVOUS, color: RICH, width: 56, height: 56, borderLeft: `2px solid ${RICH}`, fontWeight: 700, fontSize: 17 }} aria-hidden>↗</span>
                </CheckoutLink>
                <PayBadges fallbackUrl={checkoutUrl} submissionId={submissionId} placement="v2_unlock_reveal_badges" />
              </div>
            </div>
          </div>
        )}

        {/* Said out loud, on the page. */}
        <p className="mt-5 mx-auto max-w-[540px]" style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.5 }}>
          Not a prize draw. Every wedge is included with membership, so the wheel shows the same thing
          for everyone who finishes the quiz.
        </p>
      </div>

      <style>{`
        @keyframes ac-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) {
          [aria-label="What you unlocked"] * { transition: none !important; animation: none !important; }
        }
      `}</style>
    </section>
  )
}
