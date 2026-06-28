'use client'

import { useEffect, useRef, useState } from 'react'
import type { NotionDoc } from '@/lib/notion'

interface Props {
  /** Server-rendered initial suggestions (persona/stage matched). */
  initialDocs: NotionDoc[]
  /** Where each doc card links — the Stripe checkout (docs are gated). */
  paymentUrl: string
  accent?: string
}

export function DocSearch({ initialDocs, paymentUrl, accent = '#E48715' }: Props) {
  const [query, setQuery] = useState('')
  const [docs, setDocs] = useState<NotionDoc[]>(initialDocs)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    const q = query.trim()
    if (q === '') { setDocs(initialDocs); setLoading(false); return }
    setLoading(true)
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/docs/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setDocs(Array.isArray(data.docs) ? data.docs : [])
      } catch {
        setDocs([])
      } finally {
        setLoading(false)
      }
    }, 280)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query, initialDocs])

  return (
    <div className="w-full">
      {/* Dynamic-island neon search bar */}
      <div
        className="relative mx-auto transition-all duration-300"
        style={{
          maxWidth: focused ? 560 : 520,
        }}
      >
        <div
          className="flex items-center gap-3 rounded-full px-5 py-3.5 bg-[#1a1a1a] transition-all duration-300"
          style={{
            boxShadow: focused
              ? `0 0 0 1.5px ${accent}, 0 0 28px ${accent}66, 0 8px 30px rgba(0,0,0,0.35)`
              : `0 0 0 1px ${accent}55, 0 0 16px ${accent}33, 0 6px 20px rgba(0,0,0,0.25)`,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search the AI Central library…"
            className="flex-1 bg-transparent text-white text-[15px] placeholder-gray-500 outline-none"
          />
          {loading && (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="mt-5 flex flex-col gap-2.5 max-w-[560px] mx-auto">
        {docs.length === 0 && !loading && (
          <p className="text-center text-[13px] text-[#9C9C9C] py-4">
            {query.trim() ? 'No matches. Try another search.' : 'Start typing to search the library.'}
          </p>
        )}
        {docs.map(doc => (
          <a
            key={doc.id}
            href={paymentUrl}
            className="group flex items-start gap-3 rounded-xl border border-[#E8E4DF] bg-white px-4 py-3 transition-all hover:border-[color:var(--ds-accent)] hover:shadow-sm"
            style={{ ['--ds-accent' as string]: accent }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-[#333333] leading-snug">{doc.title}</div>
              {doc.summary && <div className="text-[12px] text-[#9C9C9C] mt-0.5 line-clamp-2">{doc.summary}</div>}
              {doc.tags.length > 0 && (
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {doc.tags.slice(0, 3).map(t => (
                    <span key={t} className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${accent}18`, color: accent }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
            <span className="shrink-0 self-center text-[11px] font-bold uppercase tracking-wider transition-colors" style={{ color: accent }}>
              Unlock →
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
