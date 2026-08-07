'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { sendEvent } from '@/lib/events-client'

// Mid-quiz exit catch.
//
// Where the leak is: of 1,871 recorded sessions, 1,358 exit on /quiz. That is
// bigger than every result-page problem combined, and until now nothing caught
// it - - ExitRescue2 is result-page specific and was never mounted anyway.
//
// It does NOT ask for anything. The quiz already saved their draft to
// localStorage and already POSTed a partial lead the moment name and email were
// valid, so we have the person and we have their answers. Asking again would be
// theatre. The only job here is to make the two things they cannot see true and
// visible: their place is kept, and the end is closer than it feels.
//
// That also keeps it honest. A popup that begs is a popup that earns a dismiss;
// one that says "you are three questions from your result, and it is saved
// either way" is just information the person did not have.
//
// Gates, deliberately strict:
//   1. step >= MIN_STEP - - someone who bounces on the name field has invested
//      nothing, and interrupting them is pure annoyance
//   2. once per session
//   3. desktop: cursor genuinely leaving through the top of the viewport.
//      mobile: there is no exit-intent signal, so it fires on RETURN instead,
//      when they come back to a tab they left. Same idea, opposite moment: the
//      desktop version catches you leaving, the mobile one welcomes you back.

const SHOWN_KEY = 'ac_midquiz_catch_shown'
const MIN_STEP = 3
/** Below this, a tab switch is alt-tabbing, not leaving. */
const AWAY_MS = 25_000

const INK = '#333333'
const RICH = '#1A1A1A'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const MUTE = '#9C9C9C'

export default function MidQuizCatch({
  step, totalSteps, done,
}: {
  step: number
  totalSteps: number
  /** True once the quiz is submitted, so we never interrupt a finisher. */
  done: boolean
}) {
  const [open, setOpen] = useState(false)
  const hiddenAt = useRef<number | null>(null)
  // Refs, not deps: the listeners are bound once and must read CURRENT values.
  // Re-binding them on every answered question would re-run the effect eleven
  // times per quiz and risk missing the one moment that matters.
  const stateRef = useRef({ step, totalSteps, done })
  stateRef.current = { step, totalSteps, done }

  // ?catch=1 forces it open for review, bypassing every gate. Without this,
  // seeing the thing means answering two questions and then performing a
  // precise mouse gesture, which makes it effectively unreviewable.
  const forced = useCallback(() => {
    try { return new URLSearchParams(window.location.search).get('catch') === '1' }
    catch { return false }
  }, [])

  const eligible = useCallback(() => {
    const s = stateRef.current
    if (s.done || s.step < MIN_STEP || s.step >= s.totalSteps) return false
    try {
      if (sessionStorage.getItem(SHOWN_KEY) === '1') return false
    } catch { /* storage blocked - - allow, showing once too often beats never */ }
    return true
  }, [])

  const show = useCallback((trigger: string) => {
    if (!eligible()) return
    try { sessionStorage.setItem(SHOWN_KEY, '1') } catch { /* non-fatal */ }
    setOpen(true)
    sendEvent('quiz_exit_catch_shown', { props: { trigger, step: stateRef.current.step } })
  }, [eligible])

  useEffect(() => {
    if (forced()) { setOpen(true); return }
    const onMouseOut = (e: MouseEvent) => {
      // Only the top edge, and only when the cursor has actually left the
      // document. relatedTarget stays null when it exits the window.
      if (e.clientY > 8 || e.relatedTarget) return
      show('exit_intent')
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0
      hiddenAt.current = null
      if (away >= AWAY_MS) show('returned')
    }
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [show, forced])

  if (!open) return null

  const left = Math.max(1, totalSteps - step)
  // The headline has to be TRUE at whatever step this fires. "You are nearly
  // there" with eight questions to go is a lie, and a rescue popup that opens
  // by overclaiming has spent the trust it needs to work. So it scales: the
  // urgency line is only used when the urgency is real, and otherwise it falls
  // back to the thing that is always true, which is that nothing is lost.
  const halfway = totalSteps / 2
  const headline =
    left <= 3 ? 'You are nearly there'
    : left <= halfway ? 'You are past halfway'
    : 'Your place is saved'
  const cta =
    left <= 3 ? (left === 1 ? 'Finish the last one' : `Finish the last ${left}`)
    : 'Pick up where I left off'
  const close = (how: string) => {
    sendEvent(how === 'resume' ? 'quiz_exit_catch_resumed' : 'quiz_exit_catch_dismissed', {
      props: { step },
    })
    setOpen(false)
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label="You are almost done"
      onClick={e => { if (e.target === e.currentTarget) close('backdrop') }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(26,26,26,.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        background: CREAM, border: `3px solid ${INK}`, boxShadow: `8px 9px 0 ${RICH}`,
        maxWidth: 420, width: '100%', padding: '26px 24px 24px', textAlign: 'center',
      }}>
        <div className="font-mono uppercase" style={{ fontSize: 11, letterSpacing: '.2em', color: FULVOUS, fontWeight: 700 }}>
          {left === 1 ? 'One question left' : `${left} questions left`}
        </div>

        <h2 className="mt-3 font-bold" style={{ fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.035em', color: RICH }}>
          {headline}
        </h2>

        <p className="mt-3" style={{ fontSize: 15, lineHeight: 1.5, color: '#4A4A4A', fontWeight: 300 }}>
          Your answers are saved, so nothing is lost either way. {left === 1 ? 'One more' : `Another ${left}`} and
          you get your stage on the ladder, your percentile, and a 30-day plan built from your answers.
        </p>

        <button
          type="button" onClick={() => close('resume')}
          className="mt-5 transition-transform hover:-translate-y-px active:translate-y-0"
          style={{
            background: RICH, color: CREAM, border: `3px solid ${RICH}`, width: '100%',
            height: 54, fontWeight: 800, fontSize: 16.5, cursor: 'pointer',
            boxShadow: `5px 6px 0 ${FULVOUS}`,
          }}
        >
          {cta}
        </button>

        <button
          type="button" onClick={() => close('dismiss')}
          // Padding, not margin, so the tap target clears 44px on a phone. As
          // margin it rendered 19px tall, which on mobile means the dismiss is
          // easy to miss and easy to hit by accident, and a rescue popup that
          // is hard to close is the kind that gets the page closed instead.
          style={{ padding: '14px', background: 'none', border: 'none', color: MUTE, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}
        >
          I will come back later
        </button>
      </div>
    </div>
  )
}
