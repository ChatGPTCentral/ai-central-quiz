'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { StoredSubmission } from '@/lib/kv'
import { stageDef, personaDef } from '@/lib/segmentation-v2'

// ── Attio-grade dense people table (design "Admin section redesign" 1a) ──
// Renders the real submissions rows: saved-view tab, active-filter chips,
// dense grid with inline avatars + stage/persona chips, row → detail,
// and a floating bulk-action bar on selection.

const BORDER = '#E8E4DF'
const MUTE = '#9C9C9C'

const GRID = '34px minmax(220px,1.6fr) 128px 120px minmax(150px,1fr) minmax(130px,1fr) 92px 104px 96px'

function initials(name?: string | null, email?: string | null): string {
  const n = (name || '').trim()
  if (n) return n.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (email || '?')[0]!.toUpperCase()
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ fontSize: 11.5, color: '#1A1A1A' }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

export default function PeopleTableAttio({ items, total }: { items: StoredSubmission[]; total: number }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allSelected = items.length > 0 && selected.size === items.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(i => i.id)))
  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // Active-filter chips derived from the URL (read-only view of the filters
  // the AdvancedFilter set); the × removes that param and reloads.
  const chips = useMemo(() => {
    const out: { key: string; label: string; value: string }[] = []
    const labelFor: Record<string, string> = {
      stage: 'Stage', persona: 'Persona', seniority: 'Seniority', industry: 'Industry',
      country: 'Country', source: 'Source', companySize: 'Company size', beehiivStatus: 'Newsletter',
      enrichmentStatus: 'Enrichment', sexAiEstimate: 'Sex', age: 'Age', q: 'Search', sample: 'Sample',
    }
    sp.forEach((value, key) => {
      if (key === 'offset' || !value) return
      out.push({ key, label: labelFor[key] || key, value })
    })
    return out
  }, [sp])

  const removeChip = (key: string) => {
    const u = new URLSearchParams(sp.toString())
    u.delete(key); u.delete('offset')
    router.push(`/admin/submissions?${u.toString()}`)
  }

  const exportHref = (() => {
    const u = new URLSearchParams(sp.toString()); u.delete('offset')
    return `/api/admin/export.csv?${u.toString()}`
  })()

  const HeadCell = ({ children, first = false }: { children?: React.ReactNode; first?: boolean }) => (
    <span style={{ padding: '0 12px', fontSize: 11.5, fontWeight: 600, color: '#7d7d7d', borderLeft: first ? 'none' : `1px solid #F0ECE5`, display: 'flex', alignItems: 'center' }}>{children}</span>
  )

  return (
    <div className="relative">
      {/* Saved-view tabs */}
      <div className="flex items-center gap-5" style={{ borderBottom: `1px solid ${BORDER}`, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', padding: '0 0 9px', borderBottom: '2px solid #1A1A1A', marginBottom: -1 }}>All people</span>
        <span className="ml-auto" style={{ fontSize: 12, color: MUTE, paddingBottom: 9 }}>{total.toLocaleString()} results</span>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
          {chips.map(c => (
            <span key={c.key} className="inline-flex items-center gap-1.5" style={{ height: 28, padding: '0 9px', borderRadius: 4, border: `1px solid ${BORDER}`, background: '#FAF7F1', fontSize: 12, color: '#4A4A4A' }}>
              <span style={{ fontWeight: 600, color: '#1A1A1A' }}>{c.label}</span>
              <span>{c.value}</span>
              <button onClick={() => removeChip(c.key)} aria-label={`Remove ${c.label}`} style={{ color: MUTE, display: 'inline-flex' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', background: '#FFFFFF' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID, height: 34, borderBottom: `1px solid ${BORDER}`, background: '#FFFDFA', alignItems: 'center' }}>
          <span className="flex justify-center"><input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 13, height: 13, accentColor: '#1A1A1A' }} /></span>
          <HeadCell first>Person</HeadCell>
          <HeadCell>Stage</HeadCell>
          <HeadCell>Persona</HeadCell>
          <HeadCell>Company</HeadCell>
          <HeadCell>Title</HeadCell>
          <HeadCell>LTV</HeadCell>
          <HeadCell>Newsletter</HeadCell>
          <HeadCell>Enriched</HeadCell>
        </div>

        {/* Rows */}
        {items.map(r => {
          const sd = r.stage ? stageDef(r.stage) : null
          const pd = r.persona ? personaDef(r.persona) : null
          const isSel = selected.has(r.id)
          const enriched = r.enrichmentStatus === 'complete' || r.enrichmentStatus === 'partial' || !!r.jobTitle || !!r.companyName
          return (
            <div
              key={r.id}
              onClick={() => router.push(`/admin/submissions/${r.id}`)}
              style={{ display: 'grid', gridTemplateColumns: GRID, minHeight: 44, borderBottom: `1px solid #F4F0E9`, alignItems: 'center', cursor: 'pointer', background: isSel ? '#FBF8F2' : '#FFFFFF' }}
              className="hover:bg-[#FBF9F4]"
            >
              <span className="flex justify-center" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} style={{ width: 13, height: 13, accentColor: '#1A1A1A' }} />
              </span>
              {/* Person */}
              <span style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span className="flex items-center justify-center shrink-0" style={{ width: 26, height: 26, borderRadius: '50%', background: '#EDE8DF', color: '#6B6B6B', fontSize: 10, fontWeight: 700 }}>
                  {initials(r.name, r.email)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate" style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A' }}>{r.name || '(no name)'}</span>
                  <span className="block truncate" style={{ fontSize: 11, color: MUTE }}>{r.email}</span>
                </span>
              </span>
              {/* Stage */}
              <span style={{ padding: '0 12px' }}>{sd && sd.key !== 'unknown' ? <Chip label={sd.label} color={sd.color} /> : <span style={{ color: '#C4BDB2', fontSize: 12 }}>—</span>}</span>
              {/* Persona */}
              <span style={{ padding: '0 12px' }}>{pd && pd.key !== 'unknown' ? <Chip label={pd.label} color={pd.color} /> : <span style={{ color: '#C4BDB2', fontSize: 12 }}>—</span>}</span>
              {/* Company */}
              <span className="truncate" style={{ padding: '0 12px', fontSize: 12.5, color: r.companyName ? '#333' : '#C4BDB2' }}>{r.companyName || '—'}</span>
              {/* Title */}
              <span className="truncate" style={{ padding: '0 12px', fontSize: 12.5, color: r.jobTitle ? '#333' : '#C4BDB2' }}>{r.jobTitle || '—'}</span>
              {/* LTV */}
              <span style={{ padding: '0 12px', fontSize: 12.5, fontWeight: (r.lifetimeValueUsd ?? 0) > 0 ? 700 : 400, color: (r.lifetimeValueUsd ?? 0) > 0 ? '#2E7D32' : '#C4BDB2', fontVariantNumeric: 'tabular-nums' }}>
                {(r.lifetimeValueUsd ?? 0) > 0 ? `$${Math.round(r.lifetimeValueUsd!).toLocaleString()}` : '—'}
              </span>
              {/* Newsletter */}
              <span style={{ padding: '0 12px', fontSize: 11.5, color: r.beehiivStatus === 'active' ? '#2E7D32' : MUTE }}>{r.beehiivStatus || '—'}</span>
              {/* Enriched */}
              <span style={{ padding: '0 12px', fontSize: 12.5 }}>{enriched ? <span style={{ color: '#2E7D32' }}>✓</span> : <span style={{ color: '#C4BDB2' }}>—</span>}</span>
            </div>
          )
        })}
        {items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: MUTE, fontSize: 13 }}>No people match these filters.</div>
        )}
      </div>

      {/* Bulk-action bar */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#1A1A1A', borderRadius: 6, boxShadow: '0 3px 12px rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', gap: 2, padding: '6px 8px', color: '#FFFDFA', zIndex: 60 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, padding: '0 10px' }}>{selected.size} selected</span>
          <span style={{ width: 1, height: 16, background: 'rgba(255,253,250,0.2)' }} />
          <a href="/admin/lab" style={{ height: 26, padding: '0 10px', borderRadius: 4, color: '#FFFDFA', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }} className="hover:bg-white/10">✦ Enrich</a>
          <a href={exportHref} style={{ height: 26, padding: '0 10px', borderRadius: 4, color: '#FFFDFA', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }} className="hover:bg-white/10">Export CSV</a>
          <button onClick={() => setSelected(new Set())} aria-label="Clear selection" style={{ color: '#FFFDFA', padding: '4px 6px' }} className="hover:bg-white/10 rounded">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}
