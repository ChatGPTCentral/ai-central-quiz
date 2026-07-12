'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** "Pull now" for the Clarity snapshot (each run spends 4 of the API's 10
 *  daily calls). Refreshes the funnel page when rows land. */
export default function ClarityPullNow() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  const pull = async () => {
    setState('busy')
    setMsg('')
    try {
      const res = await fetch('/api/admin/clarity-snapshot', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      const pulled = Array.isArray(body.pulls) ? body.pulls.length : 0
      const errs = Array.isArray(body.errors) ? body.errors.length : 0
      setState(errs && !pulled ? 'error' : 'done')
      setMsg(errs && !pulled ? String(body.errors[0]).slice(0, 140) : `Pulled ${pulled} dimension${pulled === 1 ? '' : 's'}${errs ? `, ${errs} failed` : ''}`)
      router.refresh()
    } catch (e) {
      setState('error')
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={pull}
        disabled={state === 'busy'}
        className="rounded-md border border-[#E8E4DF] bg-white px-3 py-1.5 text-[12px] font-bold text-[#333333] hover:bg-[#FAF7F1] disabled:opacity-50"
      >
        {state === 'busy' ? 'Pulling…' : '⟳ Pull now'}
      </button>
      {msg && (
        <span style={{ fontSize: 11, fontWeight: 600, color: state === 'error' ? '#BE3B3B' : '#2E7D32' }}>{msg}</span>
      )}
    </span>
  )
}
