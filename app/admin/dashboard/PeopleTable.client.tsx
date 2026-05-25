'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import PhotoLightbox, { PhotoCell, type CardPerson } from '@/components/admin/PhotoLightbox'
import FieldEnrichTrigger from '@/components/admin/FieldEnrichTrigger'
import ColumnEnrichTrigger from '@/components/admin/ColumnEnrichTrigger'
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
type ProviderKey = 'v2'

const STORAGE_KEY = 'admin_table_columns_v7'  // bumped to reset prior layouts (re-shows age + sex)

type RowCtx = {
  s: StoredSubmission
  busyProvider: { id: string; provider: ProviderKey } | null
  providerResult: Record<string, Record<ProviderKey, { status: string; linkedinUrl?: string } | undefined> | undefined>
  runProvider: (id: string, provider: ProviderKey) => void
  deleteRow: (id: string, label: string) => void
  openLightbox: (rowId: string) => void
  bumpRow: () => void
  selected: Set<string>
  toggleSelected: (id: string) => void
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
  // Row select (Clay-style multi-select) — header has a select-all checkbox.
  // We render the header with a custom node when the column is 'select' (in the
  // <thead> below), so this `header` ref is just a placeholder.
  {
    id: 'select', label: '', width: '36px', align: 'center', required: true,
    header: () => null,
    cell: ({ s, selected, toggleSelected }) => (
      <input
        type="checkbox"
        checked={selected.has(s.id)}
        onChange={(e) => { e.stopPropagation(); toggleSelected(s.id) }}
        onClick={(e) => e.stopPropagation()}
        className="w-3.5 h-3.5 accent-[#333333] cursor-pointer"
      />
    ),
  },
  // ✨ Enrich button — moved to first action column (per Clay layout)
  {
    id: 'enrich', label: '', width: '96px', align: 'center', required: true,
    header: () => null,
    cell: ({ s, busyProvider, providerResult, runProvider }) => {
      const busy = busyProvider?.id === s.id
      // Prefer session result if the user just enriched, else fall back to
      // the row's DB status so we always reflect "has this been enriched?"
      const sessionR = providerResult[s.id]?.v2
      const sessionStatus = sessionR?.status
      const dbStatus = s.enrichmentStatus
      const status = sessionStatus || dbStatus

      const ok = status === 'complete'
      const partial = status === 'partial'
      const fail = status === 'failed'
      const enrichedDate = s.enrichedAt ? new Date(s.enrichedAt).toLocaleDateString() : null
      const label = !status ? '✨ Enrich' : ok ? '✓ Done' : partial ? '~ Partial' : '✕ Failed'
      const tip = !status
        ? 'Run the full enrichment pipeline'
        : `Already enriched${enrichedDate ? ` on ${enrichedDate}` : ''} (${status}). Click to re-run.`

      return (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (status && !confirm(`This row was already enriched${enrichedDate ? ` on ${enrichedDate}` : ''} (status: ${status}).\n\nRe-run anyway? Costs API credits.`)) return
            runProvider(s.id, 'v2')
          }}
          disabled={!!busyProvider}
          title={tip}
          className={`h-7 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
            busy ? 'bg-[#F5F5F5] text-[#9C9C9C]' :
            ok ? 'bg-[#62A758] text-white' :
            partial ? 'bg-[#E7B02F] text-[#333333]' :
            fail ? 'bg-[#BE3B3B] text-white' :
            'bg-[#333333] text-[#FFFDFA] hover:opacity-90'
          }`}
        >
          {busy ? '…' : label}
        </button>
      )
    },
  },
  // ── DEFAULT ORDER PER USER SPEC: Date, Source, Photo, Full name,
  //    Job title, Company, Age, Sex, Email, LinkedIn ───────────────
  {
    id: 'date', label: 'Date · time', width: '130px',
    cell: ({ s }) => (
      <span className="text-[#9C9C9C] text-xs whitespace-nowrap" title={new Date(s.ts).toISOString()}>
        {fmt(s.ts)}
      </span>
    ),
  },
  {
    id: 'source', label: 'Source', width: '78px',
    cell: ({ s }) => <SourceBadge source={s.source} />,
  },
  {
    id: 'utmSource', label: 'UTM source', width: '110px',
    cell: ({ s }) => s.utmSource ? (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#FEF7E7] text-[#E48715] border border-[#E48715]/30 truncate max-w-[100px]" title={s.utmRef ? `${s.utmSource} · ${s.utmRef}` : s.utmSource}>
        ↗ {s.utmSource}
      </span>
    ) : <span className="text-[11px] text-[#E8E4DF]">—</span>,
  },
  {
    id: 'photo', label: 'Photo', width: '70px', align: 'center',
    header: () => (
      <span className="inline-flex items-center">
        Photo
        <ColumnEnrichTrigger field="photo" />
      </span>
    ),
    cell: ({ s, openLightbox }) => (
      <span className="inline-flex items-center gap-1 justify-center">
        <PhotoCell size={32}
          person={{
            name: s.name, email: s.email, photoUrl: s.photoUrl,
            title: s.jobTitle, company: s.companyName, linkedinUrl: s.linkedinUrl,
          }}
          onOpen={() => openLightbox(s.id)} />
        {!s.photoUrl && <FieldEnrichTrigger rowId={s.id} field="photo" title="Fetch photo only (≈$0.004)" />}
      </span>
    ),
  },
  {
    id: 'name', label: 'Full name',
    cell: ({ s, bumpRow }) => (
      <Link href={`/admin/submissions/${s.id}`} className="block hover:underline">
        <EditableCell value={s.name || ''} rowId={s.id} field="name"
          placeholder="add name"
          className="text-[13px] font-semibold text-[#333333] block max-w-[200px] truncate"
          onSaved={(v) => { s.name = v; bumpRow() }} />
      </Link>
    ),
  },
  {
    id: 'jobTitle', label: 'Headline',
    cell: ({ s, bumpRow }) => (
      <EditableCell value={s.jobTitle || ''} rowId={s.id} field="jobTitle"
        placeholder="headline" className="text-[13px] text-[#333333]"
        onSaved={(v) => { s.jobTitle = v; bumpRow() }} />
    ),
  },
  {
    id: 'company', label: 'Company',
    cell: ({ s, bumpRow }) => (
      <EditableCell value={s.companyName || ''} rowId={s.id} field="companyName"
        placeholder="company" className="text-[13px] text-[#333333]"
        onSaved={(v) => { s.companyName = v; bumpRow() }} />
    ),
  },
  {
    id: 'age', label: 'Age', width: '110px',
    header: () => (
      <span className="inline-flex items-center">
        Age
        <ColumnEnrichTrigger field="demographics" />
      </span>
    ),
    cell: ({ s, bumpRow }) => {
      // Merge logic: user-reported quiz value wins, else AI-estimate from photo
      const value = s.ageBracket || s.ageAiEstimate
      const isAi = !s.ageBracket && !!s.ageAiEstimate
      if (!value) {
        return (
          <span className="inline-flex items-center gap-1">
            <EditableCell value="" rowId={s.id} field="ageBracket"
              placeholder="age" className="text-[12px] text-[#E8E4DF] whitespace-nowrap"
              onSaved={(v) => { s.ageBracket = v; bumpRow() }} />
            <FieldEnrichTrigger rowId={s.id} field="demographics" title="Estimate age + sex from photo (≈$0.005)" />
          </span>
        )
      }
      if (isAi) {
        return (
          <span className="inline-flex items-center gap-1 text-[12px] text-[#9C9C9C] whitespace-nowrap" title={`AI-estimated · ${s.aiEstimateConfidence || 'unknown'} confidence`}>
            {value}
            <span className="text-[9px] font-bold uppercase px-1 py-px rounded bg-[#FEF7E7] text-[#E48715]">✨</span>
          </span>
        )
      }
      return (
        <EditableCell value={value} rowId={s.id} field="ageBracket"
          placeholder="age" className="text-[12px] text-[#333333] whitespace-nowrap"
          onSaved={(v) => { s.ageBracket = v; bumpRow() }} />
      )
    },
  },
  {
    id: 'sex', label: 'Sex', width: '100px',
    header: () => (
      <span className="inline-flex items-center">
        Sex
        <ColumnEnrichTrigger field="demographics" />
      </span>
    ),
    cell: ({ s }) => {
      if (!s.sexAiEstimate) {
        return (
          <span className="inline-flex items-center gap-1">
            <span className="text-[12px] text-[#E8E4DF]">—</span>
            <FieldEnrichTrigger rowId={s.id} field="demographics" title="Estimate age + sex from photo (≈$0.005)" />
          </span>
        )
      }
      const display = s.sexAiEstimate.charAt(0).toUpperCase() + s.sexAiEstimate.slice(1).toLowerCase()
      return (
        <span className="inline-flex items-center gap-1 text-[12px] text-[#9C9C9C]">
          {display}
          <span className="text-[9px] font-bold uppercase px-1 py-px rounded bg-[#FEF7E7] text-[#E48715]" title="AI-estimated">✨</span>
        </span>
      )
    },
  },
  {
    id: 'email', label: 'Email',
    cell: ({ s }) => (
      <Link href={`/admin/submissions/${s.id}`} className="text-[12px] text-[#9C9C9C] hover:text-[#046BB1] truncate max-w-[240px] block">
        {s.email}
      </Link>
    ),
  },
  {
    id: 'linkedin', label: 'LinkedIn', width: '60px', align: 'center',
    cell: ({ s }) => s.linkedinUrl ? (
      <a href={s.linkedinUrl} target="_blank" rel="noopener noreferrer"
        title={s.linkedinUrl}
        className="text-[#046BB1] hover:underline text-xs font-bold">in</a>
    ) : <span className="text-[#E8E4DF] text-xs">—</span>,
  },
  // Hidden by default but available via Columns toggle
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
    id: 'seniority', label: 'Seniority',
    cell: ({ s, bumpRow }) => (
      <EditableCell value={s.seniority || ''} rowId={s.id} field="seniority"
        placeholder="seniority" className="text-[12px] text-[#9C9C9C]"
        onSaved={(v) => { s.seniority = v; bumpRow() }} />
    ),
  },
  {
    id: 'score', label: 'Score', align: 'right',
    cell: ({ s }) => <span className="font-semibold tabular-nums text-[12px]">{s.score ?? '—'}</span>,
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

// Default-visible columns (the rest are hidden until user toggles them on)
const DEFAULT_VISIBLE_IDS = new Set([
  'select', 'enrich', 'date', 'source', 'utmSource', 'photo', 'name',
  'jobTitle', 'company', 'age', 'sex', 'email', 'linkedin', 'menu',
])

const DEFAULT_ORDER = COLUMNS.map(c => c.id)
const DEFAULT_VISIBLE = new Set(DEFAULT_VISIBLE_IDS)

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
  const router = useRouter()
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER)
  const [visible, setVisible] = useState<Set<string>>(DEFAULT_VISIBLE)
  const [lightboxId, setLightboxId] = useState<string | null>(null)
  const [busyProvider, setBusyProvider] = useState<{ id: string; provider: ProviderKey } | null>(null)
  const [providerResult, setProviderResult] = useState<Record<string, Record<ProviderKey, { status: string; linkedinUrl?: string } | undefined> | undefined>>({})
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSelected = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
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
      // Single ✨ Enrich button — always force-runs the v2 pipeline
      const res = await fetch('/api/admin/enrich/v2/row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, save: true, force: true }),
      })
      const data = await res.json()
      data.linkedinUrl = data.merged?.linkedinUrl
      data.photoUrl = data.merged?.photoUrl
      data.name = data.merged?.fullName
      data.jobTitle = data.merged?.jobTitle
      data.companyName = data.merged?.companyName
      const status = data.status || (res.ok ? 'partial' : 'failed')
      setProviderResult(prev => ({
        ...prev,
        [id]: { ...(prev[id] || {} as Record<ProviderKey, { status: string; linkedinUrl?: string } | undefined>), [provider]: { status, linkedinUrl: data.linkedinUrl } },
      }))
      // Live-update the row data the table is rendering
      const row = items.find(r => r.id === id)
      if (row) {
        if (data.linkedinUrl && !row.linkedinUrl) row.linkedinUrl = data.linkedinUrl
        if (data.photoUrl) row.photoUrl = data.photoUrl
        if (data.name && !row.name) row.name = data.name
        if (data.jobTitle && !row.jobTitle) row.jobTitle = data.jobTitle
        if (data.companyName && !row.companyName) row.companyName = data.companyName
        bumpRow()
      }
      // Pull fresh DB state so subsequent navigations show what was saved
      if (data.saveError) console.error('v2 save error:', data.saveError)
      if (data.fieldsUpdated?.length) console.log(`v2 saved fields for ${id}:`, data.fieldsUpdated)
      router.refresh()
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

  // Sequential bulk-enrich loop — fires v2+force for each selected row in turn.
  // Stops on first failure so the user can see what went wrong.
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  async function bulkEnrich() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`Enrich ${ids.length} selected row${ids.length === 1 ? '' : 's'}? Each call costs API credits.`)) return
    setBulkProgress({ done: 0, total: ids.length })
    for (let i = 0; i < ids.length; i++) {
      await runProvider(ids[i], 'v2')
      setBulkProgress({ done: i + 1, total: ids.length })
    }
    setBulkProgress(null)
    setSelected(new Set())
    router.refresh()
  }
  async function bulkDelete() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`Permanently delete ${ids.length} record${ids.length === 1 ? '' : 's'}?`)) return
    for (const id of ids) {
      await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' }).catch(() => {})
    }
    setRemovedIds(prev => { const next = new Set(prev); ids.forEach(i => next.add(i)); return next })
    setSelected(new Set())
  }

  const ctxBase = {
    busyProvider, providerResult, runProvider, deleteRow,
    openLightbox: setLightboxId, bumpRow,
    selected, toggleSelected,
  }

  const visibleItems = useMemo(() => items.filter(s => !removedIds.has(s.id)), [items, removedIds])

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E8E4DF] bg-[#FFFDFA]">
        {selected.size > 0 ? (
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#333333] font-bold">{selected.size} selected</span>
            {bulkProgress ? (
              <span className="text-[11px] text-[#9C9C9C]">Enriching {bulkProgress.done}/{bulkProgress.total}…</span>
            ) : (
              <>
                <button
                  onClick={bulkEnrich}
                  disabled={!!busyProvider}
                  className="h-7 px-3 rounded-md bg-[#333333] text-[#FFFDFA] text-[10px] font-bold uppercase tracking-wider whitespace-nowrap disabled:opacity-40 hover:opacity-90"
                >✨ Enrich selected</button>
                <button
                  onClick={bulkDelete}
                  className="h-7 px-3 rounded-md bg-white border border-[#FEE3E3] text-[#BE3B3B] text-[10px] font-bold uppercase tracking-wider hover:bg-[#FEE3E3]"
                >Delete selected</button>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-[11px] text-[#9C9C9C] hover:text-[#333333]"
                >Clear</button>
              </>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-[#9C9C9C]">Double-click any cell to edit · click a photo for cinema mode · select rows for bulk actions</p>
        )}
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
              {visibleColumns.map(c => {
                // Custom header for the "select" column → select-all checkbox
                if (c.id === 'select') {
                  const allSelected = visibleItems.length > 0 && visibleItems.every(item => selected.has(item.id))
                  const someSelected = visibleItems.some(item => selected.has(item.id))
                  return (
                    <th key={c.id} className="px-3 py-3 text-center" style={{ width: c.width }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = !allSelected && someSelected }}
                        onChange={() => {
                          if (allSelected) setSelected(new Set())
                          else setSelected(new Set(visibleItems.map(item => item.id)))
                        }}
                        className="w-3.5 h-3.5 accent-[#333333] cursor-pointer"
                      />
                    </th>
                  )
                }
                return (
                  <th key={c.id}
                    className={`px-3 py-3 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}
                    style={c.width ? { width: c.width } : undefined}>
                    {c.header ? c.header() : c.label}
                  </th>
                )
              })}
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

      <PhotoLightbox
        person={lightboxId
          ? (() => {
              const s = visibleItems.find(v => v.id === lightboxId)
              if (!s) return null
              const card: CardPerson = {
                id: s.id,
                name: s.name,
                email: s.email,
                photoUrl: s.photoUrl,
                title: s.jobTitle,
                company: s.companyName,
                companyIndustry: s.companyIndustry,
                linkedinUrl: s.linkedinUrl,
                country: s.country,
                city: s.city,
                ageBracket: s.ageBracket,
                ageAiEstimate: s.ageAiEstimate,
                sexAiEstimate: s.sexAiEstimate,
                source: s.source,
                score: s.score,
              }
              return card
            })()
          : null}
        allPeople={visibleItems.map((s): CardPerson => ({
          id: s.id, name: s.name, email: s.email, photoUrl: s.photoUrl,
          title: s.jobTitle, company: s.companyName, companyIndustry: s.companyIndustry,
          linkedinUrl: s.linkedinUrl, country: s.country, city: s.city,
          ageBracket: s.ageBracket, ageAiEstimate: s.ageAiEstimate,
          sexAiEstimate: s.sexAiEstimate, source: s.source, score: s.score,
        }))}
        onChange={(next) => setLightboxId(next.id || null)}
        onClose={() => setLightboxId(null)}
      />
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
