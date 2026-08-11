'use client'

// Table 2: the months, with the same column controls as the trials table.
// Drag a header to move it, × to remove it, the layout saves to the account.
//
// The totals row is pinned to the bottom and follows the same columns, so a
// removed column disappears from both the body and the total rather than
// leaving a stray number under an empty heading.

import { useState } from 'react'
import { fmtMonth } from '@/lib/dates'
import { useColumnLayout } from './useColumnLayout'

export interface MonthRow {
  month: string
  era: number
  trials: number
  quiz: number
  due: number
  converted: number
  trialCash: number
  convCash: number
  sheet: number | null
}
export interface MonthTotals {
  trials: number; quiz: number; due: number; converted: number
  trialCash: number; convCash: number; sheet: number
}

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const LATTE = '#FEF7E7'
const GREEN = '#2E7D32'
const AMBER = '#B26A00'
const RED = '#B00020'

const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`
const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '–')

type Col = {
  key: string; label: string; align: 'left' | 'right'
  cell: (r: MonthRow) => React.ReactNode
  total: (t: MonthTotals) => React.ReactNode
}

const COLUMNS: Col[] = [
  { key: 'month', label: 'Month', align: 'left',
    cell: r => <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtMonth(r.month)}</span>,
    total: () => <span style={{ fontWeight: 800 }}>All time</span> },
  { key: 'era', label: 'Era', align: 'right', cell: r => <span style={{ color: MUTE }}>{r.era}</span>, total: () => null },
  { key: 'trials', label: 'Trials', align: 'right',
    cell: r => <span style={{ fontWeight: 700 }}>{r.trials}</span>,
    total: t => <span style={{ fontWeight: 800 }}>{t.trials.toLocaleString()}</span> },
  { key: 'quiz', label: 'From quiz', align: 'right',
    cell: r => <span style={{ color: r.quiz > 0 ? GREEN : MUTE, fontWeight: r.quiz > 0 ? 700 : 400 }}>{r.quiz || '–'}</span>,
    total: t => <span style={{ fontWeight: 800, color: GREEN }}>{t.quiz.toLocaleString()}</span> },
  { key: 'due', label: 'Due', align: 'right',
    cell: r => <span style={{ color: MUTE }}>{r.due}</span>,
    total: t => <span style={{ color: MUTE }}>{t.due.toLocaleString()}</span> },
  { key: 'converted', label: 'Converted', align: 'right',
    cell: r => r.converted,
    total: t => <span style={{ fontWeight: 800 }}>{t.converted.toLocaleString()}</span> },
  { key: 'rate', label: 'Rate', align: 'right',
    cell: r => <span style={{ fontWeight: 700 }}>{r.due > 0 ? pct(r.converted, r.due) : '–'}</span>,
    total: t => <span style={{ fontWeight: 800 }}>{pct(t.converted, t.due)}</span> },
  { key: 'trialCash', label: 'Trial cash', align: 'right',
    cell: r => usd0(r.trialCash),
    total: t => <span style={{ fontWeight: 800 }}>{usd0(t.trialCash)}</span> },
  { key: 'convCash', label: 'Conversion cash', align: 'right',
    cell: r => usd0(r.convCash),
    total: t => <span style={{ fontWeight: 800 }}>{usd0(t.convCash)}</span> },
  { key: 'sheet', label: 'Your sheet', align: 'right',
    cell: r => {
      if (r.sheet === null) return <span style={{ color: MUTE }}>–</span>
      const diff = r.trials - r.sheet
      const color = diff === 0 ? GREEN : Math.abs(diff) <= 3 ? AMBER : RED
      return <span style={{ color }}>{r.sheet}{diff === 0 ? ' ✓' : ` (${diff > 0 ? '+' : ''}${diff})`}</span>
    },
    total: t => <span style={{ color: MUTE }}>{t.sheet.toLocaleString()}</span> },
]

const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, padding: '7px 8px', whiteSpace: 'nowrap' }
// One line per row, always.
const td: React.CSSProperties = { fontSize: 12, padding: '7px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

export default function MonthsTable({
  rows, totals, initialOrder, initialHidden,
}: {
  rows: MonthRow[]; totals: MonthTotals
  initialOrder: string[] | null; initialHidden: string[] | null
}) {
  const L = useColumnLayout({
    tableKey: 'revenue_months',
    all: COLUMNS.map(c => ({ key: c.key, label: c.label })),
    initialOrder, initialHidden,
  })
  const [sort, setSort] = useState<'desc' | 'asc'>('desc')
  const visible = L.visibleKeys.map(k => COLUMNS.find(c => c.key === k)!).filter(Boolean)
  const view = [...rows].sort((a, b) => (sort === 'asc' ? a.month.localeCompare(b.month) : b.month.localeCompare(a.month)))

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${INK}`, background: active ? INK : '#FFFDFA', color: active ? LATTE : INK,
  })

  return (
    <>
      <div className="flex items-center flex-wrap" style={{ gap: 7, marginTop: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: MUTE, fontWeight: 700 }}>Months:</span>
        <button type="button" onClick={() => setSort('desc')} style={btn(sort === 'desc')}>Newest first</button>
        <button type="button" onClick={() => setSort('asc')} style={btn(sort === 'asc')}>Oldest first</button>
        <span style={{ width: 10 }} />
        <span style={{ fontSize: 11, color: MUTE, fontWeight: 700 }}>Columns: drag a header to move it, × to remove it</span>
        <button type="button" onClick={L.reset}
          style={{ padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `2px solid ${HAIR}`, background: '#FFFDFA', color: MUTE }}>
          reset columns
        </button>
        {L.status && <span style={{ fontSize: 11, fontWeight: 700, color: L.status.includes('NOT') ? RED : GREEN }}>{L.status}</span>}
      </div>

      {L.hidden.size > 0 && (
        <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: MUTE, fontWeight: 700 }}>Removed:</span>
          {Array.from(L.hidden).map(k => {
            const col = COLUMNS.find(c => c.key === k)
            if (!col) return null
            return (
              <button key={k} type="button" onClick={() => L.show(k)}
                style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `2px dashed ${MUTE}`, background: '#FFFDFA', color: MUTE }}
                title="Put this column back">+ {col.label}</button>
            )
          })}
        </div>
      )}

      {/* Cells never wrap, so the table scrolls sideways instead of
          growing a second line per row. */}
      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${INK}` }}>
            {visible.map(c => (
              <th key={c.key} {...L.headerProps(c.key)} style={{ ...th, textAlign: c.align, ...L.headerStyle(c.key) }}>
                <span style={{ marginRight: 4, color: HAIR }}>⠿</span>
                {c.label}
                <button type="button" onClick={() => L.hide(c.key)} title={`Remove the ${c.label} column`}
                  style={{ marginLeft: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: MUTE, fontSize: 12, fontWeight: 700, padding: 0 }}>×</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.map(r => (
            <tr key={r.month} style={{ borderBottom: `1px solid ${HAIR}` }}>
              {visible.map(c => <td key={c.key} style={{ ...td, textAlign: c.align }}>{c.cell(r)}</td>)}
            </tr>
          ))}
          {/* Totals. Rate here is converted ÷ due across every month, NOT an
              average of monthly rates — averaging would weight a 4-trial month
              like a 100-trial one. */}
          <tr style={{ borderTop: `2px solid ${INK}`, background: LATTE }}>
            {visible.map(c => <td key={c.key} style={{ ...td, textAlign: c.align }}>{c.total(totals)}</td>)}
          </tr>
        </tbody>
      </table>
      </div>
    </>
  )
}
