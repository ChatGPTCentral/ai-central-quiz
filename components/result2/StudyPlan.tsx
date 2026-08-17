'use client'

import { useEffect, useState } from 'react'
import { planForStage, type PlanItem } from '@/lib/study-plan-data'
import CheckoutLink from '@/components/CheckoutLink.client'
import FreeStepLink from '@/components/result2/FreeStepLink.client'

// "Your recommended study plan" as a FREEMIUM LADDER: week 1 is genuinely
// playable — a real library tutorial that opens in a NEW TAB, free, no card —
// and weeks 2-5 sit visibly locked behind it.
//
// The version before this had the free level switched off, which made the
// section all wall and no game: five identical locks and a counter reading
// zero. A wall with nothing behind it is just a paywall.
//
// The loop that makes this sell rather than leak: the moment someone opens the
// free tutorial, row 1 flips to DONE and row 2 lights up as NEXT with its own
// button. The free level is not the end of the story, it is the thing that
// makes level 2 feel owed. State persists in sessionStorage, so coming back
// from the new tab lands on "step 1 done, step 2 is waiting" rather than on
// the same untouched list.
//
// Every locked row checks out (placement v2_study_plan); the free row opens the
// tutorial and fires free_step_open.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const GREEN = '#2D6A26'

const cover = (qf: string) => `https://img.tradepub.com/free/${qf}/images/${qf}c4.gif`

/** Progress rail — the game-y bit that makes the wall visible. */
function Progress({ unlocked, total }: { unlocked: number; total: number }) {
  return (
    <div className="flex items-center" style={{ gap: 12, marginBottom: 18 }}>
      <span className="flex" style={{ gap: 4, flex: 1 }}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} style={{ flex: 1, height: 7, backgroundColor: i < unlocked ? FULVOUS : '#E3DED4', border: `1px solid ${i < unlocked ? FULVOUS : '#D8D2C6'}` }} />
        ))}
      </span>
      <span className="font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: '0.1em', color: RICH, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {/* At zero, name the prize instead of scoring the reader: "0 of 5
            unlocked" opens the section on a scoreboard reading nil. */}
        {unlocked > 0 ? `${unlocked} of ${total} unlocked` : `${total} steps waiting`}
      </span>
    </div>
  )
}

