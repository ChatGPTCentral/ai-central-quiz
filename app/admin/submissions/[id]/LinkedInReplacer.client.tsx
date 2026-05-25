'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props { id: string; value?: string }

/**
 * Editable LinkedIn URL on the detail page. When the value changes, runs the
 * v2 enrichment pipeline (force) automatically so all other fields refresh
 * against the new profile.
 */
export default function LinkedInReplacer({ id, value }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState(value || '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'partial' | 'fail'>('idle')

  async function save() {
    const trimmed = draft.trim()
    if (trimmed === (value || '').trim()) { setEditing(false); return }
    setSaving(true)
    try {
      // Update the URL on the row
      const patch = await fetch(`/api/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedinUrl: trimmed }),
      })
      if (!patch.ok) { alert('Save failed'); setSaving(false); return }
      setEditing(false)
      setSaving(false)
      // Then immediately re-enrich with the new URL
      setEnriching(true)
      const enr = await fetch('/api/admin/enrich/v2/row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, save: true, force: true }),
      })
      const data = await enr.json()
      setStatus(data.status === 'complete' ? 'ok' : data.status === 'partial' ? 'partial' : 'fail')
      router.refresh()
    } catch {
      setStatus('fail')
    } finally {
      setSaving(false)
      setEnriching(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false) } }}
          placeholder="https://www.linkedin.com/in/…"
          disabled={saving || enriching}
          className="flex-1 px-2 py-1 border border-[#046BB1] rounded text-sm outline-none"
        />
        <button onClick={save} disabled={saving || enriching}
          className="h-7 px-3 rounded-md bg-[#333333] text-[#FFFDFA] text-[10px] font-bold uppercase tracking-wider disabled:opacity-40">
          {saving ? 'Saving…' : enriching ? 'Enriching…' : 'Save & enrich'}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      {value ? (
        <a href={value} target="_blank" rel="noopener noreferrer"
          className="text-[#046BB1] hover:underline break-all text-sm">{value}</a>
      ) : (
        <span className="text-sm text-[#E8E4DF]">No LinkedIn URL</span>
      )}
      <button
        onClick={() => setEditing(true)}
        title="Replace LinkedIn URL (will auto re-enrich after save)"
        className="text-[10px] font-bold uppercase tracking-wider text-[#9C9C9C] hover:text-[#333333] px-1.5 py-0.5 rounded border border-[#E8E4DF] hover:bg-[#FEF7E7]"
      >
        ↺ Replace
      </button>
      {status === 'ok'      && <span className="text-[10px] text-[#62A758] font-bold">✓ enriched</span>}
      {status === 'partial' && <span className="text-[10px] text-[#E48715] font-bold">~ partial</span>}
      {status === 'fail'    && <span className="text-[10px] text-[#BE3B3B] font-bold">✕ failed</span>}
    </div>
  )
}
