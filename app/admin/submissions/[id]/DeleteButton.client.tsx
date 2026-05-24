'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function DeleteButton({ id }: { id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onDelete() {
    if (!confirm('Permanently delete this submission?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/admin/submissions')
        router.refresh()
      } else {
        alert('Delete failed')
        setBusy(false)
      }
    } catch {
      alert('Network error')
      setBusy(false)
    }
  }

  return (
    <button
      onClick={onDelete}
      disabled={busy}
      className="text-xs text-red-600 hover:text-red-700 font-medium hover:underline disabled:opacity-40"
    >
      {busy ? 'Deleting…' : 'Delete this submission'}
    </button>
  )
}
