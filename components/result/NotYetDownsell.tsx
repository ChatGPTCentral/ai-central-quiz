'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendEvent } from '@/lib/events-client'

/**
 * "Not yet" downsell — the soft exit from the paid offer. A quiet text link
 * opens a reassurance modal that routes to the free Starter Kit page (the
 * 10 most downloaded tutorials of 2026).
 */
export function NotYetDownsell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const goToStarterKit = () => {
    sendEvent('exit_rescue_accepted', { props: { source: 'not_yet_link' } })
    router.push('/starter-kit')
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
        Not yet - - show me a free option
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
                <path d="M21 8v13H3V8" />
                <path d="M1 3h22v5H1z" />
                <path d="M10 12h4" />
              </svg>
            </div>

            <h3 id="notyet-title" className="text-[20px] font-black mb-2" style={{ color: '#333333' }}>
              No worries at all
            </h3>
            <p className="text-[14px] leading-relaxed mb-6" style={{ color: '#555' }}>
              The full library isn&apos;t the right fit for everyone. Take the 10
              most downloaded AI Central tutorials of 2026 instead - - free. No
              cost, no commitment
            </p>

            <button
              type="button"
              onClick={goToStarterKit}
              className="block w-full py-3.5 font-black text-[15px] rounded-xl transition-all active:scale-[0.99] hover:opacity-90"
              style={{ backgroundColor: '#333333', color: '#FFFDFA' }}
            >
              Take the 10 free tutorials →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
