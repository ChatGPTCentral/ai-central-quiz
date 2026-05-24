'use client'

import { useState, useEffect } from 'react'

interface Person {
  name?: string
  email?: string
  photoUrl?: string
  title?: string
  company?: string
  linkedinUrl?: string
}

interface Props {
  person: Person | null
  onClose: () => void
}

export default function PhotoLightbox({ person, onClose }: Props) {
  useEffect(() => {
    if (!person) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [person, onClose])

  if (!person) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8" onClick={onClose}>
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/60 hover:text-white text-3xl leading-none"
        aria-label="Close"
      >×</button>
      <div className="flex flex-col items-center gap-6 max-w-3xl w-full" onClick={e => e.stopPropagation()}>
        {person.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.photoUrl}
            alt={person.name || person.email || 'Profile'}
            className="max-h-[70vh] max-w-full rounded-2xl shadow-2xl bg-[#333333]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-80 h-80 rounded-2xl bg-[#333333] flex items-center justify-center text-white text-7xl font-black">
            {(person.name || person.email || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="text-center text-[#FFFDFA]">
          <p className="text-2xl font-black">{person.name || person.email}</p>
          {person.title && (
            <p className="text-sm text-white/70 mt-1">
              {person.title}{person.company && ` · ${person.company}`}
            </p>
          )}
          {person.linkedinUrl && (
            <a
              href={person.linkedinUrl}
              target="_blank" rel="noopener noreferrer"
              className="inline-block mt-3 px-4 py-2 bg-[#046BB1] text-white text-sm font-bold rounded-lg hover:opacity-90"
            >
              Open LinkedIn ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// Tiny client wrapper around the photo cell — opens the lightbox on click.
export function PhotoCell({
  person,
  size = 36,
  onOpen,
}: {
  person: Person
  size?: number
  onOpen: (p: Person) => void
}) {
  const [errored, setErrored] = useState(false)
  const showImg = person.photoUrl && !errored
  const initial = (person.name || person.email || '?').slice(0, 1).toUpperCase()
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onOpen(person) }}
      className="block rounded-full overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-[#046BB1] transition-all"
      style={{ width: size, height: size }}
      title="View photo"
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.photoUrl}
          alt={person.name || person.email || ''}
          className="w-full h-full object-cover bg-[#F5F5F5]"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="w-full h-full bg-[#F5F5F5] flex items-center justify-center text-[11px] font-bold text-[#9C9C9C]">
          {initial}
        </div>
      )}
    </button>
  )
}
