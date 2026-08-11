'use client'

// The trials table: the owner's spreadsheet, live.
//
// COLUMNS are the thing you arrange here, not rows. Drag a header to move the
// column, click its × to remove it, and the layout saves to app_settings so it
// follows you to another machine instead of living in one browser. Removed
// columns sit underneath as chips and come back with a click; "reset" restores
// the original order.
//
// The rows themselves sort by date (newest or oldest first) — an explicit,
// reproducible order, so two people reading the same filter see the same list.

import { useState } from 'react'
import TrialState from './TrialState.client'
import { fmtDay } from '@/lib/dates'

export interface TrialRow {
  charge_id: string
  person_key: string
  customer_id: string | null
  name: string | null
  country: string | null
  utm_source: string | null
  trial_at: string
  trial_cents: number
  era: number
  attribution: string
  converted: boolean
  converted_at: string | null
  converted_cents: number | null
  gross_cents: number
  lifetime_bundle: boolean
  derivedState: string
  derivedLabel: string
  derivedColor: string
  override: string | null
}

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const GREEN = '#2E7D32'
const AMBER = '#B26A00'

const ATTR_LABEL: Record<string, string> = {
  quiz_net_new: 'Quiz, new customer',
  quiz_existing: 'Quiz, existing customer',
  not_quiz: 'Not from the quiz',
}

const STRIPE_ACCT = 'acct_1O98fMBLsgHOvWxy'
const stripeCustomer = (cus: string) => `https://dashboard.stripe.com/${STRIPE_ACCT}/customers/${cus}`
const stripeNewSub = (cus: string) => `${stripeCustomer(cus)}?create=subscription&subscription_default_customer=${cus}`

type Col = {
  key: string
  label: string
  align: 'left' | 'right'
  cell: (r: TrialRow) => React.ReactNode
}

const ALL_COLUMNS: Col[] = [
  { key: 'trial_date', label: 'Trial date', align: 'left',
    cell: r => <span style={{ color: MUTE, whiteSpace: 'nowrap' }}>{fmtDay(r.trial_at)}<span title={`Pricing era ${r.era}`} style={{ marginLeft: 5, fontSize: 9.5 }}>e{r.era}</span></span> },
  { key: 'email', label: 'Email', align: 'left', cell: r => r.person_key },
  { key: 'name', label: 'Name', align: 'left', cell: r => <span style={{ fontWeight: 700 }}>{r.name || '–'}</span> },
  { key: 'status', label: 'Status', align: 'left',
    cell: r => <TrialState chargeId={r.charge_id} derived={r.derivedState} derivedLabel={r.derivedLabel} derivedColor={r.derivedColor} initial={r.override} /> },
  { key: 'channel', label: 'Channel', align: 'left',
    cell: r => <span style={{ fontSize: 11.5, color: r.attribution === 'not_quiz' ? MUTE : GREEN, fontWeight: r.attribution === 'not_quiz' ? 400 : 700 }}>{ATTR_LABEL[r.attribution] ?? r.attribution}</span> },
  { key: 'utm', label: 'UTM source', align: 'left', cell: r => <span style={{ fontSize: 11.5, color: MUTE }}>{r.utm_source || '–'}</span> },
  { key: 'country', label: 'Country', align: 'left', cell: r => <span style={{ fontSize: 11.5, color: MUTE }}>{r.country || '–'}</span> },
  { key: 'payment1', label: 'Payment 1', align: 'right',
    cell: r => <>${(r.trial_cents / 100).toFixed(2)}{r.lifetime_bundle && <span title="One $54.74 charge: the $4.99 trial and the $49.75 lifetime together" style={{ marginLeft: 4, color: AMBER, fontWeight: 700 }}>+LT</span>}</> },
  { key: 'paid2on', label: 'Paid 2 on', align: 'left', cell: r => <span style={{ color: MUTE, whiteSpace: 'nowrap' }}>{r.converted_at ? fmtDay(r.converted_at) : '–'}</span> },
  { key: 'payment2', label: 'Payment 2', align: 'right',
    cell: r => (r.converted ? `$${((r.lifetime_bundle ? 4975 : (r.converted_cents ?? 0)) / 100).toFixed(2)}` : '–') },
  { key: 'total', label: 'Total', align: 'right', cell: r => <span style={{ fontWeight: 700 }}>${(r.gross_cents / 100).toFixed(2)}</span> },
  { key: 'stripe', label: 'Stripe', align: 'left',
    cell: r => r.customer_id ? (
      <span style={{ whiteSpace: 'nowrap' }}>
        <a href={stripeCustomer(r.customer_id)} target="_blank" rel="noopener noreferrer" title={`Open ${r.customer_id} in Stripe`}
           style={{ fontSize: 11.5, fontWeight: 700, color: INK, textDecoration: 'underline' }}>profile</a>
        <span style={{ color: HAIR, margin: '0 5px' }}>|</span>
        <a href={stripeNewSub(r.customer_id)} target="_blank" rel="noopener noreferrer"
           title="Open Stripe with the create-subscription panel, this customer preselected"
           style={{ fontSize: 11.5, fontWeight: 700, color: GREEN, textDecoration: 'underline' }}>+ sub</a>
      </span>
    ) : <span style={{ color: MUTE, fontSize: 11 }}>–</span> },
]

