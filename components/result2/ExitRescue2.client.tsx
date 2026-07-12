'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendEvent } from '@/lib/events-client'

const SHOWN_KEY = 'ac_exit_rescue_shown'

/**
 * Result v2 rescue popup: fires on genuine exit intent (cursor leaving
 * through the viewport top) OR after `dwellMs` on the page, whichever
 * comes first, once per session. v2-owned copy of the shared ExitRescue
 * (which stays exit-intent-only for v1). Lifecycle-email returns are
 * never shown the popup. The dwell default is the original 60s; the
 * v3_structure variant passes 240s so engaged video-watchers are not
 * interrupted mid-pitch.
 */
export function ExitRescue2({ submissionId, dwellMs = 60_000 }: { submissionId?: string; dwellMs?: number }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const armed = useRef(true)

  useEffect(() => {
    try {
      if (new URLSearchParams(location.search).get('utm_source') === 'lifecycle') return
    } catch { /* non-fatal */ }
    try {
      if (sessionStorage.getItem(SHOWN_KEY)) return
    } catch { /* storage blocked → still arm, just without the once-guard */ }

    let pointerInPage = false
    const armedAt = Date.now() + 4000

    const fire = () => {
      if (!armed.current) return
      armed.current = false
      try { sessionStorage.setItem(SHOWN_KEY, '1') } catch { /* non-fatal */ }
      setOpen(true)
      sendEvent('exit_rescue_shown', { submissionId: submissionId || undefined })
    }

    const onMove = () => { pointerInPage = true }
    const onMouseOut = (e: MouseEvent) => {
      if (!pointerInPage || Date.now() < armedAt) return
      if (!e.relatedTarget && e.clientY <= 0) fire()
    }
    // Dwell trigger: the free option after `dwellMs` even without an exit
    // signal (covers touch devices too).
    const dwellTimer = setTimeout(fire, dwellMs)

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseout', onMouseOut)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseout', onMouseOut)
      clearTimeout(dwellTimer)
    }
  }, [submissionId, dwellMs])

  const dismiss = () => {
    setOpen(false)
    sendEvent('exit_rescue_dismissed', { submissionId: submissionId || undefined })
  }

  const accept = () => {
    sendEvent('exit_rescue_accepted', { submissionId: submissionId || undefined })
    router.push('/starter-kit')
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(51,51,51,0.45)' }}
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-rescue2-title"
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
            <path d="M21 8v13H3V8" />
            <path d="M1 3h22v5H1z" />
            <path d="M10 12h4" />
          </svg>
        </div>

        <h3 id="exit-rescue2-title" className="text-[20px] font-black mb-2" style={{ color: '#333333' }}>
          Before you go, take 10 tutorials, free
        </h3>
        <p className="text-[14px] leading-relaxed mb-6" style={{ color: '#555' }}>
          The 10 most downloaded AI Central tutorials of 2026. No email, no
          card, yours to keep
        </p>
        <button
          type="button"
          onClick={accept}
          className="block w-full py-3.5 font-black text-[15px] rounded-xl transition-all active:scale-[0.99] hover:opacity-90"
          style={{ backgroundColor: '#333333', color: '#FFFDFA' }}
        >
          Take the 10 free tutorials →
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 text-[13px] underline underline-offset-2 transition-opacity hover:opacity-70"
          style={{ color: '#9C9C9C' }}
        >
          No thanks
        </button>
      </div>
    </div>
  )
}
