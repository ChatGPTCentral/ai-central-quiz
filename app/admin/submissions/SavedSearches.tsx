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
  const onlyArchived = searchParams.onlyArchived === '1'
  const stripeOnly  = (searchParams.source || '') === 'stripe'

  function hrefFor(key: Key | 'all') {
    const sp = new URLSearchParams(searchParams as Record<string, string>)
    sp.delete('offset')
    if (key === 'all') {
      sp.delete('missing')
    } else {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      if (next.size === 0) sp.delete('missing')
      else sp.set('missing', Array.from(next).join(','))
    }
    return `/admin/submissions?${sp.toString()}`
  }

  function archiveHref() {
    const sp = new URLSearchParams(searchParams as Record<string, string>)
    sp.delete('offset')
    if (onlyArchived) sp.delete('onlyArchived')
    else sp.set('onlyArchived', '1')
    return `/admin/submissions?${sp.toString()}`
  }
  function stripeOnlyHref() {
    const sp = new URLSearchParams(searchParams as Record<string, string>)
    sp.delete('offset')
    if (stripeOnly) sp.delete('source')
    else sp.set('source', 'stripe')
    return `/admin/submissions?${sp.toString()}`
  }

  const noneActive = current.size === 0 && !onlyArchived && !stripeOnly

  // Redesign 2c: hard-edge saved-filter chips (white, warm border, latte +
  // fulvous on hover; active = latte with fulvous border). Radius 0.
  const chipBase: React.CSSProperties = { padding: '4px 11px', fontSize: 11.5, fontWeight: 600, color: '#1A1A1A' }
  return (
    <section className="mb-4">
      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C' }}>Saved filters</span>
        <Link
          href={hrefFor('all')}
          style={{ ...chipBase, border: '1px solid #333333', background: noneActive ? '#333333' : '#FFFFFF', color: noneActive ? '#FFFDFA' : '#1A1A1A', fontWeight: 700 }}
        >
          All
        </Link>
        {CHIPS.map(c => {
          const active = current.has(c.key)
          return (
            <Link
              key={c.key}
              href={hrefFor(c.key)}
              className="hover:bg-[#FEF7E7] hover:border-[#E48715]"
              style={{ ...chipBase, border: `1px solid ${active ? '#E48715' : '#C9C2B4'}`, background: active ? '#FEF7E7' : '#FFFFFF', color: active ? '#B26A00' : '#1A1A1A' }}
              title={active ? `Remove '${c.label}' filter` : `Show only rows with '${c.label}'`}
            >
              {c.emoji} {c.label}
            </Link>
          )
        })}
        <Link
          href={stripeOnlyHref()}
          className="hover:bg-[#FEF7E7] hover:border-[#E48715]"
          style={{ ...chipBase, border: `1px solid ${stripeOnly ? '#62A758' : '#C9C2B4'}`, background: stripeOnly ? '#FFFFFF' : '#FFFFFF', color: stripeOnly ? '#2D6A26' : '#1A1A1A' }}
          title={stripeOnly ? 'Showing only Stripe-imported rows' : 'Show only Stripe customers'}
        >
          💳 {stripeOnly ? 'Stripe only' : 'Stripe customers'}
        </Link>
        <Link
          href={archiveHref()}
          className="ml-auto hover:bg-[#FEF7E7]"
          style={{ ...chipBase, border: `1px solid ${onlyArchived ? '#333333' : '#C9C2B4'}`, background: onlyArchived ? '#333333' : '#FFFFFF', color: onlyArchived ? '#FFFDFA' : '#6B6B6B' }}
          title={onlyArchived ? 'Showing only archived rows, click to exit' : 'Browse archived rows'}
        >
          🗄️ {onlyArchived ? 'Showing archive' : 'Archive'}
        </Link>
      </div>
    </section>
  )
}
