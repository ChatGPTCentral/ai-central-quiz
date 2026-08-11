'use client'

// People holding more than one paid trial.
//
// The owner's question, 2026-08-11: "who are the clients that paid 4.99 more
// than once but have only been billed one $59.75 subscription?" That is the
// gap row below, and it is money: someone bought two trials, one of them
// turned into a yearly and the other did not, so either a subscription needs
// creating or a duplicate needs cancelling. Either way it is a decision only
// he can make, and it was invisible until trials started counting gross.
//
// Sorted by the gap, largest first, so the list opens on the people worth
// acting on rather than on whoever is alphabetically unlucky.

import { useState } from 'react'
import { fmtDay } from '@/lib/dates'

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const GREEN = '#2E7D32'
const AMBER = '#B26A00'
const LATTE = '#FEF7E7'

const STRIPE_ACCT = 'acct_1O98fMBLsgHOvWxy'
const stripeCustomer = (cus: string) => `https://dashboard.stripe.com/${STRIPE_ACCT}/customers/${cus}`
const stripeNewSub = (cus: string) => `${stripeCustomer(cus)}?create=subscription&subscription_default_customer=${cus}`

export interface MultiTrialRow {
  personKey: string
  name: string | null
  customerId: string | null
  trials: number
  renewals: number
  /** Trials with no renewal behind them, and none coming. */
  gap: number
  lifetimes: number
  /** Trials too young to be due yet, which is why a gap can be legitimate. */
  notDue: number
  firstTrial: string
  lastTrial: string
  paidUsd: number
  quizEarned: boolean
}

type Filter = 'gap' | 'all'

const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, padding: '7px 8px', whiteSpace: 'nowrap', textAlign: 'left' }
const td: React.CSSProperties = { fontSize: 12, padding: '7px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

export default function MultiTrialTable({ rows }: { rows: MultiTrialRow[] }) {
  const [filter, setFilter] = useState<Filter>('gap')
  const view = (filter === 'gap' ? rows.filter(r => r.gap > 0) : rows)
    .slice()
    .sort((a, b) => b.gap - a.gap || b.trials - a.trials || a.personKey.localeCompare(b.personKey))

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${INK}`, background: active ? INK : '#FFFDFA', color: active ? '#FEF7E7' : INK,
  })

  const gapPeople = rows.filter(r => r.gap > 0).length
  const gapTrials = rows.reduce((a, r) => a + r.gap, 0)

  return (
    <>
      <div className="flex items-center flex-wrap" style={{ gap: 7, marginTop: 10, marginBottom: 6 }}>
        <button type="button" onClick={() => setFilter('gap')} style={btn(filter === 'gap')}
          title="People with at least one trial that is due and has no yearly behind it">
          Unbilled gap ({gapPeople})
        </button>
        <button type="button" onClick={() => setFilter('all')} style={btn(filter === 'all')}>
          Everyone with 2+ trials ({rows.length})
        </button>
        <span style={{ fontSize: 11, color: MUTE }}>
          {gapTrials} trial{gapTrials === 1 ? '' : 's'} past their bill date with no yearly against them
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${INK}` }}>
              <th style={th}>Person</th>
              <th style={{ ...th, textAlign: 'right' }}>Trials</th>
              <th style={{ ...th, textAlign: 'right' }}>Yearlies</th>
              <th style={{ ...th, textAlign: 'right' }}>Gap</th>
              <th style={th}>Why the gap</th>
              <th style={th}>First trial</th>
              <th style={th}>Last trial</th>
              <th style={{ ...th, textAlign: 'right' }}>Paid</th>
              <th style={th}>Stripe</th>
            </tr>
          </thead>
          <tbody>
            {view.map(r => (
              <tr key={r.personKey} style={{ borderBottom: `1px solid ${HAIR}` }}>
                <td style={td}>
                  <span style={{ fontWeight: 700 }}>{r.name || '–'}</span>
                  <span style={{ color: MUTE, marginLeft: 6, fontSize: 11 }}>{r.personKey}</span>
                  {r.quizEarned && <span title="The quiz earned at least one of these trials" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: GREEN }}>quiz</span>}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{r.trials}</td>
                <td style={{ ...td, textAlign: 'right' }}>{r.renewals}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: r.gap > 0 ? AMBER : MUTE }}>{r.gap || '–'}</td>
                <td style={{ ...td, fontSize: 11, color: '#4A4A4A' }}>
                  {r.gap === 0
                    ? (r.notDue > 0 ? `${r.notDue} still trialing` : 'every trial accounted for')
                    : `${r.gap} due, unbilled${r.lifetimes ? ` · ${r.lifetimes} lifetime` : ''}${r.notDue ? ` · ${r.notDue} still trialing` : ''}`}
                </td>
                <td style={{ ...td, color: MUTE }}>{fmtDay(r.firstTrial)}</td>
                <td style={{ ...td, color: MUTE }}>{fmtDay(r.lastTrial)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>${r.paidUsd.toFixed(2)}</td>
                <td style={td}>
                  {r.customerId ? (
                    <>
                      <a href={stripeCustomer(r.customerId)} target="_blank" rel="noopener noreferrer"
                         style={{ fontSize: 11.5, fontWeight: 700, color: INK, textDecoration: 'underline' }}>profile</a>
                      <span style={{ color: HAIR, margin: '0 5px' }}>|</span>
                      <a href={stripeNewSub(r.customerId)} target="_blank" rel="noopener noreferrer"
                         title="Open Stripe with the create-subscription panel, this customer preselected"
                         style={{ fontSize: 11.5, fontWeight: 700, color: GREEN, textDecoration: 'underline' }}>+ sub</a>
                    </>
                  ) : <span style={{ color: MUTE, fontSize: 11 }}>–</span>}
                </td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr><td colSpan={9} style={{ ...td, color: MUTE, padding: '14px 8px' }}>Nobody. Every multi-trial customer has a yearly for each trial that is due.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5, maxWidth: 780, background: LATTE, border: `1px solid ${HAIR}`, padding: '8px 10px' }}>
        <strong style={{ color: INK }}>Gap</strong> counts trials that are past their bill date and have no yearly
        against them. A lifetime buyer is never a gap, they bought the library outright. A trial inside its first
        month is not a gap either, it is not due yet. So a number in that column is a real decision: either the
        subscription needs creating, or the duplicate needs cancelling in Stripe.
      </div>
    </>
  )
}
