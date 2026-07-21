'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { StoredSubmission } from '@/lib/kv'
import { personResultPath } from '@/lib/result-url'
import { stageDef } from '@/lib/segmentation-v2'
import { encodeSpec } from '@/lib/advanced-filter'
import { countryFlag } from '@/lib/country-flags'
import Avatar from '@/components/admin/Avatar.client'

// ── People table (redesign 2c) ───────────────────────────────────────
// Hard-edge records table: view tabs, ladder-mix strip (click a rung to
// filter), column chooser popover (persisted), active-filter chips, dense
// grid with avatars + square stage dots, row → detail, floating bulk bar
// with Enrich / Export / Archive. Name and email are separate columns;
// country carries an emoji flag.

const MUTE = '#9C9C9C'
const INK = '#1A1A1A'
const LATTE = '#FEF7E7'
const ROWHAIR = '#F1ECE2'

const COLS_KEY = 'admin_people_cols_v4'

interface ColDef { key: string; label: string; width: string; defaultOn: boolean }
const COLS: ColDef[] = [
  { key: 'name', label: 'Name', width: 'minmax(180px,1.3fr)', defaultOn: true },
  { key: 'email', label: 'Email', width: 'minmax(200px,1.5fr)', defaultOn: true },
  { key: 'stage', label: 'Stage', width: '148px', defaultOn: true },
  { key: 'country', label: 'Country', width: '132px', defaultOn: true },
  { key: 'company', label: 'Company', width: 'minmax(150px,1.2fr)', defaultOn: true },
  { key: 'title', label: 'Title', width: 'minmax(140px,1.1fr)', defaultOn: true },
  { key: 'ltv', label: 'LTV', width: '88px', defaultOn: true },
  { key: 'newsletter', label: 'Newsletter', width: '96px', defaultOn: true },
  { key: 'enriched', label: 'Enriched', width: '78px', defaultOn: true },
  { key: 'linkedin', label: 'LinkedIn', width: '78px', defaultOn: true },
  { key: 'verified', label: 'Verified', width: '78px', defaultOn: false },
  { key: 'city', label: 'City (IP)', width: '110px', defaultOn: false },
  { key: 'source', label: 'Source', width: '110px', defaultOn: false },
  { key: 'score', label: 'Score', width: '64px', defaultOn: false },
  { key: 'seniority', label: 'Seniority', width: '110px', defaultOn: false },
  { key: 'industry', label: 'Industry', width: '130px', defaultOn: false },
  { key: 'size', label: 'Company size', width: '110px', defaultOn: false },
  { key: 'tier', label: 'Tier', width: '90px', defaultOn: false },
  { key: 'submitted', label: 'Submitted', width: '100px', defaultOn: false },
]

