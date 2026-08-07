'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
//   - Framing is EARNED, not won: "you finished all N questions, here is what
//     that opens". True, and it flatters the person rather than the machine.
//     N comes from the real question list via a prop, because it was hardcoded
//     to 10 and silently became a lie the day intent_30d was cut.
//   - It says so on the page. If a mechanic only works when people
//     misunderstand it, it is the wrong mechanic.
//
// DESIGN NOTE — why this does not look like a carnival wheel.
// v1 was six saturated colours on a gold rim with studs, which is the stock
// spin-to-win plugin look. The thing every teardown of good ones says is that
// a rainbow wheel "looks like a third-party intrusion": the branded ones
// (PatchPanel black+green, Avery Davis black+yellow) use two or three colours
// straight from the site. So this one is built from the page's own palette —
// ink, cream, fulvous, the same grain, the same hard offset shadow, the same
// mono eyebrow — and the accent wedge is the price. It should read as a piece
// of the result page, not as a widget dropped on top of it.
//
// The ticker is driven off the real rotation (rAF sampling the transform
// matrix) rather than a canned keyframe, so it slows down exactly as the wheel
// does. That single detail is most of the difference between "physical object"
// and "CSS toy".
//
// Why it should convert: the checkout autopsy found 30 of 38 people close the
// payment form within 10 seconds, median 5s — they click a button promising
// ACCESS and are asked for a CARD. This lands on $4.99 BEFORE any click,
// inside a moment worth having.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const PAPER = '#FBF6EC'
const FULVOUS = '#E48715'
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")"

const SEEN_KEY = 'ac_unlock_revealed'

/**
 * Three fills, taken straight off the page: ink, cream, and fulvous for the
 * wedge that matters. No rainbow, no gold.
 *
 * Every label is two lines, headline word over qualifier. A single long string
 * set radially does not fit between the hub and the rim — it overshoots into
 * the neighbouring wedge and clips at the edge — and stacking also gives the
 * numbers the weight they deserve.
 */
const SEGMENTS: { main: string; sub: string; fill: string; text: string; size?: number }[] = [
  { main: '1,200+', sub: 'tutorials', fill: RICH, text: CREAM },
  { main: '50+', sub: 'templates', fill: CREAM, text: RICH },
  { main: '30-day', sub: 'plan', fill: RICH, text: CREAM },
  { main: 'Prompt', sub: 'packs', fill: CREAM, text: RICH },
  { main: 'Weekly', sub: 'drops', fill: RICH, text: CREAM },
  { main: '$4.99', sub: 'first month', fill: FULVOUS, text: RICH, size: 22 },
]
/** The wedge the ticker settles on. Not secret, not random, not called luck. */
const LANDS_ON = 5

const CX = 160
const CY = 160
const R = 126
const RIM = 139

const PER = 360 / SEGMENTS.length
/** Six full turns, then round to put LANDS_ON's midpoint under the ticker. */
const FINAL = 6 * 360 + (360 - (LANDS_ON * PER + PER / 2))

function pt(angleDeg: number, r: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }
}

function sector(i: number) {
  const p0 = pt(i * PER, R)
  const p1 = pt((i + 1) * PER, R)
  return `M ${CX} ${CY} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${R} ${R} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`
}

