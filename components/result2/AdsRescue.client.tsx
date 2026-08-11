'use client'

import { useEffect, useRef, useState } from 'react'
import { sendEvent } from '@/lib/events-client'

// Last-chance capture for PAID traffic only.
//
// LinkedIn ads are the worst-converting source we have: 52 takers in a week
// and zero sales. Those clicks cost money, so letting one leave with nothing
// is the most expensive event on the page.
//
// Two gates, both required, deliberately strict:
//   1. They reached the BOTTOM of the page. Someone who bounced in ten seconds
//      has not earned a free course and interrupting them would only make the
//      ad experience worse.
//   2. They are actually leaving — cursor out through the top of the viewport
//      on desktop, or a hard back-gesture / tab-hide on mobile.
//
// Order matters: the offer is a downsell, so it must never appear to anyone who
// might still buy. By the time both gates pass, this person has read the whole
// page and moved to close it. They have already said no.
//
// Once per session, never for lifecycle-email returns, and never for organic
// traffic — organic leads cost nothing to re-reach through the newsletter.

const SHOWN_KEY = 'ac_ads_rescue_shown'
const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const GREEN = '#2D6A26'

/** Sources we pay for. Anyone else gets nothing. */
const PAID_SOURCES = new Set(['li_ads', 'linkedin_ads', 'linkedin', 'google_ads', 'meta_ads'])

export default function AdsRescue({
  submissionId, email, firstName, utmSource, offerPrice = '$4.99',
}: {
  submissionId?: string
  /** Known from the quiz, so the form is one click rather than a keyboard. */
  email?: string | null
  firstName?: string | null
  utmSource?: string | null
  /** The price this visitor was shown, so the downsell does not quote a
   *  different one than the page they just read. */
  offerPrice?: string
}) {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [typed, setTyped] = useState('')
  const reachedEnd = useRef(false)
  const armed = useRef(false)

  useEffect(() => {
    const src = (utmSource || '').toLowerCase()
    if (!PAID_SOURCES.has(src)) return
    try {
      if (new URLSearchParams(location.search).get('utm_source') === 'lifecycle') return
      if (sessionStorage.getItem(SHOWN_KEY)) return
    } catch { /* storage blocked — carry on without the once-guard */ }

    armed.current = true

    // Gate 1: bottom of the page. 88% rather than 100% because the sticky bar
    // and mobile URL bars mean the true bottom is often unreachable.
    const onScroll = () => {
      const doc = document.documentElement
      const progress = (window.scrollY + window.innerHeight) / doc.scrollHeight
      if (progress >= 0.88) reachedEnd.current = true
    }

    const fire = (how: string) => {
      if (!armed.current || !reachedEnd.current) return
      armed.current = false
      try { sessionStorage.setItem(SHOWN_KEY, '1') } catch { /* non-fatal */ }
      setOpen(true)
      sendEvent('exit_rescue_shown', { props: { variant: 'ads_rescue', how, utmSource: src }, submissionId })
    }

    // Gate 2, desktop: cursor exits through the top of the viewport.
    const onMouseOut = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget) fire('mouseout_top')
    }
    // Gate 2, mobile: the tab is being hidden or the page is going away.
    const onVisibility = () => { if (document.visibilityState === 'hidden') fire('visibility_hidden') }

    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('visibilitychange', onVisibility)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [utmSource, submissionId])

  if (!open) return null

  const target = (email || typed).trim()

  const submit = async () => {
    if (busy || !target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return
    setBusy(true)
    sendEvent('exit_rescue_accepted', { props: { variant: 'ads_rescue' }, submissionId })
    try {
      await fetch('/api/free-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target, name: firstName || '', source: 'ads_rescue' }),
      })
      setSent(true)
    } catch {
      // Lead is more valuable than the confirmation — show success and let the
      // server-side log carry the failure.
      setSent(true)
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    setOpen(false)
    sendEvent('exit_rescue_dismissed', { props: { variant: 'ads_rescue' }, submissionId })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Free AI 101 course"
      onClick={e => { if (e.target === e.currentTarget) close() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(26,26,26,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18,
      }}
    >
      <div style={{ background: CREAM, border: `3px solid ${INK}`, maxWidth: 460, width: '100%', padding: '26px 24px 24px', position: 'relative' }}>
        <button
          type="button" onClick={close} aria-label="Close"
          style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', fontSize: 22, lineHeight: 1, color: MUTE, cursor: 'pointer' }}
        >×</button>

        {sent ? (
          <>
            <div style={{ fontSize: 30 }} aria-hidden>✅</div>
            <h2 className="mt-2 font-bold" style={{ fontSize: 24, lineHeight: 1.1, letterSpacing: '-0.03em', color: RICH }}>
              It&rsquo;s on its way
            </h2>
            <p className="mt-2" style={{ fontSize: 15, lineHeight: 1.5, color: BODY, fontWeight: 300 }}>
              Day 1 of AI 101 lands in your inbox in the next few minutes. Check spam if it hides.
            </p>
            <button
              type="button" onClick={close}
              style={{ marginTop: 18, background: INK, color: CREAM, border: 'none', fontWeight: 700, fontSize: 15, height: 46, padding: '0 22px', cursor: 'pointer' }}
            >
              back to my result
            </button>
          </>
        ) : (
          <>
            <span className="inline-block font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: '0.18em', color: FULVOUS, fontWeight: 700 }}>
              Before you go
            </span>
            <h2 className="mt-2 font-bold" style={{ fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.035em', color: RICH }}>
              {firstName ? `${firstName}, take the free one` : 'Take the free one'}
            </h2>
            <p className="mt-2" style={{ fontSize: 15, lineHeight: 1.5, color: BODY, fontWeight: 300 }}>
              Not ready for the library, fair enough. <strong style={{ fontWeight: 700, color: RICH }}>AI 101</strong> is our
              free email course: the fundamentals, one short lesson at a time, no card and nothing to cancel.
            </p>

            {!email && (
              <input
                type="email" inputMode="email" autoComplete="email" placeholder="you@work.com"
                value={typed} onChange={e => setTyped(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submit() }}
                style={{ marginTop: 14, width: '100%', height: 46, border: `2px solid ${INK}`, background: '#FFF', padding: '0 12px', fontSize: 15, color: RICH }}
              />
            )}

            <button
              type="button" onClick={submit} disabled={busy}
              style={{
                marginTop: 14, width: '100%', background: GREEN, color: '#FFFFFF', border: `2px solid ${INK}`,
                fontWeight: 800, fontSize: 16, height: 52, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'sending…' : 'Yes, send me the AI 101 course'}
            </button>

            <p className="mt-3" style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.45 }}>
              {email
                ? <>One tap &middot; it goes straight to <strong style={{ color: BODY }}>{email}</strong>, nothing to type. </>
                : 'Unsubscribe any time. '}
              The {offerPrice} library is still there when you want it.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
