'use client'

// Draggable, removable, savable table columns — the behaviour, once.
//
// Two tables on /admin/revenue need identical column controls, and this
// project has been bitten repeatedly by the same logic living in two places
// and drifting (two Supabase clients, two renewal-rate calculations, two
// PostHog readers). So the behaviour lives here and each table only supplies
// its own columns.
//
// The layout is saved server-side per table key, not in localStorage, so it
// follows the owner to another machine.

import { useState } from 'react'

export interface LayoutCol { key: string; label: string }

export function useColumnLayout(opts: {
  tableKey: string
  all: LayoutCol[]
  initialOrder: string[] | null
  initialHidden: string[] | null
  /** The view the owner asked for, used when nothing is saved yet and when he
   *  hits reset. Falls back to every column in declaration order. */
  defaultOrder?: string[]
  defaultHidden?: string[]
}) {
  const declared = opts.all.map(c => c.key)
  const defaultOrder = opts.defaultOrder
    ? [...opts.defaultOrder.filter(k => declared.includes(k)), ...declared.filter(k => !opts.defaultOrder!.includes(k))]
    : declared
  const defaultHidden = opts.defaultHidden ?? []
  // A column added to the code LATER must still appear for someone holding an
  // older saved layout, so unknown keys are appended rather than dropped.
  const saved = (opts.initialOrder ?? []).filter(k => defaultOrder.includes(k))
  const [order, setOrder] = useState<string[]>([...saved, ...defaultOrder.filter(k => !saved.includes(k))])
  const [hidden, setHidden] = useState<Set<string>>(new Set(opts.initialHidden ?? defaultHidden))
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  const save = async (nextOrder: string[], nextHidden: Set<string>) => {
    setStatus('saving…')
    try {
      const res = await fetch('/api/admin/table-layout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: opts.tableKey, order: nextOrder, hidden: Array.from(nextHidden) }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setStatus('layout saved')
      setTimeout(() => setStatus(''), 1800)
    } catch {
      setStatus('NOT saved, try again')
    }
  }

  const onDrop = (onKey: string) => {
    if (!drag || drag === onKey) { setDrag(null); setOver(null); return }
    const next = [...order]
    next.splice(next.indexOf(drag), 1)
    next.splice(next.indexOf(onKey), 0, drag)
    setOrder(next); setDrag(null); setOver(null)
    void save(next, hidden)
  }
  const hide = (key: string) => { const n = new Set(hidden); n.add(key); setHidden(n); void save(order, n) }
  const show = (key: string) => { const n = new Set(hidden); n.delete(key); setHidden(n); void save(order, n) }
  const reset = async () => {
    setOrder(defaultOrder); setHidden(new Set(defaultHidden))
    setStatus('saving…')
    try {
      await fetch('/api/admin/table-layout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: opts.tableKey, reset: true }),
      })
      setStatus('layout reset'); setTimeout(() => setStatus(''), 1800)
    } catch { setStatus('NOT saved, try again') }
  }

  const visibleKeys = order.filter(k => !hidden.has(k))

  /** Spread onto a <th> to make it draggable and droppable. */
  const headerProps = (key: string) => ({
    draggable: true,
    onDragStart: () => setDrag(key),
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(key) },
    onDrop: () => onDrop(key),
    onDragEnd: () => { setDrag(null); setOver(null) },
    title: 'Drag to reorder',
  })
  /** Visual state for a header while dragging. */
  const headerStyle = (key: string): React.CSSProperties => ({
    cursor: 'grab', userSelect: 'none', whiteSpace: 'nowrap',
    background: over === key && drag ? '#FEF7E7' : undefined,
    opacity: drag === key ? 0.45 : 1,
  })

  return { order, hidden, visibleKeys, headerProps, headerStyle, hide, show, reset, status }
}
