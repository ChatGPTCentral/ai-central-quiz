'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Footer actions on the detail page:
 *   • Archive (soft-delete) — default action, reversible
 *   • Restore — only shown when the row is currently archived
 *   • Permanently delete — destructive, requires double-confirm
 */
export default function DeleteButton({ id, archivedAt }: { id: string; archivedAt?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const archived = !!archivedAt

  async function archive() {
    if (!confirm('Archive this submission?\n\nRow stays in the database but disappears from charts + lists. Auto-resurfaces on re-submit.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/admin/submissions')
        router.refresh()
      } else { alert('Archive failed'); setBusy(false) }
    } catch { alert('Network error'); setBusy(false) }
  }

  async function restore() {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      })
      if (res.ok) router.refresh()
      else { alert('Restore failed'); setBusy(false) }
    } catch { alert('Network error'); setBusy(false) }
  }

  async function hardDelete() {
    if (!confirm('PERMANENTLY DELETE this row?\n\nThis cannot be undone. The row + all enrichment data is gone forever.')) return
    if (!confirm('Are you absolutely sure?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/submissions/${id}?hard=1`, { method: 'DELETE' })
      if (res.ok) { router.push('/admin/submissions'); router.refresh() }
      else { alert('Delete failed'); setBusy(false) }
    } catch { alert('Network error'); setBusy(false) }
  }

  return (
    <div className="flex items-center gap-4">
      {archived ? (
        <>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#9C9C9C]/15 text-[#666] border border-[#9C9C9C]/40">
            🗄️ Archived {archivedAt ? `on ${new Date(archivedAt).toLocaleDateString()}` : ''}
          </span>
          <button
            onClick={restore}
            disabled={busy}
            className="text-xs text-[#046BB1] hover:underline font-medium disabled:opacity-40"
          >
            {busy ? '…' : '↩ Restore from archive'}
          </button>
        </>
      ) : (
        <button
          onClick={archive}
          disabled={busy}
          className="text-xs text-[#9C9C9C] hover:text-[#333333] font-medium hover:underline disabled:opacity-40"
        >
          {busy ? 'Archiving…' : '🗄️ Archive this row'}
        </button>
      )}
      <button
        onClick={hardDelete}
        disabled={busy}
        className="text-xs text-[#BE3B3B] hover:text-[#8A1F1F] font-medium hover:underline disabled:opacity-40"
        title="Permanently delete — cannot be undone"
      >
        Permanently delete
      </button>
    </div>
  )
}
