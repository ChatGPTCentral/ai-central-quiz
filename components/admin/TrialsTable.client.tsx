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
import { useColumnLayout } from './useColumnLayout'
import ColumnsMenu from './ColumnsMenu.client'

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

/** The owner's default view: who, when, where to act, what they paid. The
 *  analytical columns (channel, utm, country, second-payment date) stay one
 *  click away in the Columns menu. */
const DEFAULT_ORDER = ['trial_date', 'name', 'email', 'stripe', 'status', 'payment1', 'payment2', 'total', 'channel', 'utm', 'country', 'paid2on']
const DEFAULT_HIDDEN = ['channel', 'utm', 'country', 'paid2on']

const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, padding: '7px 8px', whiteSpace: 'nowrap' }
// One line per row, always: cells never wrap, the table scrolls instead.
const td: React.CSSProperties = { fontSize: 12, padding: '7px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

export default function TrialsTable({
  rows, initialOrder, initialHidden,
}: {
  rows: TrialRow[]
  initialOrder: string[] | null
  initialHidden: string[] | null
}) {
  const L = useColumnLayout({
    tableKey: 'revenue_trials',
    all: ALL_COLUMNS.map(c => ({ key: c.key, label: c.label })),
    initialOrder, initialHidden,
    defaultOrder: DEFAULT_ORDER, defaultHidden: DEFAULT_HIDDEN,
  })
  // Default view: whoever is still TRIALING first, oldest first inside that —
  // those are the people whose renewal is closest, so they are the ones worth
  // acting on today. Everything else follows in the same chronological order.
  const [sort, setSort] = useState<'trialing' | 'asc' | 'desc'>('trialing')
  const visible = L.visibleKeys.map(k => ALL_COLUMNS.find(c => c.key === k)!).filter(Boolean)
  const view = [...rows].sort((a, b) => {
    if (sort === 'trialing') {
      const at = a.derivedState === 'not_due' ? 0 : 1
      const bt = b.derivedState === 'not_due' ? 0 : 1
      if (at !== bt) return at - bt
      return a.trial_at.localeCompare(b.trial_at)
    }
    return sort === 'asc' ? a.trial_at.localeCompare(b.trial_at) : b.trial_at.localeCompare(a.trial_at)
  })

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${INK}`, background: active ? INK : '#FFFDFA', color: active ? '#FEF7E7' : INK,
  })

  return (
    <>
      <div className="flex items-center flex-wrap" style={{ gap: 7, marginTop: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: MUTE, fontWeight: 700 }}>Rows:</span>
        <button type="button" onClick={() => setSort('trialing')} style={btn(sort === 'trialing')} title="Still trialing first, then chronological">Trialing first</button>
        <button type="button" onClick={() => setSort('asc')} style={btn(sort === 'asc')}>Date ↑ oldest</button>
        <button type="button" onClick={() => setSort('desc')} style={btn(sort === 'desc')}>Date ↓ newest</button>
        <span style={{ width: 10 }} />
        <ColumnsMenu all={ALL_COLUMNS.map(c => ({ key: c.key, label: c.label }))} hidden={L.hidden}
                     onHide={L.hide} onShow={L.show} onReset={L.reset} status={L.status} />
      </div>

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
                <button type="button" onClick={() => L.hide(c.key)}
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
      </div>
    </>
  )
}
