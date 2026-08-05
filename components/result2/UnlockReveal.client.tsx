'use client'

import { useEffect, useRef, useState } from 'react'
import CheckoutLink from '@/components/CheckoutLink.client'
import { sendEvent } from '@/lib/events-client'

// The unlock reveal — a wheel that is honest about what it is.
//
// The owner's original idea was a rigged wheel: 99.9% odds on the discount,
// framed as luck. That specific shape is banned outright in the EU (UCPD Annex
// I point 31, "creating the false impression that the consumer has already won
// a prize") and AI Central is an Italian company, so it is not a risk/reward
// call. This keeps the theatre and drops the lie.
//
// The rules it follows:
//   - It NEVER says won, lucky, chance, congratulations-you-beat-the-odds, or
//     shows losing segments that cannot come up. Every segment on the wheel is
//     a real thing we hand over.
//   - The framing is EARNED, not won: "you finished all 10 questions, here is
//     what that opens". Which is true, and flatters the person instead of the
//     machine.
//   - The wheel visibly slows into the same reward for everyone. Nobody is told
//     otherwise, and nobody can be shown a screenshot that contradicts theirs.
//
// Why it should also convert, beyond the delight: the checkout autopsy found 30
// of 38 people close the payment form within 10 seconds, median 5s — they click
// a button promising ACCESS and get asked for a CARD. This reveal lands on the
// price before the click, wrapped in a moment worth having rather than a
// demand. Same fix as the CTA-label test, better staging.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const GREEN = '#2D6A26'
const AZUL = '#046BB1'

const SEEN_KEY = 'ac_unlock_revealed'

