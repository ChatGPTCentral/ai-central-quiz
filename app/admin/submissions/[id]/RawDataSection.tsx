'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Bottom-of-detail-page expandable raw-data section. One collapsible card
// per enrichment provider so it's easy to see exactly what each one
// contributed, plus a ↻ trigger to re-run that single provider.

interface Props {
  rowId: string
  enrichmentRaw?: Record<string, unknown>
}

interface ProviderCard {
  key: string
  label: string
  icon: string
  description: string
  data: unknown
  /** Field name to pass to /api/admin/enrich/v2/field for re-running */
  reRunField?: 'photo' | 'demographics' | 'beehiiv' | 'stripe' | 'apify' | 'apollo'
}

export default function RawDataSection({ rowId, enrichmentRaw }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v2 = (enrichmentRaw as any)?.v2 || {}

  const cards: ProviderCard[] = [
    { key: 'apify_profile', label: 'Apify (LinkedIn scrape)', icon: '🔗', reRunField: 'apify',
      description: 'Headline, current company, title, location, photo URL, full work history',
      data: v2.apify_profile },
    { key: 'apollo',        label: 'Apollo',                 icon: '🚀', reRunField: 'apollo',
      description: 'B2B firmographics — company size, industry, domain, work email',
      data: v2.apollo },
    { key: 'beehiiv',       label: 'Beehiiv',                icon: '📧', reRunField: 'beehiiv',
      description: 'Newsletter subscription tier, status, utm_source on signup',
      data: v2.beehiiv },
    { key: 'stripe',        label: 'Stripe',                 icon: '💳', reRunField: 'stripe',
      description: 'Customer ID, lifetime $ paid (sum of successful charges)',
      data: v2.stripe },
    { key: 'claude_vision', label: 'Claude vision',          icon: '✨', reRunField: 'demographics',
      description: 'Age bracket + sex presentation estimated from the photo',
      data: v2.claude_vision },
  ]

  return (
    <section className="mt-8 mb-6">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#9C9C9C] mb-3">
        Raw provider data
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {cards.map(c => (
          <ProviderCardBlock key={c.key} rowId={rowId} card={c} />
        ))}
      </div>
    </section>
  )
}

function ProviderCardBlock({ rowId, card }: { rowId: string; card: ProviderCard }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function reRun(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (!card.reRunField) return
    setBusy(true); setMsg('')
    try {
      const res = await fetch('/api/admin/enrich/v2/field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowId, fields: [card.reRunField] }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(`✕ ${data.error || 'failed'}`); return }
      if (data.updated?.length) {
        setMsg(`✓ ${data.updated.length} field${data.updated.length === 1 ? '' : 's'} updated`)
        router.refresh()
      } else {
        const reason = data.skipped?.[0]?.reason || 'no data returned'
        setMsg(`— ${reason}`)
      }
      setTimeout(() => setMsg(''), 8000)
    } catch (err) {
      setMsg(`✕ ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
      <summary className="cursor-pointer flex items-center gap-3 px-4 py-3 hover:bg-[#FFFDFA] select-none">
        <span className="text-lg">{card.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[#333333]">{card.label}</div>
          <div className="text-[11px] text-[#9C9C9C] truncate">{card.description}</div>
        </div>
        {msg && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
            msg.startsWith('✓') ? 'text-[#2D6A26]' :
            msg.startsWith('✕') ? 'text-[#8A1F1F]' :
            'text-[#9C9C9C]'
          }`}>{msg}</span>
        )}
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
          card.data ? 'bg-[#62A758]/15 text-[#2D6A26] border border-[#62A758]/40' :
          'bg-[#F5F5F5] text-[#9C9C9C] border border-[#E8E4DF]'
        }`}>
          {card.data ? '✓ has data' : '— no data'}
        </span>
        {card.reRunField && (
          <button
            onClick={reRun}
            disabled={busy}
            title={`Re-run ${card.label} for this row`}
            className="inline-flex items-center h-6 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#FEF7E7] text-[#E48715] border border-[#E48715]/40 hover:bg-[#E48715] hover:text-white disabled:opacity-40"
          >
            {busy ? '…' : '↻ Re-run'}
          </button>
        )}
      </summary>
      {card.data ? (
        <pre className="text-[11px] bg-[#FFFDFA] border-t border-[#E8E4DF] p-3 overflow-auto max-h-[480px] leading-relaxed">
          {JSON.stringify(card.data, null, 2)}
        </pre>
      ) : (
        <p className="text-[11px] text-[#9C9C9C] px-4 py-3 border-t border-[#E8E4DF] italic">
          This provider hasn&apos;t returned anything for this row. Click ↻ Re-run to try it.
        </p>
      )}
    </details>
  )
}
