'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { StoredSubmission } from '@/lib/kv'
import { personResultPath } from '@/lib/result-url'
import { stageDef, personaDef, STAGES } from '@/lib/segmentation-v2'
import { encodeSpec } from '@/lib/advanced-filter'
import Avatar from '@/components/admin/Avatar.client'

// ── People table (redesign 2c) ───────────────────────────────────────
// Hard-edge records table: view tabs, ladder-mix strip (click a rung to
// filter), column chooser popover (persisted), active-filter chips, dense
// grid with avatars + square stage/persona dots, row → detail, floating
// bulk bar with Enrich / Export / Archive.

const MUTE = '#9C9C9C'
const INK = '#1A1A1A'
const LATTE = '#FEF7E7'
const ROWHAIR = '#F1ECE2'

const COLS_KEY = 'admin_people_cols_v2'

interface ColDef { key: string; label: string; width: string; defaultOn: boolean }
const COLS: ColDef[] = [
  { key: 'person', label: 'Person', width: 'minmax(230px,1.7fr)', defaultOn: true },
  { key: 'stage', label: 'Stage', width: '148px', defaultOn: true },
  { key: 'persona', label: 'Persona', width: '138px', defaultOn: true },
  { key: 'company', label: 'Company', width: 'minmax(150px,1.2fr)', defaultOn: true },
  { key: 'title', label: 'Title', width: 'minmax(140px,1.1fr)', defaultOn: true },
  { key: 'ltv', label: 'LTV', width: '88px', defaultOn: true },
  { key: 'newsletter', label: 'Newsletter', width: '96px', defaultOn: true },
  { key: 'enriched', label: 'Enriched', width: '78px', defaultOn: true },
  { key: 'country', label: 'Country', width: '110px', defaultOn: false },
  { key: 'source', label: 'Source', width: '110px', defaultOn: false },
  { key: 'score', label: 'Score', width: '64px', defaultOn: false },
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
  items, total, offset = 0, pageSize = 100, stageMix = [], paidCount = 0,
}: {
  items: StoredSubmission[]
  total: number
  offset?: number
  pageSize?: number
  stageMix?: { key: string; count: number }[]
  paidCount?: number
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [colsOpen, setColsOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)

  // Column visibility, persisted.
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(COLS.map(c => [c.key, c.defaultOn])))
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLS_KEY)
      if (raw) setOn(prev => ({ ...prev, ...JSON.parse(raw) }))
    } catch { /* defaults stand */ }
  }, [])
  const toggleCol = (key: string) => setOn(prev => {
    const next = { ...prev, [key]: !prev[key] }
    if (!Object.values(next).some(Boolean)) return prev // never zero columns
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)) } catch { /* non-fatal */ }
    return next
  })
  const visible = COLS.filter(c => on[c.key])
  const grid = `38px ${visible.map(c => c.width).join(' ')}`

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

  // ── Ladder mix strip data ──
  const ladderDefs = useMemo(() => [STAGES.find(s => s.key === 'unknown')!, ...STAGES.filter(s => s.key !== 'unknown')], [])
  const mixTotal = stageMix.reduce((a, b) => a + b.count, 0)
  const mixOf = (key: string) => stageMix.find(s => s.key === key)?.count || 0
  const paidPct = mixTotal > 0 ? (paidCount / mixTotal) * 100 : 0
  const stageHref = (key: string) => {
    const u = new URLSearchParams(sp.toString())
    if (u.get('stage') === key) u.delete('stage'); else u.set('stage', key)
    u.delete('offset')
    return `/admin/submissions?${u.toString()}`
  }

  // Active-filter chips derived from the URL.
  const chips = useMemo(() => {
    const out: { key: string; label: string; value: string }[] = []
    const labelFor: Record<string, string> = {
      stage: 'Stage', persona: 'Persona', seniority: 'Seniority', industry: 'Industry',
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
              <div style={{ padding: '8px 6px' }}>
                {COLS.map(c => (
                  <label key={c.key} className="flex items-center hover:bg-[#FEF7E7]" style={{ gap: 9, padding: '5px 8px', fontSize: 12, color: INK, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!on[c.key]} onChange={() => toggleCol(c.key)} style={{ width: 13, height: 13, accentColor: '#333333' }} />
                    <span style={{ flex: 1 }}>{c.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ padding: '8px 14px', borderTop: '1px solid #E8E2D4', fontSize: 10, color: MUTE }}>saved on this browser</div>
            </div>
          )}
        </div>
      </div>

      {/* Ladder mix strip */}
      {mixTotal > 0 && (
        <div style={{ border: '1px solid #333333', background: '#FFFFFF', padding: '14px 18px', marginBottom: 18 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTE }}>Ladder mix · click a rung to filter</span>
            <span style={{ fontSize: 11, color: '#6B6B6B' }}>{paidCount} paid · <strong style={{ color: '#BE3B3B' }}>{paidPct.toFixed(1)}%</strong> quiz → paid</span>
          </div>
          <div className="flex" style={{ height: 22, border: '1px solid #333333' }}>
            {ladderDefs.map(def => {
              const c = mixOf(def.key)
              if (c === 0) return null
              return (
                <a
                  key={def.key}
                  href={stageHref(def.key)}
                  title={`${def.label} · ${c.toLocaleString()}`}
                  style={{ width: `${(c / mixTotal) * 100}%`, background: def.color, borderRight: '1px solid #FFFDFA' }}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap" style={{ columnGap: 18, rowGap: 6, marginTop: 10 }}>
            {ladderDefs.map(def => {
              const c = mixOf(def.key)
              if (c === 0) return null
              return (
                <a key={def.key} href={stageHref(def.key)} className="inline-flex items-center hover:underline" style={{ gap: 6, fontSize: 11, color: INK }}>
                  <span style={{ width: 8, height: 8, background: def.color }} />
                  {def.emoji} {def.label} <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{c.toLocaleString()}</strong>
                </a>
              )
            })}
          </div>
        </div>
      )}

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

      {/* Table */}
      <div style={{ border: '1px solid #333333', background: '#FFFFFF' }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, height: 36, background: LATTE, borderBottom: '1px solid #333333', alignItems: 'center' }}>
          <span className="flex justify-center"><input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 13, height: 13, accentColor: '#333333' }} /></span>
          {visible.map(c => (
            <span key={c.key} style={{ ...thStyle, justifyContent: c.key === 'ltv' || c.key === 'score' ? 'flex-end' : c.key === 'enriched' ? 'center' : 'flex-start' }}>{c.label}</span>
          ))}
        </div>

        {items.map(r => {
          const sd = r.stage ? stageDef(r.stage) : null
          const pd = r.persona ? personaDef(r.persona) : null
          const isSel = selected.has(r.id)
          const enriched = r.enrichmentStatus === 'complete' || r.enrichmentStatus === 'partial' || !!r.jobTitle || !!r.companyName
          const cell = (key: string) => {
            switch (key) {
              case 'person': return (
                <span key={key} style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar name={r.name} email={r.email} photoUrl={r.photoUrl} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontSize: 13, fontWeight: 700, color: INK }}>{r.name || '(no name)'}</span>
                    <span className="block truncate" style={{ fontSize: 11, color: MUTE }}>{r.email}</span>
                  </span>
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
              case 'stage': return <span key={key} style={{ padding: '0 12px' }}>{sd && sd.key !== 'unknown' ? <DotChip label={sd.label} color={sd.color} bold /> : <span style={{ color: '#C4BDB2', fontSize: 12 }}>—</span>}</span>
              case 'persona': return <span key={key} style={{ padding: '0 12px' }}>{pd && pd.key !== 'unknown' ? <DotChip label={pd.label} color={pd.color} /> : <span style={{ color: '#C4BDB2', fontSize: 12 }}>—</span>}</span>
              case 'company': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12.5, color: r.companyName ? INK : '#C4BDB2' }}>{r.companyName || '—'}</span>
              case 'title': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12, color: r.jobTitle ? '#4A4A4A' : '#C4BDB2' }}>{r.jobTitle || '—'}</span>
              case 'ltv': return (
                <span key={key} style={{ padding: '0 12px', textAlign: 'right', fontSize: 12.5, fontWeight: (r.lifetimeValueUsd ?? 0) > 0 ? 700 : 400, color: (r.lifetimeValueUsd ?? 0) > 0 ? '#2D6A26' : '#C4BDB2', fontVariantNumeric: 'tabular-nums' }}>
                  {(r.lifetimeValueUsd ?? 0) > 0 ? `$${Math.round(r.lifetimeValueUsd!).toLocaleString()}` : '—'}
                </span>
              )
              case 'newsletter': return <span key={key} style={{ padding: '0 12px', fontSize: 11.5, color: r.beehiivStatus === 'active' ? '#2D6A26' : MUTE }}>{r.beehiivStatus || '—'}</span>
              case 'enriched': return <span key={key} style={{ padding: '0 12px', textAlign: 'center', fontSize: 12.5, color: enriched ? '#62A758' : '#C4BDB2' }}>{enriched ? '✓' : '—'}</span>
              case 'country': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 12, color: r.country ? '#4A4A4A' : '#C4BDB2' }}>{r.country || '—'}</span>
              case 'source': return <span key={key} className="truncate" style={{ padding: '0 12px', fontSize: 11.5, color: r.utmSource ? '#4A4A4A' : '#C4BDB2' }}>{r.utmSource || '—'}</span>
              case 'score': return <span key={key} style={{ padding: '0 12px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: '#E48715', fontVariantNumeric: 'tabular-nums' }}>{typeof r.score === 'number' ? r.score : '—'}</span>
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
