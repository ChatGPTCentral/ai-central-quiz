// Bottom-of-detail-page expandable raw-data section. One collapsible card
// per enrichment provider so it's easy to see exactly what each one
// contributed without scrolling through one giant JSON blob.

interface Props {
  enrichmentRaw?: Record<string, unknown>
}

interface ProviderCard {
  key: string
  label: string
  icon: string
  description: string
  data: unknown
}

export default function RawDataSection({ enrichmentRaw }: Props) {
  // The v2 pipeline stores per-provider raw payloads under enrichment_raw.v2
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v2 = (enrichmentRaw as any)?.v2 || {}

  const cards: ProviderCard[] = [
    { key: 'apify_profile', label: 'Apify (LinkedIn scrape)', icon: '🔗',
      description: 'Headline, current company, title, location, photo URL, full work history',
      data: v2.apify_profile },
    { key: 'apollo',        label: 'Apollo',                 icon: '🚀',
      description: 'B2B firmographics — company size, industry, domain, work email',
      data: v2.apollo },
    { key: 'beehiiv',       label: 'Beehiiv',                icon: '📧',
      description: 'Newsletter subscription tier, status, utm_source on signup',
      data: v2.beehiiv },
    { key: 'stripe',        label: 'Stripe',                 icon: '💳',
      description: 'Customer ID, lifetime $ paid (sum of successful charges)',
      data: v2.stripe },
    { key: 'claude_vision', label: 'Claude vision',          icon: '✨',
      description: 'Age bracket + sex presentation estimated from the photo',
      data: v2.claude_vision },
    { key: 'wiza',          label: 'Wiza',                   icon: '🔍',
      description: 'Email-only reverse lookup — sometimes finds extras Apollo misses',
      data: v2.wiza },
  ]

  return (
    <section className="mt-8 mb-6">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#9C9C9C] mb-3">
        Raw provider data
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {cards.map(c => (
          <details
            key={c.key}
            className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden group"
          >
            <summary className="cursor-pointer flex items-center gap-3 px-4 py-3 hover:bg-[#FFFDFA] select-none">
              <span className="text-lg">{c.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#333333]">{c.label}</div>
                <div className="text-[11px] text-[#9C9C9C] truncate">{c.description}</div>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                c.data ? 'bg-[#62A758]/15 text-[#2D6A26] border border-[#62A758]/40' :
                'bg-[#F5F5F5] text-[#9C9C9C] border border-[#E8E4DF]'
              }`}>
                {c.data ? '✓ has data' : '— no data'}
              </span>
            </summary>
            {c.data ? (
              <pre className="text-[11px] bg-[#FFFDFA] border-t border-[#E8E4DF] p-3 overflow-auto max-h-[480px] leading-relaxed">
                {JSON.stringify(c.data, null, 2)}
              </pre>
            ) : (
              <p className="text-[11px] text-[#9C9C9C] px-4 py-3 border-t border-[#E8E4DF] italic">
                This provider hasn&apos;t returned anything for this row. Run ✨ Enrich to attempt.
              </p>
            )}
          </details>
        ))}
      </div>
    </section>
  )
}