export function StudyPlan({
  stageKey,
  checkoutUrl,
  submissionId,
}: {
  stageKey?: string | null
  checkoutUrl: string
  submissionId?: string
}) {
  const plan = planForStage(stageKey)
  const weeks = ['Week 1', 'Week 1', 'Week 2', 'Week 3', 'Week 4']

  // Owner call, second time: the free first level is OFF. The hour it ran, four
  // of fifteen visitors took the tutorial and the click rate sat at 13% against
  // a 28% day average. Thin evidence on its own, but it is the owner's money
  // and the exact cannibalisation they predicted, so it goes.
  //
  // Everything else the freemium work bought us stays: numbered steps instead
  // of five identical padlocks, and a counter that names the prize rather than
  // reading zero. Flip this to true to bring the playable level back, and the
  // whole done/next loop below wakes up with it.
  const FREE_FIRST_STEP = false

  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!FREE_FIRST_STEP) return
    try { if (sessionStorage.getItem('ac_free_step_done') === '1') setDone(true) } catch { /* blocked */ }
  }, [FREE_FIRST_STEP])
  const markDone = () => {
    setDone(true)
    try { sessionStorage.setItem('ac_free_step_done', '1') } catch { /* blocked */ }
  }

  return (
    <div className="mt-8">
      <Progress unlocked={FREE_FIRST_STEP ? 1 : 0} total={plan.length} />

      {done && (
        <div className="flex" style={{ gap: 10, border: `2px solid ${GREEN}`, backgroundColor: '#F4F8F3', padding: '11px 14px', marginBottom: 18 }}>
          <span aria-hidden style={{ fontSize: 15, lineHeight: 1.2 }}>✓</span>
          <span style={{ fontSize: 13.5, color: RICH, fontWeight: 600, lineHeight: 1.45 }}>
            Step 1 is yours. Step 2 is the one that turns it into a habit, and it lives in the library
            with the other {plan.length - 1}.
          </span>
        </div>
      )}

      {plan.map((t, i) => {
        const isFree = FREE_FIRST_STEP && i === 0
        // Once the free level is taken, row 2 becomes the live one: it gets the
        // colour, the label and the button, so momentum carries into the wall.
        const isNext = done && i === 1
        const state: 'free' | 'donefree' | 'next' | 'locked' =
          isFree ? (done ? 'donefree' : 'free') : isNext ? 'next' : 'locked'

        const accent = state === 'locked' ? INK : state === 'next' ? FULVOUS : GREEN
        const badge =
          state === 'free' ? { bg: GREEN, label: 'open it ↗' }
          : state === 'next' ? { bg: FULVOUS, label: 'unlock step 2 ↗' }
          : null

        const rail = (
          <span className="flex flex-col items-center shrink-0" style={{ width: 40 }}>
            <span
              className="flex items-center justify-center shrink-0"
              style={{
                width: 40, height: 40, borderRadius: '50%',
                backgroundColor: state === 'locked' ? '#FFFFFF' : accent,
                border: `3px solid ${state === 'locked' ? INK : accent}`,
                color: state === 'locked' ? INK : '#FFFFFF', fontWeight: 800, fontSize: 15,
              }}
              aria-hidden
            >
              {/* Step NUMBERS down the rail, not five identical padlocks: locks
                  read as five copies of the word "no", numbers read as a route
                  with five stops. Done turns to a tick. */}
              {state === 'donefree' ? '✓' : i + 1}
            </span>
            {i < plan.length - 1 && <span className="flex-1 mt-1" style={{ width: 3, backgroundColor: '#E3DED4' }} aria-hidden />}
          </span>
        )

        const label =
          state === 'free' ? ' · FREE, NO CARD'
          : state === 'donefree' ? ' · ✓ DONE, YOURS'
          : state === 'next' ? ' · 🔓 YOU’RE UP NEXT'
          : ' · 🔒 IN THE LIBRARY'

        const card = (
          <span
            className="flex flex-1 gap-4 items-center transition-transform group-hover:-translate-y-px"
            style={{
              border: `2px solid ${accent}`,
              backgroundColor: '#FFFFFF',
              padding: '12px 14px',
              minWidth: 0,
              boxShadow: state === 'locked' ? 'none' : `inset 0 0 0 1px ${accent}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover(t.qf)}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              style={{
                width: 58, height: 76, objectFit: 'cover', border: `2px solid ${INK}`, display: 'block',
                backgroundColor: CREAM, flexShrink: 0,
                filter: state === 'locked' ? 'grayscale(1)' : 'none',
                opacity: state === 'locked' ? 0.55 : 1,
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="block" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', color: state === 'locked' ? MUTE : accent }}>
                {weeks[i].toUpperCase()}{label}
              </span>
              <span className="block mt-1" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, color: state === 'locked' ? '#6E675A' : RICH }}>{t.title}</span>
              <span className="block mt-1" style={{ fontSize: 12.5, lineHeight: 1.45, color: BODY, fontWeight: 300 }}>{t.desc}</span>
            </span>
            {badge && (
              <span
                className="inline-flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: badge.bg, color: '#FFFFFF', fontWeight: 800, fontSize: 12, padding: '9px 13px', whiteSpace: 'nowrap' }}
              >
                {badge.label}
              </span>
            )}
          </span>
        )

        // Week 1 opens the real tutorial (new tab, our page stays behind it).
        // Everything else is the wall and goes to checkout.
        return isFree ? (
          <FreeStepLink
            key={t.qf}
            href={t.link}
            qf={t.qf}
            submissionId={submissionId}
            onOpened={markDone}
            className="group flex gap-4 sm:gap-5 relative"
            style={{ textDecoration: 'none', paddingBottom: 26 }}
          >
            {rail}
            {card}
          </FreeStepLink>
        ) : (
          <CheckoutLink
            key={t.qf}
            href={checkoutUrl}
            placement={isNext ? 'v2_study_plan_next' : 'v2_study_plan'}
            submissionId={submissionId}
            className="group flex gap-4 sm:gap-5 relative"
            style={{ textDecoration: 'none', paddingBottom: i === plan.length - 1 ? 0 : 26 }}
          >
            {rail}
            {card}
          </CheckoutLink>
        )
      })}
    </div>
  )
}