const DEFAULT_ORDER = ALL_COLUMNS.map(c => c.key)

const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, padding: '7px 8px' }
const td: React.CSSProperties = { fontSize: 12, padding: '7px 8px', fontVariantNumeric: 'tabular-nums' }

export default function TrialsTable({
  rows, initialOrder, initialHidden,
}: {
  rows: TrialRow[]
  initialOrder: string[] | null
  initialHidden: string[] | null
}) {
  // Any column added to the code later must still appear, even for someone
  // with a saved layout from before it existed — hence the concat of unknowns.
  const saved = (initialOrder ?? []).filter(k => DEFAULT_ORDER.includes(k))
  const [order, setOrder] = useState<string[]>([...saved, ...DEFAULT_ORDER.filter(k => !saved.includes(k))])
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden ?? []))
  const [sort, setSort] = useState<'desc' | 'asc'>('desc')
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  const visible = order.filter(k => !hidden.has(k)).map(k => ALL_COLUMNS.find(c => c.key === k)!).filter(Boolean)
  const view = [...rows].sort((a, b) => (sort === 'asc' ? a.trial_at.localeCompare(b.trial_at) : b.trial_at.localeCompare(a.trial_at)))

  const save = async (nextOrder: string[], nextHidden: Set<string>) => {
    setStatus('saving…')
    try {
      const res = await fetch('/api/admin/table-layout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'revenue_trials', order: nextOrder, hidden: Array.from(nextHidden) }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setStatus('layout saved')
      setTimeout(() => setStatus(''), 1800)
    } catch {
      setStatus('NOT saved, try again')
    }
  }

  const drop = (onKey: string) => {
    if (!drag || drag === onKey) { setDrag(null); setOver(null); return }
    const next = [...order]
    next.splice(next.indexOf(drag), 1)
    next.splice(next.indexOf(onKey), 0, drag)
    setOrder(next); setDrag(null); setOver(null)
    void save(next, hidden)
  }

  const hide = (key: string) => {
    const next = new Set(hidden); next.add(key)
    setHidden(next); void save(order, next)
  }
  const show = (key: string) => {
    const next = new Set(hidden); next.delete(key)
    setHidden(next); void save(order, next)
  }
  const reset = async () => {
    setOrder(DEFAULT_ORDER); setHidden(new Set())
    setStatus('saving…')
    try {
      await fetch('/api/admin/table-layout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'revenue_trials', reset: true }),
      })
      setStatus('layout reset')
      setTimeout(() => setStatus(''), 1800)
    } catch { setStatus('NOT saved, try again') }
  }

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${INK}`, background: active ? INK : '#FFFDFA', color: active ? '#FEF7E7' : INK,
  })

  return (
    <>
      <div className="flex items-center flex-wrap" style={{ gap: 7, marginTop: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: MUTE, fontWeight: 700 }}>Rows:</span>
        <button type="button" onClick={() => setSort('desc')} style={btn(sort === 'desc')}>Date ↓ newest</button>
        <button type="button" onClick={() => setSort('asc')} style={btn(sort === 'asc')}>Date ↑ oldest</button>
        <span style={{ width: 10 }} />
        <span style={{ fontSize: 11, color: MUTE, fontWeight: 700 }}>Columns: drag a header to move it, × to remove it</span>
        <button type="button" onClick={reset} style={{ padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `2px solid ${HAIR}`, background: '#FFFDFA', color: MUTE }}>
          reset columns
        </button>
        {status && <span style={{ fontSize: 11, fontWeight: 700, color: status.includes('NOT') ? '#B00020' : GREEN }}>{status}</span>}
      </div>

      {hidden.size > 0 && (
        <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: MUTE, fontWeight: 700 }}>Removed:</span>
          {Array.from(hidden).map(k => {
            const col = ALL_COLUMNS.find(c => c.key === k)
            if (!col) return null
            return (
              <button key={k} type="button" onClick={() => show(k)}
                style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `2px dashed ${MUTE}`, background: '#FFFDFA', color: MUTE }}
                title="Put this column back">+ {col.label}</button>
            )
          })}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${INK}` }}>
            {visible.map(c => (
              <th key={c.key}
                  draggable
                  onDragStart={() => setDrag(c.key)}
                  onDragOver={e => { e.preventDefault(); setOver(c.key) }}
                  onDrop={() => drop(c.key)}
                  onDragEnd={() => { setDrag(null); setOver(null) }}
                  style={{
                    ...th, textAlign: c.align, cursor: 'grab', userSelect: 'none',
                    background: over === c.key && drag ? '#FEF7E7' : undefined,
                    opacity: drag === c.key ? 0.45 : 1,
                    whiteSpace: 'nowrap',
                  }}
                  title="Drag to reorder">
                <span style={{ marginRight: 4, color: HAIR }}>⠿</span>
                {c.label}
                <button type="button" onClick={() => hide(c.key)}
                        title={`Remove the ${c.label} column`}
                        style={{ marginLeft: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: MUTE, fontSize: 12, fontWeight: 700, padding: 0 }}>×</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.map(r => (
            <tr key={r.charge_id} style={{ borderBottom: `1px solid ${HAIR}` }}>
              {visible.map(c => (
                <td key={c.key} style={{ ...td, textAlign: c.align }}>{c.cell(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
