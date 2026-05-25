'use client'

import { useState, useEffect, useRef } from 'react'

export interface CardPerson {
  id?: string
  name?: string
  email?: string
  photoUrl?: string
  title?: string
  company?: string
  companyIndustry?: string
  linkedinUrl?: string
  country?: string
  city?: string
  ageBracket?: string
  ageAiEstimate?: string
  sexAiEstimate?: string
  source?: string
  score?: number
}

interface Props {
  /** Currently focused person (or null = lightbox closed). */
  person: CardPerson | null
  /** Full ordered list so arrow keys can flip cards left/right. */
  allPeople?: CardPerson[]
  onClose: () => void
  /** Called when the user navigates to a different person via arrow keys. */
  onChange?: (next: CardPerson) => void
}

export default function PhotoLightbox({ person, allPeople = [], onClose, onChange }: Props) {
  const currentIndex = person && allPeople.length > 0
    ? allPeople.findIndex(p => p.id === person.id)
    : -1
  const canPrev = currentIndex > 0
  const canNext = currentIndex >= 0 && currentIndex < allPeople.length - 1

  const goPrev = () => { if (canPrev && onChange) onChange(allPeople[currentIndex - 1]) }
  const goNext = () => { if (canNext && onChange) onChange(allPeople[currentIndex + 1]) }

  useEffect(() => {
    if (!person) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person, currentIndex, allPeople.length])

  if (!person) return null

  const initial = (person.name || person.email || '?').slice(0, 1).toUpperCase()
  const counterText = currentIndex >= 0 && allPeople.length > 0
    ? `${currentIndex + 1} / ${allPeople.length}`
    : ''

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6 sm:p-10" onClick={onClose}>
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 text-white/60 hover:text-white text-3xl leading-none z-10"
        aria-label="Close"
      >×</button>

      {/* Position counter */}
      {counterText && (
        <div className="absolute top-5 left-5 text-white/40 text-xs font-bold uppercase tracking-widest z-10">
          {counterText}
        </div>
      )}

      {/* Left/right arrows */}
      {canPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          aria-label="Previous"
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 text-white text-2xl flex items-center justify-center transition-colors"
        >‹</button>
      )}
      {canNext && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext() }}
          aria-label="Next"
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 text-white text-2xl flex items-center justify-center transition-colors"
        >›</button>
      )}

      {/* Flashcard — Document-ID layout */}
      <div
        className="bg-[#FFFDFA] rounded-3xl shadow-2xl flex flex-col w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Doc-ID header strip with source + score chips */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#333333] text-[#FFFDFA]">
          <p className="text-[10px] font-bold uppercase tracking-widest">AI Central · Member</p>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
            {person.source && (
              <span className="px-2 py-0.5 rounded bg-[#FFFDFA]/15">{person.source}</span>
            )}
            {typeof person.score === 'number' && (
              <span className="px-2 py-0.5 rounded bg-[#E48715]">Score {person.score}</span>
            )}
          </div>
        </div>

        {/* Photo */}
        <div className="flex justify-center bg-[#FEF7E7] py-8">
          {person.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.photoUrl}
              alt={person.name || person.email || 'Profile'}
              referrerPolicy="no-referrer"
              className="w-56 h-56 rounded-2xl object-cover bg-[#F5F5F5] border-2 border-[#333333]"
            />
          ) : (
            <div className="w-56 h-56 rounded-2xl bg-[#F5F5F5] border-2 border-[#333333] flex items-center justify-center text-7xl font-black text-[#9C9C9C]">
              {initial}
            </div>
          )}
        </div>

        {/* Identity block */}
        <div className="px-6 py-5">
          <p className="text-2xl font-black text-[#333333] leading-tight">{person.name || '—'}</p>
          {(person.title || person.company) && (
            <p className="text-sm text-[#9C9C9C] mt-1">
              {person.title}
              {person.title && person.company && <span className="text-[#E8E4DF] mx-1">@</span>}
              {person.company}
            </p>
          )}
          {(person.city || person.country) && (
            <p className="text-xs text-[#9C9C9C] mt-2">
              📍 {[person.city, person.country].filter(Boolean).join(', ')}
            </p>
          )}

          {/* Demographic row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {(person.ageBracket || person.ageAiEstimate) && (
              <Chip>Age · {person.ageBracket || person.ageAiEstimate}{!person.ageBracket && ' ✨'}</Chip>
            )}
            {person.sexAiEstimate && <Chip>{person.sexAiEstimate} ✨</Chip>}
            {person.companyIndustry && <Chip>{person.companyIndustry}</Chip>}
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-[#E8E4DF] px-6 py-3 flex items-center justify-between gap-2 bg-[#FFFDFA]">
          <p className="text-[11px] text-[#9C9C9C] truncate flex-1">{person.email || '—'}</p>
          {person.linkedinUrl && (
            <a
              href={person.linkedinUrl}
              target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 bg-[#046BB1] text-white text-xs font-bold rounded-md hover:opacity-90 shrink-0"
            >LinkedIn ↗</a>
          )}
          {person.id && (
            <a
              href={`/admin/submissions/${person.id}`}
              className="px-3 py-1.5 bg-[#333333] text-[#FFFDFA] text-xs font-bold rounded-md hover:opacity-90 shrink-0"
            >Open</a>
          )}
        </div>

        {/* Keyboard hint */}
        {allPeople.length > 1 && (
          <div className="px-6 pb-3 -mt-1 text-center">
            <p className="text-[10px] text-[#9C9C9C]">← → to flip through cards · esc to close</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#F5F5F5] text-[#333333]">
      {children}
    </span>
  )
}

// Photo cell + initials fallback — used in the table.
export function PhotoCell({
  person, size = 36, onOpen,
}: {
  person: { name?: string; email?: string; photoUrl?: string; title?: string; company?: string; linkedinUrl?: string }
  size?: number
  onOpen: (p: { name?: string; email?: string; photoUrl?: string; title?: string; company?: string; linkedinUrl?: string }) => void
}) {
  const [errored, setErrored] = useState(false)
  const showImg = person.photoUrl && !errored
  const initial = (person.name || person.email || '?').slice(0, 1).toUpperCase()
  // Trigger lifecycle ref retained for SSR compatibility
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onOpen(person) }}
      className="block rounded-full overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-[#046BB1] transition-all"
      style={{ width: size, height: size }}
      title="View card"
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
