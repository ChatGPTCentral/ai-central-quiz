'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface IdCardPerson {
  id: string
  name?: string
  email?: string
  photoUrl?: string
  jobTitle?: string
  jobTitleStandardized?: string
  companyName?: string
  companyIndustry?: string
  companyLinkedinUrl?: string
  linkedinUrl?: string
  country?: string
  city?: string
  region?: string
  ageBracket?: string
  ageAiEstimate?: string
  sexAiEstimate?: string
  seniority?: string
  source?: string
  score?: number
  archetype?: string | null
}

interface Props {
  person: IdCardPerson
  /** Optional click handler — e.g. open the photo lightbox / cinema mode. */
  onPhotoClick?: (id: string) => void
  /** Compact mode shrinks padding (used in dense masonry grids). */
  compact?: boolean
}

/**
 * Document-ID-style profile card. Reused by:
 *   1. The cinema-mode lightbox on the submissions table
 *   2. The masonry "Cards" view on /admin/submissions
 *
 * Carries its own ✨ Enrich button (always force-mode) so users can run
 * enrichment without leaving the card.
 */
export default function IdCard({ person, onPhotoClick, compact = false }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [enrichStatus, setEnrichStatus] = useState<'idle' | 'ok' | 'partial' | 'fail'>('idle')
  const initial = (person.name || person.email || '?').slice(0, 1).toUpperCase()

  async function enrich() {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/enrich/v2/row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: person.id, save: true, force: true }),
      })
      const data = await res.json()
      if (!res.ok) { setEnrichStatus('fail'); return }
      setEnrichStatus(data.status === 'complete' ? 'ok' : data.status === 'partial' ? 'partial' : 'fail')
      router.refresh()
    } catch {
      setEnrichStatus('fail')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-[#FFFDFA] rounded-2xl border border-[#E8E4DF] overflow-hidden shadow-sm break-inside-avoid mb-4">
      {/* Doc-ID header strip */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#333333] text-[#FFFDFA]">
        <p className="text-[9px] font-bold uppercase tracking-widest">AI Central · Member</p>
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest">
          {person.source && (
            <span className="px-1.5 py-0.5 rounded bg-[#FFFDFA]/15">{person.source}</span>
          )}
          {typeof person.score === 'number' && (
            <span className="px-1.5 py-0.5 rounded bg-[#E48715]">{person.score}</span>
          )}
        </div>
      </div>

      {/* Photo */}
      <button
        onClick={() => onPhotoClick?.(person.id)}
        type="button"
        className="flex justify-center items-center bg-[#FEF7E7] w-full hover:bg-[#FAEFC8] transition-colors"
        style={{ paddingTop: compact ? '20px' : '28px', paddingBottom: compact ? '20px' : '28px' }}
      >
        {person.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.photoUrl}
            alt={person.name || person.email || ''}
            referrerPolicy="no-referrer"
            className={`rounded-xl object-cover border-2 border-[#333333] ${compact ? 'w-32 h-32' : 'w-40 h-40'}`}
          />
        ) : (
          <div className={`rounded-xl bg-[#F5F5F5] border-2 border-[#333333] flex items-center justify-center font-black text-[#9C9C9C] ${compact ? 'w-32 h-32 text-5xl' : 'w-40 h-40 text-6xl'}`}>
            {initial}
          </div>
        )}
      </button>

      {/* Identity block */}
      <div className={`px-4 ${compact ? 'py-3' : 'py-4'}`}>
        <Link href={`/admin/submissions/${person.id}`} className="block hover:underline">
          <p className={`font-black text-[#333333] leading-tight truncate ${compact ? 'text-base' : 'text-lg'}`}>
            {person.name || '—'}
          </p>
        </Link>

        {(person.jobTitle || person.companyName) && (
          <p className="text-xs text-[#9C9C9C] mt-1 leading-snug">
            {person.jobTitle}
            {person.jobTitle && person.companyName && <span className="text-[#E8E4DF] mx-1">@</span>}
            {person.companyName}
          </p>
        )}

        {person.jobTitleStandardized && (
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#E48715] mt-1.5">
            ✨ {person.jobTitleStandardized}
          </p>
        )}

        {(person.city || person.country) && (
          <p className="text-[11px] text-[#9C9C9C] mt-1.5">
            📍 {[person.city, person.region, person.country].filter(Boolean).join(', ')}
          </p>
        )}

        {/* Chips row */}
        <div className="flex flex-wrap items-center gap-1 mt-2">
          {(person.ageBracket || person.ageAiEstimate) && (
            <Chip>{person.ageBracket || person.ageAiEstimate}{!person.ageBracket && person.ageAiEstimate && ' ✨'}</Chip>
          )}
          {person.sexAiEstimate && <Chip>{person.sexAiEstimate} ✨</Chip>}
          {person.seniority && <Chip>{person.seniority}</Chip>}
          {person.companyIndustry && <Chip>{person.companyIndustry}</Chip>}
        </div>
      </div>

      {/* Action footer */}
      <div className="border-t border-[#E8E4DF] px-3 py-2 flex items-center gap-1.5">
        <button
          onClick={enrich}
          disabled={busy}
          title="Force-run the full enrichment pipeline"
          className={`flex-1 h-7 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
            busy ? 'bg-[#F5F5F5] text-[#9C9C9C]' :
            enrichStatus === 'ok' ? 'bg-[#62A758] text-white' :
            enrichStatus === 'partial' ? 'bg-[#E7B02F] text-[#333333]' :
            enrichStatus === 'fail' ? 'bg-[#BE3B3B] text-white' :
            'bg-[#333333] text-[#FFFDFA] hover:opacity-90'
          }`}
        >
          {busy ? 'Enriching…' : '✨ Enrich'}
        </button>
        {person.linkedinUrl && (
          <a
            href={person.linkedinUrl}
            target="_blank" rel="noopener noreferrer"
            title={person.linkedinUrl}
            className="h-7 px-2 inline-flex items-center justify-center rounded-md bg-[#046BB1] text-white text-[10px] font-bold hover:opacity-90"
          >in</a>
        )}
        <Link
          href={`/admin/submissions/${person.id}`}
          className="h-7 px-2 inline-flex items-center justify-center rounded-md bg-white border border-[#E8E4DF] text-[#333333] text-[10px] font-bold uppercase tracking-wider hover:bg-[#FFFDFA]"
        >Open</Link>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#F5F5F5] text-[#333333]">
      {children}
    </span>
  )
}
