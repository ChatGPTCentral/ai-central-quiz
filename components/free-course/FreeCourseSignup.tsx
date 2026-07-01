'use client'

import { useState } from 'react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Email capture for the free 5-day course. Prefills from the quiz handoff. */
export function FreeCourseSignup({ name, email: initialEmail }: { name?: string; email?: string }) {
  const [email, setEmail] = useState(initialEmail || '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const clean = email.trim().toLowerCase()
    if (!EMAIL_RE.test(clean)) {
      setErr('Please enter a valid email address.')
      return
    }
    setStatus('loading')
    setErr('')
    try {
      const res = await fetch('/api/free-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean, name: name || '' }),
      })
      const data = await res.json()
      if (data.ok) setStatus('done')
      else {
        setStatus('error')
        setErr(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setErr('Network error. Please try again.')
    }
  }

  if (status === 'done') {
    return (
      <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DF' }}>
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: '#FEF7E7' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E48715" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="text-[17px] font-black mb-1" style={{ color: '#333333' }}>You&apos;re in! Check your inbox.</p>
        <p className="text-[14px] leading-relaxed" style={{ color: '#555' }}>
          Day 1 is on its way to <strong style={{ color: '#333333' }}>{email}</strong>. One short lesson a day for the next 5 days — no cost, cancel anytime.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-2xl p-5 sm:p-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DF' }}>
      <label htmlFor="fc-email" className="block text-[12px] font-bold mb-2" style={{ color: '#555' }}>
        Where should we send it?
      </label>
      <input
        id="fc-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@work.com"
        autoComplete="email"
        disabled={status === 'loading'}
        className="w-full px-4 py-3 rounded-xl text-[16px] outline-none transition-colors"
        style={{ border: '1px solid #E8E4DF', backgroundColor: '#FFFDFA', color: '#333333' }}
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="mt-3 w-full py-3.5 font-black text-[15px] rounded-xl transition-all active:scale-[0.99] hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: '#333333', color: '#FFFDFA' }}
      >
        {status === 'loading' ? 'Signing you up…' : 'Get the 5-day course →'}
      </button>
      {err && <p className="mt-2 text-[13px]" style={{ color: '#BE3B3B' }}>{err}</p>}
      <p className="mt-3 text-[11px] text-center" style={{ color: '#9C9C9C' }}>
        Free · No card · Unsubscribe anytime
      </p>
    </form>
  )
}
