'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * "Not yet" downsell — the soft exit from the paid offer. A quiet text link
 * opens a "No worries at all" reassurance modal (modeled on The Rundown's
 * quiz downsell) that routes to the free 5-day email course, carrying the
 * name/email so /free-course can pre-fill.
 */
export function NotYetDownsell({
  name,
  email,
  className,
}: {
  name?: string | null
  email?: string | null
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const goToFreeCourse = () => {
    const p = new URLSearchParams()
    if (name) p.set('name', name)
    if (email) p.set('email', email)
    const qs = p.toString()
    router.push(qs ? `/free-course?${qs}` : '/free-course')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'text-[13px] underline underline-offset-2 transition-opacity hover:opacity-70'
        }
        style={className ? undefined : { color: '#9C9C9C' }}
      >
        Not yet — show me a free option
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(51,51,51,0.45)' }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="notyet-title"
        >
          <div
            className="relative w-full max-w-[420px] rounded-2xl bg-white p-7 text-center"
            style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 text-[#C4BDB2] hover:text-[#9C9C9C] transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>

            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: '#FEF7E7' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E48715" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
                <rect x="2" y="4" width="20" height="16" rx="2" />
              </svg>
            </div>

            <h3 id="notyet-title" className="text-[20px] font-black mb-2" style={{ color: '#333333' }}>
              No worries at all
            </h3>
            <p className="text-[14px] leading-relaxed mb-6" style={{ color: '#555' }}>
              The full library isn&apos;t the right fit for everyone. Get our free 5-day AI
              Foundations email course instead — one short lesson a day, no cost and no
              commitment.
            </p>

            <button
              type="button"
              onClick={goToFreeCourse}
              className="block w-full py-3.5 font-black text-[15px] rounded-xl transition-all active:scale-[0.99] hover:opacity-90"
              style={{ backgroundColor: '#333333', color: '#FFFDFA' }}
            >
              Show me the free course →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
