'use client'

// Revenue recovery — kanban, not a table.
//
// Owner, 2026-08-20: "like a table like this will be impossible to manage...
// should we keep a kanban... i need supervision as we scale through this."
//
// READ-ONLY, unlike the roadmap board it borrows its look from. A roadmap
// card's column is an editorial decision — someone drags it to say "this is
// now in progress." A person's column here is not a decision, it is a FACT
// already sitting in the database: how many sequence emails actually sent,
// whether they actually paid. Dragging a card would let the board say
// something the ledger does not back up, which is the exact failure mode
// this whole system exists to prevent. So the board reads state, same as
// the page around it — nothing here writes.

import { useState } from 'react'

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const GREEN = '#2E7D32'
const AMBER = '#B26A00'

export interface OutreachCard {
  person_key: string
  source: string
  reason: string
  cohort: string
  moved_at: string
  stage_reached: number | null
  last_sent_at: string | null
  emails_sent: number
  paid_since_graduating: boolean
}

type ColumnKey = 'not_started' | 'stage_1' | 'stage_2' | 'stage_3' | 'paid'

const COLUMNS: { key: ColumnKey; label: string; color: string }[] = [
  { key: 'not_started', label: 'Not started', color: MUTE },
  { key: 'stage_1', label: 'Stage 1 sent', color: AMBER },
  { key: 'stage_2', label: 'Stage 2 sent', color: AMBER },
  { key: 'stage_3', label: 'Stage 3+ sent', color: '#BE593B' },
  { key: 'paid', label: 'Paid', color: GREEN },
]

function columnFor(c: OutreachCard): ColumnKey {
  // Paid wins regardless of stage — it is the one terminal fact that ends
  // the sequence, whatever stage it happened at.
  if (c.paid_since_graduating) return 'paid'
  if (!c.emails_sent) return 'not_started'
  if ((c.stage_reached ?? 0) >= 3) return 'stage_3'
  if (c.stage_reached === 2) return 'stage_2'
  return 'stage_1'
}

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')

function Card({ c }: { c: OutreachCard }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      onClick={() => setOpen(o => !o)}
      className="cursor-pointer"
      style={{ background: '#FFFFFF', border: '1px solid #E8E4DF', borderRadius: 7, padding: '9px 10px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span style={{ fontSize: 12, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.person_key}
        </span>
        {c.emails_sent > 0 && (
          <span style={{ fontSize: 9.5, fontWeight: 700, color: MUTE, whiteSpace: 'nowrap' }}>{c.emails_sent}×</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: MUTE, marginTop: 2 }}>
        {c.last_sent_at ? `last sent ${day(c.last_sent_at)}` : `moved ${day(c.moved_at)}`}
      </div>
      {open && (
        <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid #F0ECE5', fontSize: 10.5, color: MUTE, lineHeight: 1.6 }}>
          <div><strong style={{ color: INK }}>Cohort</strong> {c.cohort}</div>
          <div><strong style={{ color: INK }}>Reason</strong> {c.reason.replace(/_/g, ' ')}</div>
          <div><strong style={{ color: INK }}>Source</strong> {c.source}</div>
          <a href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(c.person_key)}`}
             target="_blank" rel="noreferrer" style={{ color: '#0A66C2', fontWeight: 700 }} onClick={e => e.stopPropagation()}>
            Stripe search ↗
          </a>
        </div>
      )}
    </div>
  )
}

export default function OutreachBoard({ cards }: { cards: OutreachCard[] }) {
  const byColumn = new Map<ColumnKey, OutreachCard[]>()
  for (const col of COLUMNS) byColumn.set(col.key, [])
  for (const c of cards) byColumn.get(columnFor(c))!.push(c)

  return (
    <div className="flex gap-3" style={{ overflowX: 'auto', paddingBottom: 8 }}>
      {COLUMNS.map(col => {
        const list = byColumn.get(col.key) ?? []
        return (
          <div key={col.key} style={{ flex: '0 0 240px', minWidth: 240 }}>
            <div className="flex items-center gap-1.5" style={{ padding: '2px 2px 8px' }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: col.color }} />
              <strong style={{ fontSize: 11.5, color: INK }}>{col.label}</strong>
              <span style={{ fontSize: 11, color: MUTE, marginLeft: 'auto' }}>{list.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#FAF7F1', border: '1px solid #EFE9E0', borderRadius: 8, padding: 6, minHeight: 60 }}>
              {list.length === 0
                ? <p style={{ fontSize: 10.5, color: MUTE, padding: '4px 4px' }}>—</p>
                : list.map(c => <Card key={c.person_key} c={c} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
