'use client'

// The trials table: the owner's spreadsheet, live.
//
// Two things it does that a server-rendered table cannot: the status dropdown
// saves per row, and rows can be dragged into the order he wants to work them
// in. Only rows he actually moves get a saved position, so a new trial keeps
// landing in date order instead of appearing in an arbitrary spot.
//
// Sorting and dragging are deliberately exclusive: a drag while a sort is
// applied would save an order the next sort silently discards, so the sort
// header switches dragging off and says so.

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

const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, textAlign: 'right', padding: '7px 8px' }
const thL: React.CSSProperties = { ...th, textAlign: 'left' }
const td: React.CSSProperties = { fontSize: 12, padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const tdL: React.CSSProperties = { ...td, textAlign: 'left' }

export default function TrialsTable({ rows: initial }: { rows: TrialRow[] }) {
  const [rows, setRows] = useState(initial)
  const [sort, setSort] = useState<'manual' | 'asc' | 'desc'>('manual')
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [status, setStatus] = useState<string>('')

  const view = sort === 'manual'
    ? rows
    : [...rows].sort((a, b) => (sort === 'asc' ? a.trial_at.localeCompare(b.trial_at) : b.trial_at.localeCompare(a.trial_at)))

  const persist = async (next: TrialRow[]) => {
    setStatus('saving order…')
    try {
      const res = await fetch('/api/admin/trial-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: next.map(r => r.charge_id) }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setStatus('order saved')
      setTimeout(() => setStatus(''), 2000)
    } catch {
      setStatus('order NOT saved, reload and try again')
    }
  }

  const onDrop = (to: number) => {
    if (drag === null || drag === to) { setDrag(null); setOver(null); return }
    const next = [...rows]
    const [moved] = next.splice(drag, 1)
    next.splice(to, 0, moved)
    setRows(next)
    setDrag(null); setOver(null)
    void persist(next)
  }

  const resetOrder = async () => {
    setStatus('clearing…')
    try {
      await fetch('/api/admin/trial-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })
      setStatus('order cleared, reload to see date order')
    } catch { setStatus('could not clear') }
  }

  const sortBtn = (mode: 'asc' | 'desc' | 'manual', label: string) => (
    <button type="button" onClick={() => setSort(mode)}
      style={{
        padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
        border: `2px solid ${INK}`, background: sort === mode ? INK : '#FFFDFA',
        color: sort === mode ? '#FEF7E7' : INK,
      }}>{label}</button>
  )

  return (
    <>
      <div className="flex items-center flex-wrap" style={{ gap: 7, marginTop: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: MUTE, fontWeight: 700 }}>Order:</span>
        {sortBtn('manual', 'Manual (drag)')}
        {sortBtn('asc', 'Date ↑ oldest')}
        {sortBtn('desc', 'Date ↓ newest')}
        <button type="button" onClick={resetOrder}
          style={{ padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `2px solid ${HAIR}`, background: '#FFFDFA', color: MUTE }}>
          clear saved order
        </button>
        {status && <span style={{ fontSize: 11, fontWeight: 700, color: status.includes('NOT') ? '#B00020' : GREEN }}>{status}</span>}
        {sort !== 'manual' && <span style={{ fontSize: 11, color: MUTE }}>dragging is off while sorted</span>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${INK}` }}>
            <th style={{ ...thL, width: 22 }} />
            <th style={thL}>Trial date</th>
            <th style={thL}>Email</th>
            <th style={thL}>Name</th>
            <th style={thL}>Status</th>
            <th style={thL}>Channel</th>
            <th style={thL}>UTM source</th>
            <th style={thL}>Country</th>
            <th style={th}>Payment 1</th>
            <th style={thL}>Paid 2 on</th>
            <th style={th}>Payment 2</th>
            <th style={th}>Total</th>
            <th style={thL}>Stripe</th>
          </tr>
        </thead>
        <tbody>
          {view.map((r, i) => {
            const p2 = r.lifetime_bundle ? 4975 : (r.converted_cents ?? 0)
            const draggable = sort === 'manual'
            return (
              <tr key={r.charge_id}
                  draggable={draggable}
                  onDragStart={() => draggable && setDrag(i)}
                  onDragOver={e => { if (draggable) { e.preventDefault(); setOver(i) } }}
                  onDrop={() => draggable && onDrop(i)}
                  onDragEnd={() => { setDrag(null); setOver(null) }}
                  style={{
                    borderBottom: `1px solid ${HAIR}`,
                    background: over === i && drag !== null ? '#FEF7E7' : undefined,
                    opacity: drag === i ? 0.45 : 1,
                  }}>
                <td style={{ ...tdL, cursor: draggable ? 'grab' : 'default', color: MUTE, userSelect: 'none' }}
                    title={draggable ? 'Drag to reorder' : 'Switch to Manual to drag'}>⠿</td>
                <td style={{ ...tdL, color: MUTE, whiteSpace: 'nowrap' }}>
                  {fmtDay(r.trial_at)}
                  <span title={`Pricing era ${r.era}`} style={{ marginLeft: 5, fontSize: 9.5 }}>e{r.era}</span>
                </td>
                <td style={tdL}>{r.person_key}</td>
                <td style={{ ...tdL, fontWeight: 700 }}>{r.name || '–'}</td>
                <td style={tdL}>
                  <TrialState chargeId={r.charge_id} derived={r.derivedState} derivedLabel={r.derivedLabel}
                              derivedColor={r.derivedColor} initial={r.override} />
                </td>
                <td style={{ ...tdL, fontSize: 11.5, color: r.attribution === 'not_quiz' ? MUTE : GREEN, fontWeight: r.attribution === 'not_quiz' ? 400 : 700 }}>
                  {ATTR_LABEL[r.attribution] ?? r.attribution}
                </td>
                <td style={{ ...tdL, fontSize: 11.5, color: MUTE }}>{r.utm_source || '–'}</td>
                <td style={{ ...tdL, fontSize: 11.5, color: MUTE }}>{r.country || '–'}</td>
                <td style={td}>
                  ${(r.trial_cents / 100).toFixed(2)}
                  {r.lifetime_bundle && <span title="One $54.74 charge: the $4.99 trial and the $49.75 lifetime together" style={{ marginLeft: 4, color: AMBER, fontWeight: 700 }}>+LT</span>}
                </td>
                <td style={{ ...tdL, color: MUTE, whiteSpace: 'nowrap' }}>{r.converted_at ? fmtDay(r.converted_at) : '–'}</td>
                <td style={td}>{r.converted ? `$${(p2 / 100).toFixed(2)}` : '–'}</td>
                <td style={{ ...td, fontWeight: 700 }}>${(r.gross_cents / 100).toFixed(2)}</td>
                <td style={{ ...tdL, whiteSpace: 'nowrap' }}>
                  {r.customer_id ? (
                    <>
                      <a href={stripeCustomer(r.customer_id)} target="_blank" rel="noopener noreferrer"
                         title={`Open ${r.customer_id} in Stripe`}
                         style={{ fontSize: 11.5, fontWeight: 700, color: INK, textDecoration: 'underline' }}>profile</a>
                      <span style={{ color: HAIR, margin: '0 5px' }}>|</span>
                      <a href={stripeNewSub(r.customer_id)} target="_blank" rel="noopener noreferrer"
                         title="Open Stripe with the create-subscription panel, this customer preselected"
                         style={{ fontSize: 11.5, fontWeight: 700, color: GREEN, textDecoration: 'underline' }}>+ sub</a>
                    </>
                  ) : <span style={{ color: MUTE, fontSize: 11 }}>–</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