export function UnlockReveal({
  firstName, checkoutUrl, submissionId, ctaLabel, questionCount,
}: {
  firstName?: string | null
  checkoutUrl: string
  submissionId?: string
  ctaLabel: string
  /** Real length of the quiz, passed from the server so the claim cannot drift. */
  questionCount: number
}) {
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle')
  const [turns, setTurns] = useState(0)
  const [tx, setTx] = useState('none')
  const [kick, setKick] = useState(0)
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastPeg = useRef(-1)
  const fired = useRef(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY) === '1') { setPhase('done'); setTurns(FINAL) }
    } catch { /* storage blocked — they see it again, no harm */ }
  }, [])

  // The ticker reads the wheel's ACTUAL angle each frame and kicks once per peg
  // crossing, so it rattles fast at the start and drags out at the end without
  // anyone hand-timing keyframes. atan2 loses the turn count, which is fine —
  // peg detection only needs the angle modulo 360.
  const tick = useCallback(() => {
    const el = wheelRef.current
    if (el) {
      try {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
        const deg = (((Math.atan2(m.b, m.a) * 180) / Math.PI) % 360 + 360) % 360
        const peg = Math.floor(deg / PER)
        if (peg !== lastPeg.current) {
          lastPeg.current = peg
          setKick(k => k + 1)
        }
      } catch { /* no DOMMatrix — the wheel still spins, just without the rattle */ }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const spin = () => {
    if (phase !== 'idle') return
    setPhase('spinning')
    sendEvent('unlock_reveal_spin', { submissionId })
    setTx('transform 4s cubic-bezier(0.12, 0.72, 0.16, 1)')
    setTurns(FINAL)
    rafRef.current = requestAnimationFrame(tick)

    window.setTimeout(() => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      // Recoil: the ticker catches the last peg and the wheel rocks back into
      // it. Two short transitions, and it stops feeling like a CSS rotation.
      setTx('transform .16s ease-out')
      setTurns(FINAL - 1.7)
      window.setTimeout(() => {
        setTx('transform .38s cubic-bezier(.34, 1.56, .64, 1)')
        setTurns(FINAL)
        setPhase('done')
        try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* non-fatal */ }
        if (!fired.current) { fired.current = true; sendEvent('unlock_reveal_done', { submissionId }) }
      }, 170)
    }, 4050)
  }

  const done = phase === 'done'

  return (
    <section
      style={{ borderTop: `3px solid ${INK}`, backgroundColor: PAPER, backgroundImage: GRAIN }}
      aria-label="What you unlocked"
      // Styling hook for the reduced-motion rule below. It is a bare data
      // attribute and NOT the aria-label because a CSS selector matching on
      // quoted text breaks hydration: React escapes " and ' inside a <style>
      // child, so the server ships &quot; and the client renders ", the text
      // does not match, and React throws away the server HTML for the WHOLE
      // page root (errors #425 then #423). It also means rewording the label
      // can no longer silently kill the reduced-motion rule.
      data-ac-reveal=""
    >
      <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-12 sm:py-16 text-center">
        <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}>
          You finished all {questionCount} questions
        </span>
        <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(28px, 3.8vw, 44px)', lineHeight: 1.0, letterSpacing: '-0.04em', color: RICH }}>
          {firstName ? `${firstName}, here's what that opens` : "Here's what that opens"}
        </h2>
        <p className="mt-3 mx-auto max-w-[560px]" style={{ fontWeight: 300, fontSize: 16.5, lineHeight: 1.5, color: BODY }}>
          Six things, all included with membership. Give it a spin to see them.
        </p>

        <div
          className="mx-auto"
          style={{ position: 'relative', width: 'min(400px, 84vw)', aspectRatio: '1', marginTop: 30 }}
        >
          {/* Hard offset shadow, same language as every other block on the page.
              It sits outside the rotating layer so it does not spin with it. */}
          <svg viewBox="0 0 320 320" width="100%" height="100%" aria-hidden
            style={{ position: 'absolute', inset: 0, display: 'block' }}>
            <circle cx={CX + 5} cy={CY + 6} r={RIM} fill={RICH} />
          </svg>

          <div
            ref={wheelRef}
            style={{
              position: 'absolute', inset: 0,
              transform: `rotate(${turns}deg)`,
              transition: tx === 'none' ? undefined : tx,
              willChange: 'transform',
            }}
          >
            <svg viewBox="0 0 320 320" width="100%" height="100%" role="img"
              aria-label="Wheel showing the six things included with membership"
              style={{ display: 'block' }}>
              <circle cx={CX} cy={CY} r={RIM} fill={CREAM} stroke={RICH} strokeWidth="4" />
              {SEGMENTS.map((s, i) => (
                <path
                  key={s.main}
                  d={sector(i)}
                  fill={s.fill}
                  stroke={RICH}
                  strokeWidth="2"
                  style={{
                    opacity: done && i !== LANDS_ON ? 0.22 : 1,
                    transition: 'opacity .45s ease-out .1s',
                  }}
                />
              ))}
              {/* Pegs sit on the rim at every wedge boundary. These are what the
                  ticker counts, so they are load-bearing, not decoration. */}
              {SEGMENTS.map((_, i) => {
                const p = pt(i * PER, (R + RIM) / 2)
                return <rect key={`p${i}`} x={p.x - 2} y={p.y - 5} width="4" height="10" rx="2" fill={RICH}
                  transform={`rotate(${i * PER}, ${p.x}, ${p.y})`} />
              })}
              {SEGMENTS.map((s, i) => {
                const mid = i * PER + PER / 2
                // Centred in the band between the hub edge and the rim, so both
                // lines clear the hub and stay inside the wedge.
                const p = pt(mid, 82)
                // Radial text past the horizontal reads upside down; flipping it
                // 180° keeps every wedge legible without moving the layout.
                const flip = mid > 90 && mid < 270
                return (
                  <text
                    key={`t${s.main}`}
                    transform={`rotate(${flip ? mid + 180 : mid}, ${p.x}, ${p.y})`}
                    textAnchor="middle"
                    style={{
                      fill: s.text, letterSpacing: '-0.015em',
                      opacity: done && i !== LANDS_ON ? 0.35 : 1,
                      transition: 'opacity .45s ease-out .1s',
                    }}
                  >
                    <tspan x={p.x} y={p.y - 1} style={{ fontSize: s.size ?? 19, fontWeight: 800 }}>{s.main}</tspan>
                    <tspan x={p.x} y={p.y + 12.5} style={{ fontSize: 10.5, fontWeight: 700 }}>{s.sub}</tspan>
                  </text>
                )
              })}
            </svg>
          </div>

          {/* Ticker. Remounts on every peg crossing so the flick replays. */}
          <div
            key={kick}
            aria-hidden
            style={{
              position: 'absolute', top: '-5%', left: '50%', width: '14%',
              transform: 'translateX(-50%)', transformOrigin: '50% 10%', zIndex: 3,
              animation: phase === 'spinning' ? 'ac-tick .16s ease-out' : 'none',
            }}
          >
            <svg viewBox="0 0 34 46" width="100%" style={{ display: 'block' }}>
              <path d="M17 44.5 L3.5 16 L3.5 4 A2.5 2.5 0 0 1 6 1.5 L28 1.5 A2.5 2.5 0 0 1 30.5 4 L30.5 16 Z"
                fill={FULVOUS} stroke={RICH} strokeWidth="3" strokeLinejoin="round" />
              <circle cx="17" cy="8.5" r="3" fill={RICH} />
            </svg>
          </div>

          {/* Hub */}
          <div aria-hidden
            style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '24%', aspectRatio: '1', borderRadius: '50%', background: CREAM,
              border: `4px solid ${RICH}`, zIndex: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10.5, fontWeight: 800, color: RICH, letterSpacing: '0.06em',
              textAlign: 'center', lineHeight: 1.15,
            }}>
            AI<br />CENTRAL
          </div>
        </div>

        {!done ? (
          <button
            type="button" onClick={spin} disabled={phase === 'spinning'}
            className="transition-transform hover:-translate-y-px active:translate-y-0"
            style={{
              marginTop: 26, background: RICH, color: CREAM, border: `3px solid ${RICH}`,
              fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em',
              height: 56, padding: '0 40px',
              cursor: phase === 'spinning' ? 'wait' : 'pointer',
              opacity: phase === 'spinning' ? 0.7 : 1,
              boxShadow: phase === 'idle' ? `5px 6px 0 ${FULVOUS}` : `2px 2px 0 ${FULVOUS}`,
            }}
          >
            {phase === 'spinning' ? 'spinning…' : 'Spin it'}
          </button>
        ) : (
          <div className="mt-7" style={{ animation: 'ac-rise .45s ease-out' }}>
            <div className="mx-auto" style={{ maxWidth: 470, border: `3px solid ${INK}`, background: '#FFFFFF', padding: '22px 24px 24px', boxShadow: `7px 8px 0 ${RICH}` }}>
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
        @keyframes ac-tick {
          0%   { transform: translateX(-50%) rotate(0deg) }
          22%  { transform: translateX(-50%) rotate(-15deg) }
          100% { transform: translateX(-50%) rotate(0deg) }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-ac-reveal] * { transition: none !important; animation: none !important; }
        }
      `}</style>
    </section>
  )
}
