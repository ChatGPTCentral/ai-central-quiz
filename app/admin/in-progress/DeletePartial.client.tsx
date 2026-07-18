'use client'

// ✗ button on an in-progress row: deletes the capture and refreshes the list.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeletePartial({ id, email }: { id: string; email: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const del = async () => {
    if (busy) return
    if (!confirm(`Delete the in-progress capture for ${email}?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/partials?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        alert(`Delete failed: ${b.error || res.status}`)
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={del}
      disabled={busy}
      title="Delete this capture"
      aria-label={`Delete ${email}`}
      className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-[#F5E9E9] text-[#C4BDB2] hover:text-[#BE3B3B] transition-colors"
      style={{ opacity: busy ? 0.4 : 1 }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
    </button>
  )
}
