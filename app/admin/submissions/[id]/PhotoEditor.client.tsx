'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Manual photo URL replacement — for the cases where Apify+Apollo both fail
 * and you need to paste a LinkedIn photo URL by hand.
 *
 * Right-click the photo in LinkedIn → "Copy image address" → paste here.
 */
export default function PhotoEditor({
  id,
  currentPhotoUrl,
  name,
  email,
  fill,
}: {
  id: string
  currentPhotoUrl?: string
  name?: string
  email: string
  /**
   * Fill the parent container as a square, hard-edged portrait (for the
   * dossier stamp frame) instead of the default 96px rounded thumbnail.
   */
  fill?: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(currentPhotoUrl || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(newUrl: string) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl: newUrl || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed'); return }
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const boxClass = fill
    ? 'w-full object-cover bg-[#F5F5F5]'
    : 'w-24 h-24 rounded-2xl object-cover bg-[#F5F5F5] border border-[#E8E4DF]'
  const boxStyle = fill ? { aspectRatio: '1 / 1', display: 'block' as const } : undefined

  return (
    <div className="relative group shrink-0">
      {currentPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentPhotoUrl}
          alt={name || email}
          referrerPolicy="no-referrer"
          className={boxClass}
          style={boxStyle}
        />
      ) : (
        <div
          className={`${fill ? 'w-full bg-[#F5F5F5] text-7xl' : 'w-24 h-24 rounded-2xl bg-[#F5F5F5] border border-[#E8E4DF] text-3xl'} flex items-center justify-center font-black text-[#9C9C9C]`}
          style={fill ? { aspectRatio: '1 / 1' } : undefined}
        >
          {(name || email).slice(0, 1).toUpperCase()}
        </div>
      )}

      {/* Edit overlay — visible on hover */}
      {!editing && (
        <button
          onClick={() => { setUrl(currentPhotoUrl || ''); setEditing(true) }}
          className={`absolute inset-0 ${fill ? '' : 'rounded-2xl'} bg-black/0 group-hover:bg-black/55 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100`}
          title="Replace photo URL"
        >
          <span className="text-[#FFFDFA] text-[10px] font-bold uppercase tracking-wider">✎ Edit URL</span>
        </button>
      )}

      {/* Inline edit popover */}
      {editing && (
        <div className="absolute top-full left-0 mt-2 w-[420px] z-30 bg-white border border-[#E8E4DF] rounded-xl shadow-lg p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#9C9C9C] mb-1.5">
            Paste photo URL <span className="text-[#E8E4DF]">·</span> <span className="font-normal normal-case">right-click LinkedIn photo → Copy image address</span>
          </p>
          <input
            autoFocus
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://media.licdn.com/dms/image/..."
            className="w-full px-2 py-1.5 text-[12px] border border-[#E8E4DF] rounded outline-none focus:border-[#046BB1]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') save(url.trim())
              if (e.key === 'Escape') setEditing(false)
            }}
          />
          {error && <p className="text-[11px] text-[#BE3B3B] mt-1">{error}</p>}
          <div className="flex gap-2 mt-2 justify-end">
            <button
              onClick={() => setEditing(false)}
              className="px-2.5 py-1 text-[11px] font-medium text-[#9C9C9C] hover:text-[#333333]"
            >
              Cancel
            </button>
            {currentPhotoUrl && (
              <button
                onClick={() => save('')}
                disabled={busy}
                className="px-2.5 py-1 text-[11px] font-bold text-[#BE3B3B] hover:bg-[#BE3B3B]/10 rounded disabled:opacity-40"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => save(url.trim())}
              disabled={busy || !url.trim()}
              className="px-3 py-1 text-[11px] font-bold bg-[#333333] text-[#FFFDFA] rounded disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
