'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import PhotoLightbox, { PhotoCell } from '@/components/admin/PhotoLightbox'
import type { StoredSubmission } from '@/lib/kv'

interface Props { items: StoredSubmission[] }

function fmt(ts: number): string {
  // "May 24, 16:33" — compact but unambiguous; includes time so rows on the
  // same calendar day sort visibly and stop "shuffling" between renders.
  const d = new Date(ts)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date}, ${time}`
}

function SourceBadge({ source }: { source?: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    survey: { label: 'Survey', bg: '#333333', fg: '#FFFDFA' },
    legacy: { label: 'Legacy', bg: '#E8E4DF', fg: '#333333' },
  }
  const cfg = map[source || ''] || { label: source || '—', bg: '#F5F5F5', fg: '#9C9C9C' }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: cfg.bg, color: cfg.fg }}>
      {cfg.label}
    </span>
  )
}

// ── Editable cell ───────────────────────────────────────────────
function EditableCell({
  value, rowId, field, placeholder, className = '',
  onSaved,
}: {
  value: string
  rowId: string
  field: string
  placeholder?: string
  className?: string
  onSaved?: (newValue: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit() {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/submissions/${rowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: draft }),
      })
      if (res.ok) {
        onSaved?.(draft)
        setEditing(false)
      } else {
        alert('Save failed')
      }
    } catch {
      alert('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        placeholder={placeholder}
        disabled={saving}
        className={`w-full px-2 py-1 border border-[#046BB1] rounded text-sm outline-none bg-white ${className}`}
      />
    )
  }
  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Double-click to edit"
      className={`cursor-text hover:bg-[#FEF7E7] -mx-1 px-1 py-0.5 rounded ${className} ${!value ? 'text-[#E8E4DF]' : ''}`}
    >
      {value || (placeholder ? `+ ${placeholder}` : '—')}
    </span>
  )
}

// ── Column descriptors ──────────────────────────────────────────
type ProviderKey = 'apollo' | 'wiza' | 'apify_profile' | 'google' | 'v2'

const V2_ENABLED = process.env.NEXT_PUBLIC_ENRICH_V2 === 'true'

type RowCtx = {
  s: StoredSubmission
  busyProvider: { id: string; provider: ProviderKey } | null
  providerResult: Record<string, Record<ProviderKey, { status: string; linkedinUrl?: string } | undefined> | undefined>
  runProvider: (id: string, provider: ProviderKey) => void
  deleteRow: (id: string, label: string) => void
  openLightbox: (p: { name?: string; email?: string; photoUrl?: string; title?: string; company?: string; linkedinUrl?: string }) => void
  bumpRow: () => void
}

interface Column {
  id: string
  label: string
  width?: string
  align?: 'left' | 'right' | 'center'
  required?: boolean
  header?: () => React.ReactNode
  cell: (ctx: RowCtx) => React.ReactNode
}

