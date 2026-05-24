'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.push('/admin/submissions')
        router.refresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Login failed')
      }
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-2xl"
      >
        <div className="text-center mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">AI Central</p>
          <h1 className="text-2xl font-black text-black">Admin sign in</h1>
        </div>
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg outline-none focus:border-black text-base"
          placeholder="••••••••"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !password}
          className="mt-5 w-full py-3 rounded-lg bg-black text-white font-bold text-sm hover:bg-[#222] disabled:opacity-40 transition-colors"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
