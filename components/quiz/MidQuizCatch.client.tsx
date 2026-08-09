'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { sendEvent } from '@/lib/events-client'

// Mid-quiz exit catch.
//
// Where the leak is: of 1,871 recorded sessions, 1,358 exit on /quiz. That is
// bigger than every result-page problem combined, and until now nothing caught
// it - - ExitRescue2 is result-page specific and was never mounted anyway.
//
// IT NOW ASKS FOR ONE THING, AND THAT CHANGED FOR A REASON.
//
// The original comment here said it deliberately asks for nothing, because the
// quiz "already POSTed a partial lead the moment name and email were valid".
// That was true when the quiz asked for name and email FIRST. Question-first
// shipped 2026-07-27 and moved the email to step 10 of 11, which silently
// killed the assumption: somebody who quits at question 4 now leaves NO trace
// at all. The evidence is in the data, only 2 partials in the last 7 days
// against 201 all-time, and 72 of the 74 who never finished have a name but
// never answered question 1, which is the signature of the old order.
//
// So the popup's job has changed. Resuming is still the best outcome and stays
// the primary button. But if they are going anyway, an email is the difference
// between a person we can follow up and a session we never knew happened.
//
// It offers a save rather than begging for a lead: the ask is "where should we
// send it", the same framing that the email step itself now uses.
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

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export default function MidQuizCatch({
  step, totalSteps, done, answers, utmSource, utmRef, clientId,
}: {
  step: number
  totalSteps: number
  /** True once the quiz is submitted, so we never interrupt a finisher. */
  done: boolean
  /** Answers so far, so a saved email arrives WITH their progress attached. */
  answers?: Record<string, string | string[]>
  utmSource?: string | null
  utmRef?: string | null
  /** Same client id the quiz uses, so this UPDATES their partial row rather
   *  than creating a second one for the same person. */
  clientId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [emailErr, setEmailErr] = useState('')
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

  const saveEmail = async () => {
    const v = email.trim().toLowerCase()
    if (!isValidEmail(v)) { setEmailErr('That does not look like an email'); return }
    setEmailErr('')
    setSaving(true)
    try {
      // Same endpoint the quiz already uses, with the SAME clientId, so this
      // updates their partial row instead of creating a duplicate person.
      await fetch('/api/submit-quiz-v2/partial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: { ...(answers || {}), email: v },
          utmSource: utmSource || undefined,
          utmRef: utmRef || undefined,
          clientId: clientId || undefined,
        }),
      })
      // Fired AFTER the save, so the count means "emails we actually hold",
      // not "times somebody typed into the box". `step` rides along so we can
      // see whether these arrive from early quitters or near-finishers.
      sendEvent('quiz_exit_catch_email', { props: { step } })
      setSaved(true)
    } catch {
      // Never block the exit on our own network. They still leave with their
      // draft in localStorage, exactly as before.
      setEmailErr('Could not save just now, your answers are still kept on this device')
    } finally {
      setSaving(false)
    }
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
        {/* Only name a number when the number is an argument to stay. "3
            questions left" pulls someone back; "10 questions left" tells them
            they were right to leave, and it reintroduces the count we just
            took off the quiz itself. */}
        <div className="font-mono uppercase" style={{ fontSize: 11, letterSpacing: '.2em', color: FULVOUS, fontWeight: 700 }}>
          {left === 1 ? 'One question left' : left <= 3 ? `${left} questions left` : 'Your answers are saved'}
        </div>

        <h2 className="mt-3 font-bold" style={{ fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.035em', color: RICH }}>
          {headline}
        </h2>

        <p className="mt-3" style={{ fontSize: 15, lineHeight: 1.5, color: '#4A4A4A', fontWeight: 300 }}>
          Your answers are saved, so nothing is lost either way.{' '}
          {left <= 3 ? (left === 1 ? 'One more' : `Another ${left}`) : 'Finish'} and
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

        {/* The save. Secondary to resuming on purpose: finishing now is still
            the better outcome for both sides, so it never competes with the
            button above. But if they are leaving anyway, this is the only
            difference between a person we can reach and a session we never
            knew happened. */}
        {saved ? (
          <p className="mt-4" style={{ fontSize: 13.5, color: '#2E7D32', fontWeight: 600, lineHeight: 1.45 }}>
            Saved. We will send you the link to pick up where you left off.
          </p>
        ) : (
          <div className="mt-4" style={{ borderTop: `1px solid #E0DACE`, paddingTop: 14 }}>
            <label htmlFor="ac-catch-email" style={{ display: 'block', fontSize: 12.5, color: '#4A4A4A', marginBottom: 7, lineHeight: 1.4 }}>
              Going now? Tell us where to send it and finish whenever.
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="ac-catch-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={e => { setEmail(e.target.value); if (emailErr) setEmailErr('') }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveEmail() } }}
                placeholder="name@example.com"
                disabled={saving}
                style={{
                  flex: 1, minWidth: 0, height: 44, padding: '0 12px', fontSize: 15,
                  border: `2px solid ${emailErr ? '#BE3B3B' : INK}`, background: '#FFFFFF', color: RICH,
                }}
              />
              <button
                type="button"
                onClick={() => void saveEmail()}
                disabled={saving}
                style={{
                  height: 44, padding: '0 16px', background: FULVOUS, color: RICH,
                  border: `2px solid ${INK}`, fontWeight: 700, fontSize: 14.5, cursor: 'pointer', flexShrink: 0,
                }}
              >
                {saving ? 'Saving…' : 'Send it'}
              </button>
            </div>
            {emailErr && (
              <p style={{ fontSize: 12, color: '#BE3B3B', marginTop: 6, textAlign: 'left' }}>{emailErr}</p>
            )}
          </div>
        )}

        <button
          type="button" onClick={() => close('dismiss')}
          // Padding, not margin, so the tap target clears 44px on a phone. As
          // margin it rendered 19px tall, which on mobile means the dismiss is
          // easy to miss and easy to hit by accident, and a rescue popup that
          // is hard to close is the kind that gets the page closed instead.
          style={{ padding: '14px', background: 'none', border: 'none', color: MUTE, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}
        >
          {saved ? 'Close' : 'I will come back later'}
        </button>
      </div>
    </div>
  )
}