function DotChip({ label, color, bold }: { label: string; color: string; bold?: boolean }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap" style={{ gap: 7, fontSize: 11.5, fontWeight: bold ? 600 : 400, color: INK }}>
      <span style={{ width: 8, height: 8, background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

export default function PeopleTableAttio({
  items, total, offset = 0, pageSize = 100,
}: {
  items: StoredSubmission[]
  total: number
  offset?: number
  pageSize?: number
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [colsOpen, setColsOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)

  // Column visibility + order (drag ⠿ to reorder, spreadsheet-style), persisted.
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(COLS.map(c => [c.key, c.defaultOn])))
  const [order, setOrder] = useState<string[]>(() => COLS.map(c => c.key))
  const dragKey = useRef<string | null>(null)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { on?: Record<string, boolean>; order?: string[] }
        if (saved.on) setOn(prev => ({ ...prev, ...saved.on }))
        if (Array.isArray(saved.order)) {
          const known = saved.order.filter(k => COLS.some(c => c.key === k))
          const missing = COLS.map(c => c.key).filter(k => !known.includes(k))
          setOrder([...known, ...missing])
        }
      }
    } catch { /* defaults stand */ }
  }, [])
  const persist = (nextOn: Record<string, boolean>, nextOrder: string[]) => {
    try { localStorage.setItem(COLS_KEY, JSON.stringify({ on: nextOn, order: nextOrder })) } catch { /* non-fatal */ }
  }
  const toggleCol = (key: string) => setOn(prev => {
    const next = { ...prev, [key]: !prev[key] }
    if (!Object.values(next).some(Boolean)) return prev // never zero columns
    persist(next, order)
    return next
  })
  const dropOn = (targetKey: string) => {
    const from = dragKey.current
    dragKey.current = null
    if (!from || from === targetKey) return
    setOrder(prev => {
      const next = prev.filter(k => k !== from)
      next.splice(next.indexOf(targetKey), 0, from)
      persist(on, next)
      return next
    })
  }
  const ordered = order.map(k => COLS.find(c => c.key === k)!).filter(Boolean)
  const visible = ordered.filter(c => on[c.key])
  const grid = `38px ${visible.map(c => c.width).join(' ')}`
  // Sum each column's minimum (px, or the min side of a minmax) so the grid can
  // overflow-scroll horizontally instead of crushing columns when many are on.
  const minTableWidth = 38 + visible.reduce((sum, c) => {
    const m = c.width.match(/(\d+)px/)
    return sum + (m ? parseInt(m[1], 10) : 120)
  }, 0)

  useEffect(() => {
    if (!colsOpen) return
    const close = (e: MouseEvent) => { if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [colsOpen])

  const allSelected = items.length > 0 && selected.size === items.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(i => i.id)))
  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // ── View tabs → existing URL filter params ──
  const CUSTOMER_SPEC = useMemo(() => encodeSpec({ combinator: 'and', rules: [{ field: 'lifetimeValueUsd', op: 'gt', value: 0 }] }), [])
  const tabs = [
    { label: 'All people', href: '/admin/submissions', active: !sp.get('onlyArchived') && !sp.get('enrichmentStatus') && !(sp.get('stage') || '').includes('S4_power_user') && !sp.get('spec') },
    { label: 'Customers', href: `/admin/submissions?spec=${CUSTOMER_SPEC}`, active: !!sp.get('spec') },
    { label: 'Power users +', href: '/admin/submissions?stage=S4_power_user,S5_builder', active: (sp.get('stage') || '').includes('S4_power_user') },
    { label: 'Not enriched', href: '/admin/submissions?enrichmentStatus=failed', active: sp.get('enrichmentStatus') === 'failed' },
    { label: 'Archive', href: '/admin/submissions?onlyArchived=1', active: sp.get('onlyArchived') === '1' },
  ]

  // Active-filter chips derived from the URL.
  const chips = useMemo(() => {
    const out: { key: string; label: string; value: string }[] = []
    const labelFor: Record<string, string> = {
      stage: 'Stage', seniority: 'Seniority', industry: 'Industry',
      country: 'Country', source: 'Source', companySize: 'Company size', beehiivStatus: 'Newsletter',
      enrichmentStatus: 'Enrichment', sexAiEstimate: 'Sex', age: 'Age', q: 'Search', sample: 'Sample',
      onlyArchived: 'Archive', spec: 'Custom filter',
    }
    sp.forEach((value, key) => {
      if (key === 'offset' || !value) return
      out.push({ key, label: labelFor[key] || key, value: key === 'spec' ? 'active' : value })
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

  // Bulk archive: soft-archive each selected row via the existing DELETE.
  const bulkArchive = async () => {
    if (archiving || selected.size === 0) return
    if (!confirm(`Archive ${selected.size} selected ${selected.size === 1 ? 'person' : 'people'}? They move out of every default view (restorable).`)) return
    setArchiving(true)
    try {
      for (const id of Array.from(selected)) {
        await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' }).catch(() => {})
      }
      setSelected(new Set())
      router.refresh()
    } finally {
      setArchiving(false)
    }
  }

  // ── Pagination dents ──
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.floor(offset / pageSize) + 1
  const pageHref = (p: number) => {
    const u = new URLSearchParams(sp.toString())
    u.set('offset', String((p - 1) * pageSize))
    return `/admin/submissions?${u.toString()}`
  }
  const pageNums = (() => {
    const around = [current - 1, current, current + 1].filter(p => p >= 1 && p <= pageCount)
    const set = new Set([1, ...around, pageCount])
    return Array.from(set).sort((a, b) => a - b)
  })()

  const thStyle: React.CSSProperties = { padding: '0 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B6B6B', display: 'flex', alignItems: 'center' }

  return (
    <div className="relative">
      {/* View tabs + Columns button row */}
      <div className="flex items-center justify-between flex-wrap" style={{ margin: '14px 0', gap: 10 }}>
        <div className="inline-flex" style={{ border: '1px solid #333333' }}>
          {tabs.map((t, i) => (
            <a
              key={t.label}
              href={t.href}
              style={{
                padding: '8px 16px', fontSize: 12, fontWeight: 700,
                background: t.active ? '#333333' : 'transparent',
                color: t.active ? '#FFFDFA' : '#6B6B6B',
                borderRight: i < tabs.length - 1 ? '1px solid #333333' : 'none',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              {t.label}
              {t.active && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#E7B02F' }}>{total.toLocaleString()}</span>}
            </a>
          ))}
        </div>
        <div ref={colsRef} className="relative inline-block">
          <button
            onClick={() => setColsOpen(o => !o)}
            style={{ padding: '8px 15px', fontSize: 12, fontWeight: 700, border: '1px solid #333333', background: '#FFFDFA' }}
            className="hover:bg-[#FEF7E7]"
          >
            Columns · {visible.length}
          </button>
          {colsOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 230, background: '#FFFDFA', border: '1px solid #333333', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', zIndex: 50, textAlign: 'left' }}>
              <div style={{ padding: '9px 14px', background: LATTE, borderBottom: '1px solid #333333', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: INK }}>Table columns</div>
              <div style={{ padding: '8px 6px', maxHeight: 340, overflowY: 'auto' }}>
                {ordered.map(c => (
                  <label
                    key={c.key}
                    className="flex items-center hover:bg-[#FEF7E7]"
                    style={{ gap: 9, padding: '5px 8px', fontSize: 12, color: INK, cursor: 'pointer' }}
                    draggable
                    onDragStart={() => { dragKey.current = c.key }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => dropOn(c.key)}
                  >
                    <input type="checkbox" checked={!!on[c.key]} onChange={() => toggleCol(c.key)} style={{ width: 13, height: 13, accentColor: '#333333' }} />
                    <span style={{ flex: 1 }}>{c.label}</span>
                    <span title="Drag to reorder" style={{ color: '#C4BDB2', fontSize: 11, cursor: 'grab' }}>⠿</span>
                  </label>
                ))}
              </div>
              <div style={{ padding: '8px 14px', borderTop: '1px solid #E8E2D4', fontSize: 10, color: MUTE }}>drag ⠿ to reorder · saved on this browser</div>
            </div>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center" style={{ gap: 8, marginBottom: 14 }}>
          {chips.map(c => (
            <span key={c.key} className="inline-flex items-center" style={{ gap: 6, height: 26, padding: '0 9px', border: '1px solid #E48715', background: LATTE, fontSize: 11.5, color: '#B26A00', fontWeight: 700 }}>
              {c.label} · {c.value}
              <button onClick={() => removeChip(c.key)} aria-label={`Remove ${c.label}`} style={{ color: '#B26A00', display: 'inline-flex' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Table (horizontal scroll when many columns are on) */}
      <div style={{ overflowX: 'auto' }}>
      <div style={{ border: '1px solid #333333', background: '#FFFFFF', minWidth: minTableWidth }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, height: 36, background: LATTE, borderBottom: '1px solid #333333', alignItems: 'center' }}>
          <span className="flex justify-center"><input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 13, height: 13, accentColor: '#333333' }} /></span>
          {visible.map(c => (
            <span key={c.key} style={{ ...thStyle, justifyContent: c.key === 'ltv' || c.key === 'score' ? 'flex-end' : (c.key === 'enriched' || c.key === 'linkedin' || c.key === 'verified') ? 'center' : 'flex-start' }}>{c.label}</span>
          ))}
        </div>

        {items.map(r => {
          const sd = r.stage ? stageDef(r.stage) : null
          const isSel = selected.has(r.id)
          const enriched = r.enrichmentStatus === 'complete' || r.enrichmentStatus === 'partial' || !!r.jobTitle || !!r.companyName
          const cell = (key: string) => {
            switch (key) {
              case 'name': return (
                <span key={key} style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar name={r.name} email={r.email} photoUrl={r.photoUrl} size={26} />
                  <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13, fontWeight: 700, color: r.name ? INK : '#C4BDB2' }}>{r.name || '(no name)'}</span>
                  <a
                    href={personResultPath({ id: r.id, name: r.name, score: r.score, persona: r.persona, stage: r.stage })}
                    target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="Open their result page"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ fontSize: 13, textDecoration: 'none', lineHeight: 1 }}
                  >🎯</a>
                </span>
              )
              case 'email': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12, color: r.email ? '#4A4A4A' : '#C4BDB2' }}>{r.email || '—'}</span>
              case 'stage': return <span key={key} style={{ padding: '0 12px' }}>{sd && sd.key !== 'unknown' ? <DotChip label={sd.label} color={sd.color} bold /> : <span style={{ color: '#C4BDB2', fontSize: 12 }}>—</span>}</span>
              case 'company': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12.5, color: r.companyName ? INK : '#C4BDB2' }}>{r.companyName || '—'}</span>
              case 'title': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12, color: r.jobTitle ? '#4A4A4A' : '#C4BDB2' }}>{r.jobTitle || '—'}</span>
              case 'ltv': return (
                <span key={key} style={{ padding: '0 12px', textAlign: 'right', fontSize: 12.5, fontWeight: (r.lifetimeValueUsd ?? 0) > 0 ? 700 : 400, color: (r.lifetimeValueUsd ?? 0) > 0 ? '#2D6A26' : '#C4BDB2', fontVariantNumeric: 'tabular-nums' }}>
                  {(r.lifetimeValueUsd ?? 0) > 0 ? `$${Math.round(r.lifetimeValueUsd!).toLocaleString()}` : '—'}
                </span>
              )
              case 'newsletter': return <span key={key} style={{ padding: '0 12px', fontSize: 11.5, color: r.beehiivStatus === 'active' ? '#2D6A26' : MUTE }}>{r.beehiivStatus || '—'}</span>
              case 'enriched': return <span key={key} style={{ padding: '0 12px', textAlign: 'center', fontSize: 12.5, color: enriched ? '#62A758' : '#C4BDB2' }}>{enriched ? '✓' : '—'}</span>
              case 'country': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12, color: r.country ? '#4A4A4A' : '#C4BDB2' }}>{r.country ? `${countryFlag(r.country)} ${r.country}` : '—'}</span>
              case 'source': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 11.5, color: r.utmSource ? '#4A4A4A' : '#C4BDB2' }}>{r.utmSource || '—'}</span>
              case 'score': return <span key={key} style={{ padding: '0 12px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: '#E48715', fontVariantNumeric: 'tabular-nums' }}>{typeof r.score === 'number' ? r.score : '—'}</span>
              case 'verified': return <span key={key} style={{ padding: '0 12px', textAlign: 'center', fontSize: 11.5, color: r.enrichmentVerifiedAt ? '#2D6A26' : '#B26A00' }} title={r.enrichmentVerifiedAt ? `Verified ${new Date(r.enrichmentVerifiedAt).toLocaleDateString()}` : 'Pending verification (enrich game)'}>{r.enrichmentVerifiedAt ? '✓' : '⏳'}</span>
              case 'city': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12, color: r.ipCity ? '#4A4A4A' : '#C4BDB2' }}>{r.ipCity || '—'}</span>
              case 'seniority': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12, color: r.seniority ? '#4A4A4A' : '#C4BDB2' }}>{r.seniority || '—'}</span>
              case 'industry': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12, color: r.companyIndustry ? '#4A4A4A' : '#C4BDB2' }}>{r.companyIndustry || '—'}</span>
              case 'size': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12, color: r.companySize ? '#4A4A4A' : '#C4BDB2' }}>{r.companySize || '—'}</span>
              case 'tier': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 11.5, color: r.subscriptionTier ? '#4A4A4A' : '#C4BDB2' }}>{r.subscriptionTier || '—'}</span>
              case 'linkedin': return <span key={key} style={{ padding: '0 12px', textAlign: 'center' }}>{r.linkedinUrl ? <a href={r.linkedinUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 10, fontWeight: 800, background: '#0A66C2', color: '#FFF', padding: '2px 6px' }}>in</a> : <span style={{ color: '#C4BDB2', fontSize: 12 }}>—</span>}</span>
              case 'submitted': return <span key={key} style={{ padding: '0 12px', fontSize: 11.5, color: '#4A4A4A', fontVariantNumeric: 'tabular-nums' }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
              default: return null
            }
          }
          return (
            <div
              key={r.id}
              onClick={() => router.push(`/admin/submissions/${r.id}`)}
              style={{ display: 'grid', gridTemplateColumns: grid, minHeight: 46, borderBottom: `1px solid ${ROWHAIR}`, alignItems: 'center', cursor: 'pointer', background: isSel ? LATTE : '#FFFFFF' }}
              className="group hover:bg-[#FBF6E9]"
            >
              <span className="flex justify-center" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} style={{ width: 13, height: 13, accentColor: '#333333' }} />
              </span>
              {visible.map(c => cell(c.key))}
            </div>
          )
        })}
        {items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: MUTE, fontSize: 13 }}>No people match these filters.</div>
        )}
      </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
        <span style={{ fontSize: 12, color: '#6B6B6B' }}>
          Showing <strong style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{total === 0 ? 0 : offset + 1}-{Math.min(offset + items.length, total)}</strong> of <strong style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{total.toLocaleString()}</strong>
        </span>
        {pageCount > 1 && (
          <span className="inline-flex" style={{ border: '1px solid #333333' }}>
            <a href={current > 1 ? pageHref(current - 1) : undefined} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, color: current > 1 ? INK : '#C4BDB2', borderRight: '1px solid #333333' }} className={current > 1 ? 'hover:bg-[#FEF7E7]' : ''}>‹</a>
            {pageNums.map((p, i) => (
              <span key={p} className="inline-flex">
                {i > 0 && pageNums[i - 1] < p - 1 && <span style={{ padding: '6px 8px', fontSize: 12, color: '#C4BDB2', borderRight: '1px solid #333333' }}>…</span>}
                <a
                  href={pageHref(p)}
                  style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, background: p === current ? '#333333' : 'transparent', color: p === current ? '#FFFDFA' : INK, borderRight: '1px solid #333333' }}
                  className={p === current ? '' : 'hover:bg-[#FEF7E7]'}
                >{p}</a>
              </span>
            ))}
            <a href={current < pageCount ? pageHref(current + 1) : undefined} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, color: current < pageCount ? INK : '#C4BDB2' }} className={current < pageCount ? 'hover:bg-[#FEF7E7]' : ''}>›</a>
          </span>
        )}
      </div>

      {/* Floating bulk bar */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', background: '#1A1A1A', display: 'flex', alignItems: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.3)', zIndex: 60 }}>
          <span style={{ padding: '10px 16px', fontSize: 12, fontWeight: 800, color: '#FFFDFA', borderRight: '1px solid rgba(255,253,250,0.2)' }}>{selected.size} selected</span>
          <a href="/admin/lab" style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#E7B02F' }} className="hover:bg-white/10">✦ Enrich</a>
          <a href={exportHref} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#FFFDFA' }} className="hover:bg-white/10">Export csv</a>
          <button onClick={bulkArchive} disabled={archiving} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#FFFDFA', opacity: archiving ? 0.5 : 1 }} className="hover:bg-white/10">{archiving ? 'Archiving…' : 'Archive'}</button>
          <button onClick={() => setSelected(new Set())} aria-label="Clear selection" style={{ padding: '10px 14px', fontSize: 13, color: MUTE, borderLeft: '1px solid rgba(255,253,250,0.2)' }} className="hover:bg-white/10">×</button>
        </div>
      )}
    </div>
  )
}