// Every one of these is real and included. The trial segment is the one the
// wheel lands on; the others are things a member also gets, so the wheel is a
// tour of the offer rather than a lottery with losing tickets.
const SEGMENTS = [
  { label: '1,200+ tutorials', color: FULVOUS },
  { label: '50+ templates', color: AZUL },
  { label: 'Your 30-day plan', color: GREEN },
  { label: 'Prompt packs', color: '#7A4FB5' },
  { label: 'Weekly drops', color: '#C0392B' },
  { label: '$4.99 first month', color: INK },
]
// Index of the segment the pointer settles on. Not secret, not random, and not
// described to anyone as chance.
const LANDS_ON = 5

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
  const fired = useRef(false)

  // Someone returning to their result should not have to sit through it again.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY) === '1') { setPhase('done'); setTurns(revealTurns()) }
    } catch { /* storage blocked — they just see it again */ }
  }, [])

  function revealTurns() {
    const per = 360 / SEGMENTS.length
    // Land the pointer (at 12 o'clock) in the middle of the target segment,
    // after four full turns so it reads as a spin rather than a jump.
    return 4 * 360 + (360 - (LANDS_ON * per + per / 2))
  }

  const spin = () => {
    if (phase !== 'idle') return
    setPhase('spinning')
    sendEvent('unlock_reveal_spin', { submissionId })
    setTurns(revealTurns())
    window.setTimeout(() => {
      setPhase('done')
      try { sessionStorage.setItem(SEEN_KEY, '1') } catch { /* non-fatal */ }
      if (!fired.current) {
        fired.current = true
        sendEvent('unlock_reveal_done', { submissionId })
      }
    }, 3400)
  }

  const per = 360 / SEGMENTS.length
  const gradient = `conic-gradient(${SEGMENTS.map((s, i) => `${s.color} ${i * per}deg ${(i + 1) * per}deg`).join(', ')})`

  return (
    <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: CREAM }} aria-label="What you unlocked">
      <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-12 sm:py-14 text-center">
        <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}>
          You finished all 10 questions
        </span>
        <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
          {firstName ? `${firstName}, here's what that opens` : "Here's what that opens"}
        </h2>
        <p className="mt-3 mx-auto max-w-[560px]" style={{ fontWeight: 300, fontSize: 16.5, lineHeight: 1.5, color: BODY }}>
          Everything on the wheel comes with membership. Give it a spin to see the whole thing.
        </p>

        <div className="mx-auto" style={{ position: 'relative', width: 260, height: 260, marginTop: 26 }}>
          {/* pointer */}
          <div
            aria-hidden
            style={{
              position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0, borderLeft: '11px solid transparent', borderRight: '11px solid transparent',
              borderTop: `20px solid ${RICH}`, zIndex: 2,
            }}
          />
          <div
            role="img"
            aria-label={phase === 'done' ? 'Wheel showing everything included with membership' : 'Reward wheel'}
            style={{
              width: 260, height: 260, borderRadius: '50%', background: gradient,
              border: `4px solid ${INK}`, boxSizing: 'border-box',
              transform: `rotate(${turns}deg)`,
              transition: phase === 'spinning' ? 'transform 3.2s cubic-bezier(0.16, 0.84, 0.28, 1)' : 'none',
            }}
          />
          {/* hub */}
          <div
            aria-hidden
            style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: 74, height: 74, borderRadius: '50%', background: CREAM, border: `4px solid ${INK}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: RICH, letterSpacing: '0.04em', textAlign: 'center', lineHeight: 1.15,
            }}
          >
            AI<br />CENTRAL
          </div>
        </div>

        {phase !== 'done' ? (
          <button
            type="button"
            onClick={spin}
            disabled={phase === 'spinning'}
            style={{
              marginTop: 22, background: INK, color: CREAM, border: 'none',
              fontWeight: 800, fontSize: 16, height: 50, padding: '0 30px',
              cursor: phase === 'spinning' ? 'wait' : 'pointer', opacity: phase === 'spinning' ? 0.7 : 1,
            }}
          >
            {phase === 'spinning' ? 'spinning…' : 'spin the wheel'}
          </button>
        ) : (
          <div className="mt-6">
            <div
              className="mx-auto"
              style={{ maxWidth: 460, border: `3px solid ${INK}`, background: '#FFFFFF', padding: '20px 22px 22px' }}
            >
              <div className="font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: '0.18em', color: FULVOUS, fontWeight: 700 }}>
                All of it, for
              </div>
              <div className="mt-2 flex items-baseline justify-center" style={{ gap: 10 }}>
                <span style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.04em', color: RICH, lineHeight: 1 }}>$4.99</span>
                <span style={{ fontSize: 15, color: BODY, fontWeight: 300 }}>for your first month</span>
              </div>
              <p className="mt-2" style={{ fontSize: 13, color: MUTE, lineHeight: 1.5 }}>
                Then $59.75/year, and we email you before it renews. Cancel any time in the first month
                and you pay nothing more.
              </p>
              <div className="mt-5 flex justify-center">
                <CheckoutLink
                  href={checkoutUrl}
                  placement="v2_unlock_reveal"
                  submissionId={submissionId}
                  className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]"
                  style={{ textDecoration: 'none' }}
                >
                  <span className="inline-flex items-center justify-center" style={{ backgroundColor: INK, color: CREAM, fontWeight: 700, fontSize: 17, height: 56, padding: '0 26px' }}>
                    {ctaLabel}
                  </span>
                  <span className="inline-flex items-center justify-center" style={{ backgroundColor: FULVOUS, color: RICH, width: 56, height: 56, borderLeft: `2px solid ${RICH}`, fontWeight: 700, fontSize: 17 }} aria-hidden>↗</span>
                </CheckoutLink>
              </div>
            </div>
          </div>
        )}

        {/* Said out loud, on the page. If the mechanic only works when people
            misunderstand it, it is the wrong mechanic. */}
        <p className="mt-5 mx-auto max-w-[520px]" style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.5 }}>
          Not a prize draw. Every segment is included with membership, so the wheel shows the same
          thing for everyone who finishes the quiz.
        </p>
      </div>
    </section>
  )
}
