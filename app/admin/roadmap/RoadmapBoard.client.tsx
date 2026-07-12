'use client'

import { useMemo, useState } from 'react'
import {
  ROADMAP_PHASES,
  ROADMAP_STATUSES,
  type RoadmapStatus,
  type RoadmapTask,
} from '@/lib/roadmap'

// ── Roadmap kanban (source of truth) ──────────────────────────────────
// Same visual language as the people Board: warm paper columns, white
// cards. Cards drag between columns (PUT), each column quick-adds (POST),
// an expanded card offers a status select (mobile fallback) and delete.

const STATUS_COLORS: Record<RoadmapStatus, string> = {
  backlog: '#9C9C9C',
  next: '#E7B02F',
  in_progress: '#E48715',
  waiting_owner: '#BE593B',
  done: '#2E7D32',
  parked: '#C4BDB2',
}

function fmtDay(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function phaseDef(phase: string) {
  return ROADMAP_PHASES[phase] || { label: phase, color: '#9C9C9C' }
}

function Card({
  t,
  expanded,
  onToggle,
  onDragStart,
  onSetStatus,
  onDelete,
  busy,
}: {
  t: RoadmapTask
  expanded: boolean
  onToggle: () => void
  onDragStart: (e: React.DragEvent) => void
  onSetStatus: (s: RoadmapStatus) => void
  onDelete: () => void
  busy: boolean
}) {
  const ph = phaseDef(t.phase)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onToggle}
      className="cursor-pointer"
      style={{
        background: '#FFFFFF',
        border: '1px solid #E8E4DF',
        borderRadius: 7,
        padding: '10px 11px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        opacity: busy ? 0.55 : 1,
      }}
    >
      {/* chips row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1" style={{ fontSize: 10, fontWeight: 700, color: ph.color }}>
          <span style={{ width: 6, height: 6, borderRadius: 2, background: ph.color }} />
          {ph.label}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          {t.status === 'done' && t.shippedAt && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#2E7D32' }}>✓ {fmtDay(t.shippedAt)}</span>
          )}
          <span
            title={t.assignee === 'owner' ? 'On you' : 'On Claude'}
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 8,
              background: t.assignee === 'owner' ? '#FEF7E7' : '#F4F1EB',
              color: t.assignee === 'owner' ? '#BE593B' : '#6B6B6B',
              border: `1px solid ${t.assignee === 'owner' ? '#E4871540' : '#E8E4DF'}`,
            }}
          >
            {t.assignee === 'owner' ? '👤 You' : '🤖 Claude'}
          </span>
        </span>
      </div>

      <p className="mt-1.5" style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', lineHeight: 1.3 }}>{t.title}</p>

      {t.description && (
        <p
          className="mt-1"
          style={
            expanded
              ? { fontSize: 11.5, lineHeight: 1.45, color: '#6B6B6B' }
              : { fontSize: 11.5, lineHeight: 1.45, color: '#6B6B6B', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
          }
        >
          {t.description}
        </p>
      )}

      {t.notes && (
        <p
          className="mt-1"
          style={
            expanded
              ? { fontSize: 10.5, lineHeight: 1.4, color: '#9C9C9C', fontStyle: 'italic' }
              : { fontSize: 10.5, lineHeight: 1.4, color: '#9C9C9C', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
          }
        >
          {t.notes}
        </p>
      )}

      {t.links.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {t.links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 10.5, fontWeight: 600, color: '#046BB1', textDecoration: 'none' }}
              className="hover:underline"
            >
              {l.label} ↗
            </a>
          ))}
        </div>
      )}

      {expanded && (
        <div className="mt-2.5 flex items-center gap-2" onClick={e => e.stopPropagation()} style={{ borderTop: '1px solid #F4F0E9', paddingTop: 8 }}>
          <select
            value={t.status}
            disabled={busy}
            onChange={e => onSetStatus(e.target.value as RoadmapStatus)}
            style={{ fontSize: 11, fontWeight: 600, color: '#333333', border: '1px solid #E8E4DF', borderRadius: 4, padding: '3px 5px', background: '#FAF7F1' }}
          >
            {ROADMAP_STATUSES.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <button
            disabled={busy}
            onClick={onDelete}
            title="Delete card"
            className="ml-auto hover:text-[#BE3B3B]"
            style={{ fontSize: 11, fontWeight: 600, color: '#9C9C9C', padding: '3px 4px' }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default function RoadmapBoard({ initialTasks }: { initialTasks: RoadmapTask[] }) {
  const [tasks, setTasks] = useState<RoadmapTask[]>(initialTasks)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dropCol, setDropCol] = useState<RoadmapStatus | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [addingCol, setAddingCol] = useState<RoadmapStatus | null>(null)
  const [addTitle, setAddTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const byStatus = useMemo(() => {
    const m = new Map<RoadmapStatus, RoadmapTask[]>()
    for (const s of ROADMAP_STATUSES) m.set(s.key, [])
    for (const t of tasks) m.get(t.status)?.push(t)
    for (const s of ROADMAP_STATUSES) {
      const arr = m.get(s.key)!
      if (s.key === 'done') {
        arr.sort((a, b) => (b.shippedAt || b.updatedAt).localeCompare(a.shippedAt || a.updatedAt))
      } else {
        arr.sort((a, b) => a.sort - b.sort || a.createdAt.localeCompare(b.createdAt))
      }
    }
    return m
  }, [tasks])

  const fail = (msg: string) => {
    setError(msg)
    setTimeout(() => setError(null), 5000)
  }

  const moveTask = async (id: string, status: RoadmapStatus) => {
    const prev = tasks
    const cur = tasks.find(t => t.id === id)
    if (!cur || cur.status === status) return
    setBusyId(id)
    setTasks(ts => ts.map(t => (t.id === id ? { ...t, status } : t)))
    try {
      const res = await fetch('/api/admin/roadmap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      if (body.task) setTasks(ts => ts.map(t => (t.id === id ? body.task : t)))
    } catch (e) {
      setTasks(prev)
      fail(`Move failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusyId(null)
    }
  }

  const addTask = async (status: RoadmapStatus) => {
    const title = addTitle.trim()
    if (!title) return
    setAddTitle('')
    setAddingCol(null)
    try {
      const res = await fetch('/api/admin/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, status, phase: 'OPS', assignee: 'claude' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      if (body.task) setTasks(ts => [...ts, body.task])
    } catch (e) {
      fail(`Add failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const deleteTask = async (id: string) => {
    if (!window.confirm('Delete this card?')) return
    const prev = tasks
    setTasks(ts => ts.filter(t => t.id !== id))
    try {
      const res = await fetch(`/api/admin/roadmap?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
    } catch (e) {
      setTasks(prev)
      fail(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3" style={{ fontSize: 12.5, fontWeight: 600, color: '#BE3B3B' }}>{error}</p>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'thin' }}>
        {ROADMAP_STATUSES.map(s => {
          const cards = byStatus.get(s.key) || []
          const highlight = dropCol === s.key
          return (
            <div key={s.key} className="shrink-0" style={{ width: 264 }}>
              {/* Column header */}
              <div className="flex items-center gap-2 mb-2.5" style={{ padding: '0 2px' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: STATUS_COLORS[s.key] }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1A1A' }}>{s.label}</span>
                <span className="ml-auto" style={{ fontSize: 11.5, fontWeight: 600, color: '#9C9C9C', fontVariantNumeric: 'tabular-nums' }}>{cards.length}</span>
              </div>

              {/* Drop zone + cards */}
              <div
                onDragOver={e => { e.preventDefault(); setDropCol(s.key) }}
                onDragLeave={() => setDropCol(c => (c === s.key ? null : c))}
                onDrop={e => {
                  e.preventDefault()
                  setDropCol(null)
                  const id = e.dataTransfer.getData('text/plain')
                  if (id) moveTask(id, s.key)
                }}
                className="flex flex-col gap-2 rounded-lg"
                style={{
                  background: highlight ? '#F3EDE0' : '#FAF7F1',
                  border: `1px ${highlight ? 'dashed #E48715' : 'solid #EFEAE1'}`,
                  padding: 8,
                  minHeight: 140,
                  transition: 'background .12s',
                }}
              >
                {cards.length === 0 && addingCol !== s.key && (
                  <p style={{ fontSize: 11.5, color: '#C4BDB2', textAlign: 'center', padding: '16px 0 4px' }}>Empty</p>
                )}
                {cards.map(t => (
                  <Card
                    key={t.id}
                    t={t}
                    busy={busyId === t.id}
                    expanded={expandedId === t.id}
                    onToggle={() => setExpandedId(cur => (cur === t.id ? null : t.id))}
                    onDragStart={e => e.dataTransfer.setData('text/plain', t.id)}
                    onSetStatus={st => moveTask(t.id, st)}
                    onDelete={() => deleteTask(t.id)}
                  />
                ))}

                {/* Quick add */}
                {addingCol === s.key ? (
                  <input
                    autoFocus
                    value={addTitle}
                    onChange={e => setAddTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addTask(s.key)
                      if (e.key === 'Escape') { setAddingCol(null); setAddTitle('') }
                    }}
                    onBlur={() => { if (!addTitle.trim()) setAddingCol(null) }}
                    placeholder="Card title, Enter to add"
                    style={{ fontSize: 12, padding: '8px 10px', border: '1px solid #E8E4DF', borderRadius: 7, background: '#FFFFFF', color: '#1A1A1A', outline: 'none' }}
                  />
                ) : (
                  <button
                    onClick={() => { setAddingCol(s.key); setAddTitle('') }}
                    className="hover:text-[#333333] hover:bg-[#F3EDE0] rounded-md"
                    style={{ fontSize: 11.5, fontWeight: 600, color: '#9C9C9C', padding: '6px 8px', textAlign: 'left' }}
                  >
                    + Add card
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