const COLUMNS: Column[] = [
  {
    id: 'source', label: 'Source', width: '76px', required: true,
    cell: ({ s }) => <SourceBadge source={s.source} />,
  },
  {
    id: 'photo', label: 'Photo', width: '48px', required: true, align: 'center',
    cell: ({ s, openLightbox }) => (
      <PhotoCell size={36}
        person={{
          name: s.name, email: s.email, photoUrl: s.photoUrl,
          title: s.jobTitle, company: s.companyName, linkedinUrl: s.linkedinUrl,
        }}
        onOpen={openLightbox} />
    ),
  },
  {
    id: 'person', label: 'Person',
    cell: ({ s, bumpRow }) => (
      <div className="min-w-0">
        <EditableCell value={s.name || ''} rowId={s.id} field="name"
          placeholder="add name"
          className="text-sm font-semibold text-[#333333] block max-w-[200px] truncate"
          onSaved={(v) => { s.name = v; bumpRow() }} />
        <p className="text-[11px] text-[#9C9C9C] truncate max-w-[200px]">
          <Link href={`/admin/submissions/${s.id}`} className="hover:underline">{s.email}</Link>
        </p>
      </div>
    ),
  },
  {
    id: 'title_company', label: 'Title @ Company',
    cell: ({ s, bumpRow }) => (
      <div className="min-w-0">
        <EditableCell value={s.jobTitle || ''} rowId={s.id} field="jobTitle"
          placeholder="title" className="text-[13px] text-[#333333] block"
          onSaved={(v) => { s.jobTitle = v; bumpRow() }} />
        <EditableCell value={s.companyName || ''} rowId={s.id} field="companyName"
          placeholder="company" className="text-[12px] text-[#9C9C9C] block"
          onSaved={(v) => { s.companyName = v; bumpRow() }} />
      </div>
    ),
  },
  {
    id: 'industry', label: 'Industry',
    cell: ({ s, bumpRow }) => (
      <EditableCell value={s.companyIndustry || ''} rowId={s.id} field="companyIndustry"
        placeholder="industry" className="text-[13px] text-[#9C9C9C]"
        onSaved={(v) => { s.companyIndustry = v; bumpRow() }} />
    ),
  },
  {
    id: 'country', label: 'Country',
    cell: ({ s, bumpRow }) => (
      <EditableCell value={s.country || ''} rowId={s.id} field="country"
        placeholder="country" className="text-[13px] text-[#9C9C9C]"
        onSaved={(v) => { s.country = v; bumpRow() }} />
    ),
  },
  {
    id: 'age', label: 'Age',
    cell: ({ s, bumpRow }) => (
      <EditableCell value={s.ageBracket || ''} rowId={s.id} field="ageBracket"
        placeholder="age" className="text-[12px] text-[#9C9C9C] whitespace-nowrap"
        onSaved={(v) => { s.ageBracket = v; bumpRow() }} />
    ),
  },
  {
    id: 'seniority', label: 'Seniority',
    cell: ({ s, bumpRow }) => (
      <EditableCell value={s.seniority || ''} rowId={s.id} field="seniority"
        placeholder="seniority" className="text-[12px] text-[#9C9C9C]"
        onSaved={(v) => { s.seniority = v; bumpRow() }} />
    ),
  },
  {
    id: 'score', label: 'Score', align: 'right',
    cell: ({ s }) => <span className="font-semibold tabular-nums">{s.score ?? '—'}</span>,
  },
  {
    id: 'linkedin', label: 'LinkedIn', width: '56px', align: 'center', required: true,
    cell: ({ s }) => s.linkedinUrl ? (
      <a href={s.linkedinUrl} target="_blank" rel="noopener noreferrer"
        title={s.linkedinUrl}
        className="text-[#046BB1] hover:underline text-xs font-bold">in</a>
    ) : <span className="text-[#E8E4DF] text-xs">—</span>,
  },
  {
    id: 'date', label: 'Date', width: '120px',
    cell: ({ s }) => <span className="text-[#9C9C9C] text-xs whitespace-nowrap" title={new Date(s.ts).toISOString()}>{fmt(s.ts)}</span>,
  },
  {
    id: 'enrich', label: 'Enrich', width: V2_ENABLED ? '200px' : '160px', align: 'center', required: true,
    cell: ({ s, busyProvider, providerResult, runProvider }) => (
      <div className="flex items-center gap-1 justify-center">
        {((V2_ENABLED ? ['v2', 'google', 'apify_profile', 'apollo', 'wiza'] : ['google', 'apify_profile', 'apollo', 'wiza']) as ProviderKey[]).map(p => {
          const busy = busyProvider?.id === s.id && busyProvider.provider === p
          const r = providerResult[s.id]?.[p]
          const ok = r?.status === 'complete'
          const partial = r?.status === 'partial'
          const fail = r && !ok && !partial
          const label = p === 'v2' ? '✨' : p === 'google' ? 'G' : p === 'apify_profile' ? 'L' : p === 'apollo' ? 'A' : 'W'
          const isV2 = p === 'v2'
          return (
            <button
              key={p}
              onClick={(e) => { e.stopPropagation(); runProvider(s.id, p) }}
              disabled={!!busyProvider}
              title={isV2 ? 'Run full v2 pipeline (name from email → Apollo → Google → LinkedIn scrape)' : `Try ${p[0].toUpperCase() + p.slice(1)} — ${r?.status || 'idle'}`}
              className={`w-7 h-6 rounded text-[10px] font-bold transition-colors flex items-center justify-center ${
                busy ? 'bg-[#F5F5F5] text-[#9C9C9C]' :
                ok ? 'bg-[#62A758] text-white' :
                partial ? 'bg-[#E7B02F] text-[#333333]' :
                fail ? 'bg-[#BE3B3B] text-white' :
                isV2 ? 'bg-[#333333] text-[#FFFDFA] hover:opacity-90' :
                'bg-white border border-[#E8E4DF] text-[#333333] hover:bg-[#FEF7E7]'
              }`}
            >
              {busy ? '…' : label}
            </button>
          )
        })}
      </div>
    ),
  },
  {
    id: 'menu', label: '', width: '40px', align: 'center', required: true,
    header: () => null,
    cell: ({ s, deleteRow }) => (
      <button
        onClick={(e) => { e.stopPropagation(); deleteRow(s.id, s.name || s.email) }}
        title="Delete this record"
        className="px-1.5 py-1 rounded-md text-[#9C9C9C] hover:bg-[#FEE3E3] hover:text-[#BE3B3B] transition-colors text-base leading-none"
      >…</button>
    ),
  },
]

