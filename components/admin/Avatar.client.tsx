'use client'

import { useState } from 'react'

/** Small round avatar for the admin list surfaces (People table, Board,
 *  ⌘K palette). Shows the enriched photo when one exists; falls back to
 *  the initials circle — including when the photo URL 404s (LinkedIn CDN
 *  links expire), which a plain server-side <img> can't handle. */
export default function Avatar({
  name,
  email,
  photoUrl,
  size = 26,
}: {
  name?: string | null
  email?: string | null
  photoUrl?: string | null
  size?: number
}) {
  const [broken, setBroken] = useState(false)

  const n = (name || '').trim()
  const initials = n
    ? n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : (email || '?')[0]!.toUpperCase()

  if (photoUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={n || email || ''}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
      />
    )
  }

  return (
    <span
      className="flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#EDE8DF',
        color: '#6B6B6B',
        fontSize: Math.max(8, Math.round(size * 0.38)),
        fontWeight: 700,
      }}
    >
      {initials}
    </span>
  )
}
