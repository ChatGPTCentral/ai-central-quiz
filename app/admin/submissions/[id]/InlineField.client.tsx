'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  rowId: string
  field: string                  // camelCase key whitelisted in PATCH route
  value: string                  // current persisted value
  placeholder?: string
  /** Render value as a link (e.g. for LinkedIn URLs). */
  asLink?: boolean
  /** Optional formatter for read-mode display. */
  display?: (v: string) => React.ReactNode
}

/**
 * Inline editable field — click to edit, Enter or blur to save, ESC to cancel.
 * Uses the existing PATCH /api/admin/submissions/[id] endpoint.
 */
export default function InlineField({ rowId, field, value, placeholder, asLink, display }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit() {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/submissions/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: draft }),
      })
      if (res.ok) {
        setEditing(false)
        router.refresh()
      } else {
        alert('Save failed')
      }
    } catch {
      alert('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        placeholder={placeholder}
        disabled={saving}
        className="w-full px-2 py-1 border border-[#046BB1] rounded text-sm outline-none bg-white"
      />
    )
  }
  if (value) {
    if (asLink) {
      return (
        <a
          href={value}
          target="_blank" rel="noopener noreferrer"
          onDoubleClick={(e) => { e.preventDefault(); setEditing(true) }}
          title="Double-click to edit"
          className="text-[#046BB1] hover:underline break-all text-sm"
        >{display ? display(value) : value}</a>
      )
    }
    return (
      <span
        onDoubleClick={() => setEditing(true)}
        title="Double-click to edit"
        className="cursor-text hover:bg-[#FEF7E7] -mx-1 px-1 py-0.5 rounded text-sm text-[#333333]"
      >{display ? display(value) : value}</span>
    )
  }
  return (
    <span
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
      className="cursor-text hover:bg-[#FEF7E7] -mx-1 px-1 py-0.5 rounded text-sm text-[#E8E4DF]"
    >+ {placeholder || 'add'}</span>
  )
}
