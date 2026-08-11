'use client'

// The column control, folded into one small button.
//
// It used to be a strip of instructions and chips sitting above every table,
// which cost two lines of the screen on a page whose whole point is dense
// numbers. Now it is a "Columns" button: hover it for what it does, click it
// for the list. Dragging the headers still works exactly as before, this is
// just the tidy way to remove and restore.

import { useEffect, useRef, useState } from 'react'

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const GREEN = '#2E7D32'

export default function ColumnsMenu({
  all, hidden, onHide, onShow, onReset, status,
}: {
  all: { key: string; label: string }[]
  hidden: Set<string>
  onHide: (k: string) => void
  onShow: (k: string) => void
  onReset: () => void
  status: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  return (
    <span ref={box} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        title="Choose which columns to show. Drag a header to reorder. Your layout saves to your account."
        style={{
          padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          border: `2px solid ${open ? INK : HAIR}`, background: '#FFFDFA', color: open ? INK : MUTE,
        }}>
        Columns{hidden.size > 0 ? ` (${all.length - hidden.size}/${all.length})` : ''} ▾
      </button>
      {status && (
        <span style={{ marginLeft: 7, fontSize: 11, fontWeight: 700, color: status.includes('NOT') ? '#B00020' : GREEN }}>{status}</span>
      )}
      {open && (
        <div style={{
          position: 'absolute', zIndex: 40, top: '110%', left: 0, minWidth: 210,
          border: `2px solid ${INK}`, background: '#FFFDFA', padding: '8px 10px',
          boxShadow: `4px 5px 0 ${INK}`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTE, marginBottom: 6 }}>
            Show columns
          </div>
          {all.map(c => {
            const on = !hidden.has(c.key)
            return (
              <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '3px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => (on ? onHide(c.key) : onShow(c.key))} />
                <span style={{ color: on ? INK : MUTE, fontWeight: on ? 600 : 400 }}>{c.label}</span>
              </label>
            )
          })}
          <button type="button" onClick={() => { onReset(); setOpen(false) }}
            style={{ marginTop: 8, width: '100%', padding: '4px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `2px solid ${HAIR}`, background: '#FFFDFA', color: MUTE }}>
            reset to default
          </button>
        </div>
      )}
    </span>
  )
}
