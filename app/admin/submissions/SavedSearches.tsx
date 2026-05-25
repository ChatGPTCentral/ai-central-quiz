import Link from 'next/link'

/**
 * Saved-search chips at the top of the submissions table.
 * Each chip toggles a `missing=<field>` filter on the URL — multi-select via
 * comma-joined values (?missing=linkedin,sex,age).
 *
 * Rendered server-side so it doesn't pull JS into the page just for nav.
 */

type Key = 'enrichment' | 'linkedin' | 'photo' | 'sex' | 'age' | 'company' | 'country' | 'industry' | 'beehiiv' | 'stripe'

const CHIPS: { key: Key; label: string; emoji: string }[] = [
  { key: 'enrichment', label: 'Not enriched',  emoji: '✨' },
  { key: 'linkedin',   label: 'No LinkedIn',   emoji: '🔗' },
  { key: 'photo',      label: 'No photo',      emoji: '🖼️' },
  { key: 'sex',        label: 'No sex',        emoji: '🚻' },
  { key: 'age',        label: 'No age',        emoji: '🎂' },
  { key: 'company',    label: 'No company',    emoji: '🏢' },
  { key: 'country',    label: 'No country',    emoji: '🌍' },
  { key: 'industry',   label: 'No industry',   emoji: '🏭' },
  { key: 'beehiiv',    label: 'Not in Beehiiv', emoji: '📧' },
  { key: 'stripe',     label: 'No Stripe',     emoji: '💳' },
]

export default function SavedSearches({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const current = new Set((searchParams.missing || '').split(',').map(s => s.trim()).filter(Boolean))

  function hrefFor(key: Key | 'all') {
    const sp = new URLSearchParams(searchParams as Record<string, string>)
    sp.delete('offset')
    if (key === 'all') {
      sp.delete('missing')
    } else {
      // Toggle this key in the missing list
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      if (next.size === 0) sp.delete('missing')
      else sp.set('missing', Array.from(next).join(','))
    }
    return `/admin/submissions?${sp.toString()}`
  }

  const noneActive = current.size === 0

  return (
    <section className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9C9C9C] mb-2">
        Broken-record filters
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={hrefFor('all')}
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
            noneActive
              ? 'bg-[#333333] text-[#FFFDFA]'
              : 'bg-[#F5F5F5] text-[#9C9C9C] hover:bg-[#E8E4DF]'
          }`}
        >
          All
        </Link>
        {CHIPS.map(c => {
          const active = current.has(c.key)
          return (
            <Link
              key={c.key}
              href={hrefFor(c.key)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                active
                  ? 'bg-[#BE3B3B] text-[#FFFDFA]'
                  : 'bg-white border border-[#E8E4DF] text-[#333333] hover:bg-[#FEF7E7] hover:border-[#E48715]'
              }`}
              title={active ? `Remove '${c.label}' filter` : `Show only rows with '${c.label}'`}
            >
              <span className="text-[12px]">{c.emoji}</span>
              {c.label}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
