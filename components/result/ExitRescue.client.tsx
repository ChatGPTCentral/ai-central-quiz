'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendEvent } from '@/lib/events-client'

const SHOWN_KEY = 'ac_exit_rescue_shown'

/**
 * Exit-intent rescue on the result page: when a visitor is about to leave
 * without buying, offer the free 5-day email course instead (one-click,
 * their email is already known) so the lead lands in the Beehiiv nurture
 * rather than vanishing.
 *
 * Triggers, once per session:
 *   - desktop: pointer leaves through the top of the viewport
 *   - mobile:  a fast scroll-up after having scrolled a viewport down
 *              (the classic back-button reach), or 60s dwell fallback
 */
export function ExitRescue({
  name,
  email,
  submissionId,
}: {
  name?: string | null
  email?: string | null
  submissionId?: string
}) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const armed = useRef(true)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SHOWN_KEY)) return
    } catch { /* storage blocked → still arm, just without the once-guard */ }

    const fire = () => {
      if (!armed.current) return
      armed.current = false
      try { sessionStorage.setItem(SHOWN_KEY, '1') } catch { /* non-fatal */ }
      setOpen(true)
      sendEvent('exit_rescue_shown', { submissionId: submissionId || undefined })
    }

    // Desktop: cursor exits through the viewport top (toward the tab bar).
    const onMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) fire()
    }

    // Mobile: fast scroll-up after real engagement, or a 60s dwell fallback.
    let maxY = 0
    let lastY = window.scrollY
    let lastT = Date.now()
    const onScroll = () => {
      const y = window.scrollY
      const now = Date.now()
      maxY = Math.max(maxY, y)
      const isTouch = window.matchMedia('(pointer: coarse)').matches
      if (isTouch && maxY > window.innerHeight && lastY - y > 250 && now - lastT < 700) fire()
      lastY = y
      lastT = now
    }
    const dwell = window.matchMedia('(pointer: coarse)').matches
      ? window.setTimeout(fire, 60_000)
      : undefined

    document.addEventListener('mouseout', onMouseOut)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('mouseout', onMouseOut)
      window.removeEventListener('scroll', onScroll)
      if (dwell) window.clearTimeout(dwell)
    }
  }, [submissionId])

  const dismiss = () => {
    setOpen(false)
    if (!done) sendEvent('exit_rescue_dismissed', { submissionId: submissionId || undefined })
  }

  const accept = async () => {
    sendEvent('exit_rescue_accepted', { submissionId: submissionId || undefined })
    if (!email) {
      // No email on hand (direct /result visit without ?id) — send them to
      // the free-course page to enter it.
      const p = new URLSearchParams()
      if (name) p.set('name', name)
      router.push(p.toString() ? `/free-course?${p.toString()}` : '/free-course')
      return
    }
    setBusy(true)
    try {
      await fetch('/api/free-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: name || '', source: 'exit_rescue' }),
      })
      setDone(true)
      window.setTimeout(() => setOpen(false), 2600)
    } catch {
      setDone(true) // never trap the visitor in a broken modal
      window.setTimeout(() => setOpen(false), 2600)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(51,51,51,0.45)' }}
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-rescue-title"
    >
      <div
        className="relative w-full max-w-[440px] rounded-2xl bg-white p-7 text-center"
        style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute top-3 right-3 text-[#C4BDB2] hover:text-[#9C9C9C] transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: '#FEF7E7' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E48715" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
            <rect x="2" y="4" width="20" height="16" rx="2" />
          </svg>
        </div>

        {done ? (
          <>
            <h3 className="text-[20px] font-black mb-2" style={{ color: '#333333' }}>
              Done — lesson 1 is on its way
            </h3>
            <p className="text-[14px] leading-relaxed" style={{ color: '#555' }}>
              Check {email} in the next few minutes.
            </p>
          </>
        ) : (
          <>
            <h3 id="exit-rescue-title" className="text-[20px] font-black mb-2" style={{ color: '#333333' }}>
              Before you go — take the free option
            </h3>
            <p className="text-[14px] leading-relaxed mb-6" style={{ color: '#555' }}>
              Not ready for the full library? Get the free 5-day AI Foundations email
              course instead — one short lesson a day, no cost, no commitment.
              {email ? <> We&apos;ll send it to <strong>{email}</strong>.</> : null}
            </p>
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              className="block w-full py-3.5 font-black text-[15px] rounded-xl transition-all active:scale-[0.99] hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: '#333333', color: '#FFFDFA' }}
            >
              {busy ? 'Sending…' : 'Send me the free course →'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="mt-3 text-[13px] underline underline-offset-2 transition-opacity hover:opacity-70"
              style={{ color: '#9C9C9C' }}
            >
              No thanks
            </button>
          </>
        )}
      </div>
    </div>
  )
}