const DEFAULT_ORDER = COLUMNS.map(c => c.id)
const DEFAULT_VISIBLE = new Set(COLUMNS.map(c => c.id))
const STORAGE_KEY = 'admin_table_columns_v3'  // bumped to force-reset users with old saved column order

function loadState(): { order: string[]; visible: Set<string> } {
  if (typeof window === 'undefined') return { order: DEFAULT_ORDER, visible: DEFAULT_VISIBLE }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { order: DEFAULT_ORDER, visible: DEFAULT_VISIBLE }
    const parsed = JSON.parse(raw) as { order?: string[]; visible?: string[] }
    const known = new Set(DEFAULT_ORDER)
    const order = (parsed.order || []).filter(id => known.has(id))
    for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id)
    const visible = new Set(parsed.visible || DEFAULT_ORDER)
    for (const c of COLUMNS) if (c.required) visible.add(c.id)
    return { order, visible }
  } catch {
    return { order: DEFAULT_ORDER, visible: DEFAULT_VISIBLE }
  }
}

function saveState(order: string[], visible: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, visible: Array.from(visible) })) } catch { /* noop */ }
}

// ── Component ───────────────────────────────────────────────────
export default function PeopleTable({ items }: Props) {
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER)
  const [visible, setVisible] = useState<Set<string>>(DEFAULT_VISIBLE)
  const [lightbox, setLightbox] = useState<{ name?: string; email?: string; photoUrl?: string; title?: string; company?: string; linkedinUrl?: string } | null>(null)
  const [busyProvider, setBusyProvider] = useState<{ id: string; provider: ProviderKey } | null>(null)
  const [providerResult, setProviderResult] = useState<Record<string, Record<ProviderKey, { status: string; linkedinUrl?: string } | undefined> | undefined>>({})
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [paneOpen, setPaneOpen] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [renderTick, setRenderTick] = useState(0)
  const bumpRow = () => setRenderTick(t => t + 1)

  useEffect(() => {
    const s = loadState()
    setOrder(s.order)
    setVisible(s.visible)
  }, [])

  useEffect(() => { saveState(order, visible) }, [order, visible])

  const visibleColumns = useMemo(
    () => order.map(id => COLUMNS.find(c => c.id === id)).filter((c): c is Column => !!c && visible.has(c.id)),
    [order, visible],
  )

  async function runProvider(id: string, provider: ProviderKey) {
    setBusyProvider({ id, provider })
    try {
      // v2 button hits the pipeline endpoint with save=true; other buttons hit the per-provider endpoint
      const endpoint = provider === 'v2' ? '/api/admin/enrich/v2/row' : '/api/admin/enrich/provider'
      const reqBody = provider === 'v2' ? { id, save: true } : { id, provider }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      })
      const data = await res.json()
      // Normalize v2's nested merged shape to the per-provider button's flat shape
      if (provider === 'v2') {
        data.linkedinUrl = data.merged?.linkedinUrl
        data.photoUrl = data.merged?.photoUrl
        data.name = data.merged?.fullName
        data.jobTitle = data.merged?.jobTitle
        data.companyName = data.merged?.companyName
      }
      const status = data.status || (res.ok ? 'partial' : 'failed')
      setProviderResult(prev => ({
        ...prev,
        [id]: { ...(prev[id] || {} as Record<ProviderKey, { status: string; linkedinUrl?: string } | undefined>), [provider]: { status, linkedinUrl: data.linkedinUrl } },
      }))
      // Live-update the row data the table is rendering
      const row = items.find(r => r.id === id)
      if (row) {
        if (data.linkedinUrl && !row.linkedinUrl) row.linkedinUrl = data.linkedinUrl
        if (data.photoUrl && !row.photoUrl) row.photoUrl = data.photoUrl
        if (data.name && !row.name) row.name = data.name
        if (data.jobTitle && !row.jobTitle) row.jobTitle = data.jobTitle
        if (data.companyName && !row.companyName) row.companyName = data.companyName
        bumpRow()
      }
      // Log diagnostic info for Google misses
      if (provider === 'google' && !data.linkedinUrl) {
        const sample = (data.organicSample || []).map((o: { title?: string; url: string }) => `- ${o.title || ''}\n  ${o.url}`).join('\n')
        console.warn(`Google miss for row ${id}.\nTried:\n${(data.triedQueries || []).join('\n')}\n\nTop results:\n${sample || '(none)'}`)
      }
    } catch {
      setProviderResult(prev => ({
        ...prev,
        [id]: { ...(prev[id] || {} as Record<ProviderKey, { status: string; linkedinUrl?: string } | undefined>), [provider]: { status: 'failed' } },
      }))
    } finally {
      setBusyProvider(null)
    }
  }

  async function deleteRow(id: string, label: string) {
    if (!confirm(`Permanently delete this record (${label})?`)) return
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setRemovedIds(prev => { const next = new Set(prev); next.add(id); return next })
      } else {
        alert('Delete failed')
      }
    } catch {
      alert('Network error')
    }
  }

  const ctxBase = {
    busyProvider, providerResult, runProvider, deleteRow,
    openLightbox: setLightbox, bumpRow,
  }

  const visibleItems = useMemo(() => items.filter(s => !removedIds.has(s.id)), [items, removedIds])

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E8E4DF] bg-[#FFFDFA]">
        <p className="text-[11px] text-[#9C9C9C]">Double-click any cell to edit · click a photo for cinema mode</p>
        <button
          onClick={() => setPaneOpen(p => !p)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-[#E8E4DF] text-xs font-bold text-[#333333] hover:bg-[#F5F5F5]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          Columns ({visibleColumns.length})
        </button>
      </div>

      {paneOpen && (
        <ColumnToggle
          order={order} visible={visible}
          onChange={(nextOrder, nextVisible) => { setOrder(nextOrder); setVisible(nextVisible) }}
          onClose={() => setPaneOpen(false)}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#FFFDFA] border-b border-[#E8E4DF]">
            <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">
              {visibleColumns.map(c => (
                <th key={c.id}
                  className={`px-3 py-3 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}
                  style={c.width ? { width: c.width } : undefined}>
                  {c.header ? c.header() : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleItems.map(s => (
              <tr key={s.id} className="border-b border-[#F5F5F5] hover:bg-[#FFFDFA] transition-colors">
                {visibleColumns.map(c => (
                  <td key={c.id}
                    className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                    {c.cell({ s, ...ctxBase })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PhotoLightbox person={lightbox} onClose={() => setLightbox(null)} />
    </>
  )
}

// ── Column toggle popover (unchanged from previous) ─────────────
function ColumnToggle({
  order, visible, onChange, onClose,
}: {
  order: string[]
  visible: Set<string>
  onChange: (order: string[], visible: Set<string>) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dragId = useRef<string | null>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [onClose])

  function toggleVisible(id: string) {
    const col = COLUMNS.find(c => c.id === id); if (col?.required) return
    const next = new Set(visible)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange(order, next)
  }
  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const next = order.filter(id => id !== fromId)
    next.splice(next.indexOf(toId), 0, fromId)
    onChange(next, visible)
  }
  const reset = () => onChange(DEFAULT_ORDER, DEFAULT_VISIBLE)

  return (
    <div className="relative">
      <div ref={ref} className="absolute right-3 top-1 z-30 w-72 bg-white border border-[#E8E4DF] rounded-xl shadow-xl">
        <header className="flex items-center justify-between px-4 py-3 border-b border-[#E8E4DF]">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#9C9C9C]">Columns</h3>
          <button onClick={reset} className="text-[11px] text-[#046BB1] hover:underline font-medium">Reset</button>
        </header>
        <div className="py-2 max-h-96 overflow-auto">
          {order.map(id => {
            const col = COLUMNS.find(c => c.id === id); if (!col) return null
            const isVisible = visible.has(id)
            return (
              <div key={id}
                draggable
                onDragStart={() => { dragId.current = id }}
                onDragOver={e => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragId.current) reorder(dragId.current, id); dragId.current = null }}
                className="flex items-center gap-3 px-4 py-2 hover:bg-[#FFFDFA] cursor-move">
                <span className="text-[#9C9C9C] text-xs select-none">⋮⋮</span>
                <label className="flex-1 flex items-center gap-2 cursor-pointer min-w-0">
                  <input type="checkbox" checked={isVisible} disabled={col.required}
                    onChange={() => toggleVisible(id)}
                    className="w-4 h-4 accent-[#333333] disabled:opacity-40" />
                  <span className={`text-sm font-medium truncate ${isVisible ? 'text-[#333333]' : 'text-[#9C9C9C]'}`}>
                    {col.label || col.id}
                  </span>
                  {col.required && <span className="text-[9px] text-[#9C9C9C] uppercase tracking-wider ml-auto shrink-0">always</span>}
                </label>
              </div>
            )
          })}
        </div>
        <footer className="px-4 py-2.5 border-t border-[#E8E4DF] flex items-center justify-between text-[10px] text-[#9C9C9C]">
          <span>Drag to reorder</span>
          <button onClick={onClose} className="font-bold text-[#333333] hover:underline">Done</button>
        </footer>
      </div>
    </div>
  )
}
