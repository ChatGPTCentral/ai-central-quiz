'use client'

// The trials table: the owner's spreadsheet, live.
//
// COLUMNS are the thing you arrange here, not rows. Drag a header to move the
// column, click its × to remove it, and the layout saves to app_settings so it
// follows you to another machine instead of living in one browser. Removed
// columns sit underneath as chips and come back with a click; "reset" restores
// the original order.
//
// The rows sort ONE way, oldest trial first, always (owner, 2026-08-23:
// "in order A-Z, from the oldest to the newest") — an explicit, reproducible
// order, so two people reading the same filter see the same list.

import { useState } from 'react'
import TrialState, { type StripeCheck } from './TrialState.client'
import { fmtDay } from '@/lib/dates'
import { useColumnLayout } from './useColumnLayout'
import ColumnsMenu from './ColumnsMenu.client'
import ChargeAnnual from './ChargeAnnual.client'
import ChargeAnnualAll from './ChargeAnnualAll.client'
import type { State } from '@/lib/revenue-states'

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
  /** NET dollars this trial actually kept (rule 6, final form): trial +
   *  lifetime half + claimed renewal, with refunds, disputes, and Stripe's
   *  fees out, from the classifier's one keptUsdCents formula. */
  net_cents: number
  lifetime_bundle: boolean
  derivedState: State
  derivedLabel: string
  derivedColor: string
  override: string | null
  /** For a Did-not-convert row whose person converted on ANOTHER trial: the
   *  one line that resolves the apparent contradiction. Null otherwise. */
  personNote: string | null
  /** The ONE shared retry rule's verdict (lib/revenue-shared retryVerdict) —
   *  the same rule that builds the recovery queue, so this table's Charge
   *  column and that queue can never disagree (owner, 2026-08-22). */
  retry: string
  /** The person's latest charge-annual attempt from the audit trail, already
   *  formatted ("refused: already has a live subscription · Aug 20"). */
  lastAttempt: string | null
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

/** onColor and onCheck are only used by the status cell — repaints this row's
 *  tint and reports the live Stripe re-check up, both instant, no reload
 *  (owner, 2026-08-23). checks is read by the action cell, which renders
 *  whatever the status cell's last check reported (owner, 2026-08-23:
 *  "sposta i dettagli della transazione stripe a destra dei bottoni"). */
type CellCtx = {
  onColor: (chargeId: string, color: string) => void
  onCheck: (chargeId: string, check: StripeCheck | null) => void
  checks: Record<string, StripeCheck | null>
  /** Position in the table AS DISPLAYED, 1-indexed — built from `view`
   *  (the client's own final sort) right before render, never from a
   *  server-assigned number. The table always re-sorts client-side (line
   *  ~307, "ONE order, always"), so a number attached to a row before that
   *  sort belongs to a different order than the one on screen: the first
   *  visible row showed "821" instead of "1" until this stopped trusting
   *  a pre-sort number (owner, 2026-08-29). */
  rowNumbers: Map<string, number>
}
type Col = {
  key: string
  label: string
  align: 'left' | 'right'
  cell: (r: TrialRow, ctx: CellCtx) => React.ReactNode
}

const ALL_COLUMNS: Col[] = [
  { key: 'row_number', label: '#', align: 'right', cell: (r, ctx) => <span style={{ color: MUTE }}>{ctx.rowNumbers.get(r.charge_id) ?? '–'}</span> },
  { key: 'trial_date', label: 'Trial date', align: 'left',
    cell: r => <span style={{ color: MUTE, whiteSpace: 'nowrap' }}>{fmtDay(r.trial_at)}<span title={`Pricing era ${r.era}`} style={{ marginLeft: 5, fontSize: 9.5 }}>e{r.era}</span></span> },
  { key: 'email', label: 'Email', align: 'left', cell: r => r.person_key },
  // Name IS the Stripe link now, not a separate "profile" text beside it
  // (owner, 2026-08-23: "i want the name and the profile being a only
  // hyperlink"). No customer_id, no link — just the plain name.
  { key: 'name', label: 'Name', align: 'left',
    cell: r => r.customer_id ? (
      <a href={stripeCustomer(r.customer_id)} target="_blank" rel="noopener noreferrer" title={`Open ${r.customer_id} in Stripe`}
         style={{ fontWeight: 700, color: INK, textDecoration: 'underline' }}>{r.name || r.person_key}</a>
    ) : <span style={{ fontWeight: 700 }}>{r.name || '–'}</span> },
  // Just the dropdown, nothing beside it (owner, 2026-08-23: "separami il
  // dropdown dalle note cosi che la colonna status sia piu stretta") — the
  // explanatory note moved to its own trailing column, see 'notes' below.
  { key: 'status', label: 'Status', align: 'left',
    cell: (r, ctx) => (
      <TrialState
        chargeId={r.charge_id} customerId={r.customer_id}
        derived={r.derivedState} derivedLabel={r.derivedLabel}
        initial={r.override}
        onLiveColorChange={color => ctx.onColor(r.charge_id, color)}
        onStripeCheck={check => ctx.onCheck(r.charge_id, check)}
      />
    ) },
  // The charge action, in its own column instead of buried inside Status
  // (owner, 2026-08-22). Three things can never show a billing button, and
  // each is checked HERE, directly on the row's own state — not only by
  // which of the two sections below a row lands in — so this stays true even
  // if that partition ever drifts:
  //   · graduated: owned by a human outreach sequence
  //   · cancelled, disputed, refunded: the owner's own words, 2026-08-23,
  //     "dobbiamo evitare che vengano per sbaglio billati nuovamente" (we
  //     must avoid accidentally billing them again)
  //   · converted, lifetime, lapsed_covered: already billed for this —
  //     annual, lifetime, or paying some other way (owner, 2026-08-23:
  //     "elimina i bottoni ... dalle persone che abbiamo già billato")
  // Everything else — Trialing, Did-not-convert, unmapped price — gets both
  // buttons; the server is the final word on whether either can fire
  // (app/api/admin/charge-annual/route.ts).
  { key: 'action', label: 'Actions', align: 'left',
    cell: (r, ctx) => {
      const check = ctx.checks[r.charge_id]
      const checkBadge = check && (
        'error' in check ? (
          <span title={`Could not check Stripe: ${check.error}`} style={{ fontSize: 9.5, color: AMBER }}>⚠ Stripe check failed</span>
        ) : (
          <span
            title={check.subscriptionStatus ? `Stripe subscription status: ${check.subscriptionStatus}` : 'No subscription found on this customer in Stripe'}
            style={{ fontSize: 9.5, fontWeight: 700, color: check.hasActiveSubscription ? GREEN : AMBER }}
          >
            {check.hasActiveSubscription ? `✓ Stripe: ${check.subscriptionStatus}` : `Stripe: ${check.subscriptionStatus ?? 'no subscription'}`}
          </span>
        )
      )
      if (r.retry === 'graduated') {
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <a href="/admin/revenue/outreach" title="Owned by a human outreach sequence — auto-billing never touches this person"
               style={{ fontSize: 10.5, fontWeight: 800, color: '#3B5C8F', textDecoration: 'underline' }}>in outreach →</a>
            {checkBadge}
          </span>
        )
      }
      if (r.derivedState === 'refunded' || r.derivedState === 'cancelled') {
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span title="Cancelled, disputed, or refunded — excluded from auto-billing" style={{ color: MUTE, fontSize: 11 }}>protected, no billing</span>
            {checkBadge}
          </span>
        )
      }
      if (r.derivedState === 'converted' || r.derivedState === 'recovered' || r.derivedState === 'lifetime' || r.derivedState === 'lifetime_old' || r.derivedState === 'lapsed_covered') {
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span title="Already billed — an annual, a lifetime, or paying us some other way" style={{ color: MUTE, fontSize: 11 }}>already billed</span>
            {checkBadge}
          </span>
        )
      }
      const whyNot: Record<string, string> = {
        india: 'India is excluded: 0 of 43 due trials there ever renewed',
        no_card_era: 'No-card era (2025-05-25 to 06-21): nothing saved to charge',
      }
      if (!r.customer_id || whyNot[r.retry]) {
        return <span title={!r.customer_id ? 'No Stripe customer on this charge' : whyNot[r.retry]} style={{ color: MUTE, fontSize: 11 }}>–</span>
      }
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <a href={stripeNewSub(r.customer_id)} target="_blank" rel="noopener noreferrer"
             title="Open Stripe with the create-subscription panel, this customer preselected"
             style={{ fontSize: 10, fontWeight: 800, border: `2px solid ${INK}`, background: '#FFFDFA', color: INK, padding: '2px 8px', textDecoration: 'none' }}>
            Create sub
          </a>
          <ChargeAnnual customerId={r.customer_id} personKey={r.person_key} chargeId={r.charge_id} trialCents={r.trial_cents} />
          {r.lastAttempt && (
            <span title={r.lastAttempt} style={{ display: 'inline-block', fontSize: 10, color: MUTE, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>
              {r.lastAttempt}
            </span>
          )}
          {checkBadge}
        </span>
      )
    } },
  { key: 'channel', label: 'Channel', align: 'left',
    cell: r => <span style={{ fontSize: 11.5, color: r.attribution === 'not_quiz' ? MUTE : GREEN, fontWeight: r.attribution === 'not_quiz' ? 400 : 700 }}>{ATTR_LABEL[r.attribution] ?? r.attribution}</span> },
  { key: 'utm', label: 'UTM source', align: 'left', cell: r => <span style={{ fontSize: 11.5, color: MUTE }}>{r.utm_source || '–'}</span> },
  { key: 'country', label: 'Country', align: 'left', cell: r => <span style={{ fontSize: 11.5, color: MUTE }}>{r.country || '–'}</span> },
  { key: 'payment1', label: 'Payment 1', align: 'right',
    cell: r => <>${(r.trial_cents / 100).toFixed(2)}{r.lifetime_bundle && <span title="One $54.74 charge: the $4.99 trial and the $49.75 lifetime together" style={{ marginLeft: 4, color: AMBER, fontWeight: 700 }}>+LT</span>}</> },
  { key: 'paid2on', label: 'Paid 2 on', align: 'left', cell: r => <span style={{ color: MUTE, whiteSpace: 'nowrap' }}>{r.converted_at ? fmtDay(r.converted_at) : '–'}</span> },
  { key: 'payment2', label: 'Payment 2', align: 'right',
    // The lifetime half is shown on Payment 1 as +LT, not here: this column is
    // the RENEWAL, and a lifetime buyer has no renewal coming.
    cell: r => (r.converted ? `$${((r.converted_cents ?? 0) / 100).toFixed(2)}` : '–') },
  { key: 'total', label: 'Total', align: 'right',
    cell: r => <span style={{ fontWeight: 700 }} title="Net money actually kept from this trial: payments minus refunds, disputes, and Stripe's fees — a refunded trial totals $0.00 while its payments stay listed.">${(r.net_cents / 100).toFixed(2)}</span> },
  // The one line that resolves a "Did not convert" row whose person pays
  // some other way — moved out of Status into its own trailing column
  // (owner, 2026-08-23: "payment 1, payment 2, e total, e actions, e poi
  // dopo mi metti le note"), same position rule as Actions: always on,
  // always last, never a per-user column choice.
  { key: 'notes', label: 'Notes', align: 'left',
    cell: r => r.personNote ? (
      <span title={`This TRIAL did not convert, but the person pays us: ${r.personNote}. Trials are counted gross, so each trial carries its own state.`}
        style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>
        ✓ {r.personNote}
      </span>
    ) : null },
]

/** The owner's default view: who, when, where to act, what they paid. The
 *  analytical columns (channel, utm, country, second-payment date) stay one
 *  click away in the Columns menu. 'action' is NOT in here at all — it always
 *  renders, in both the All and Non-paying views, so it is never a per-user
 *  column choice either; see the 'action' column definition above for what
 *  it shows on each row and why. */
const DEFAULT_ORDER = ['row_number', 'trial_date', 'name', 'email', 'status', 'payment1', 'payment2', 'total', 'channel', 'utm', 'country', 'paid2on']
const DEFAULT_HIDDEN = ['channel', 'utm', 'country', 'paid2on']

const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, padding: '7px 8px', whiteSpace: 'nowrap' }
// One line per row, always: cells never wrap, the table scrolls instead.
const td: React.CSSProperties = { fontSize: 12, padding: '7px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

// 'action' and 'notes' are excluded from the column-preference universe on
// purpose — both are always on, always the last two columns, never a
// per-user hide/show/reorder choice (owner, 2026-08-23).
const MENU_COLUMNS = ALL_COLUMNS.filter(c => c.key !== 'action' && c.key !== 'notes')
const ACTION_COL = ALL_COLUMNS.find(c => c.key === 'action')!
const NOTES_COL = ALL_COLUMNS.find(c => c.key === 'notes')!

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '9px 13px' }}>
      <div className="font-mono uppercase" style={{ fontSize: 9, letterSpacing: '.12em', color: MUTE, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: INK, marginTop: 2 }}>{value}</div>
    </div>
  )
}

export default function TrialsTable({
  rows, initialOrder, initialHidden, recoveredCount, invoicedCount, initialNonPayingOnly,
}: {
  rows: TrialRow[]
  initialOrder: string[] | null
  initialHidden: string[] | null
  /** Subscriptions created / invoices sent by the retry button, all time —
   *  merged in from the old recovery queue (owner, 2026-08-23). */
  recoveredCount: number
  invoicedCount: number
  /** Arriving from /admin/revenue/recovery's redirect lands here toggled on. */
  initialNonPayingOnly?: boolean
}) {
  const L = useColumnLayout({
    tableKey: 'revenue_trials',
    all: MENU_COLUMNS.map(c => ({ key: c.key, label: c.label })),
    initialOrder, initialHidden,
    defaultOrder: DEFAULT_ORDER, defaultHidden: DEFAULT_HIDDEN,
  })
  // ONE order, always: oldest first (owner, 2026-08-23: "in order A-Z, from
  // the oldest to the newest"). No more per-user sort mode — a fixed order
  // is one two people reading the same filter always see the same way.
  const [nonPayingOnly, setNonPayingOnly] = useState(initialNonPayingOnly ?? false)
  // Repainted the instant a status changes by hand, no reload (owner,
  // 2026-08-23). Keyed by charge_id; falls back to the server-computed
  // derivedColor until (if ever) a live edit happens on that row.
  const [liveColors, setLiveColors] = useState<Record<string, string>>({})
  const setLiveColor = (chargeId: string, color: string) => setLiveColors(prev => ({ ...prev, [chargeId]: color }))
  // The live Stripe re-check, keyed by charge_id — reported up from the
  // status cell, read by the action cell (owner, 2026-08-23: "sposta i
  // dettagli della transazione stripe a destra dei bottoni").
  const [liveChecks, setLiveChecks] = useState<Record<string, StripeCheck | null>>({})
  const setLiveCheck = (chargeId: string, check: StripeCheck | null) => setLiveChecks(prev => ({ ...prev, [chargeId]: check }))
  // ONE table, ONE toggle (owner, 2026-08-23: "ridurre la complessita di
  // avere tutte queste tabelle e sottotabelle ... un toggle che mi fa il
  // subset di tutte le persone con le righe rosse"). The earlier cancelled/
  // disputed/refunded section is gone — those rows sort back in with
  // everyone else. Nothing lost: the Actions cell above already refuses a
  // billing button by checking each row's OWN state, not by which section
  // it sits in, so folding the sections back together changes nothing about
  // what can be billed, only how many tables the page has.
  // 'nonPaying' is now exactly the red rows — state 'lapsed' only, matching
  // what Retry all can actually act on 1:1 (owner: "cosi che poi puoi
  // mandarmi il retry all sui rossi"). Trialing, cancelled, refunded,
  // already-billed all stay out of this toggle; they only ever show in All.
  const nonPaying = rows.filter(r => r.derivedState === 'lapsed')
  const base = nonPayingOnly ? nonPaying : rows
  const view = [...base].sort((a, b) => a.trial_at.localeCompare(b.trial_at))
  // Built from `view`, the order actually on screen — see the note on
  // CellCtx.rowNumbers for why this can never be a server-assigned number.
  const rowNumbers = new Map(view.map((r, i) => [r.charge_id, i + 1]))
  const cellCtx: CellCtx = { onColor: setLiveColor, onCheck: setLiveCheck, checks: liveChecks, rowNumbers }
  // Actions then Notes are always the last two columns, in both views
  // (owner, 2026-08-23: "actions, e poi dopo mi metti le note").
  const visible = [...L.visibleKeys.map(k => MENU_COLUMNS.find(c => c.key === k)!), ACTION_COL, NOTES_COL].filter(Boolean)
  const headRow = (
    <tr style={{ borderBottom: `2px solid ${INK}` }}>
      {visible.map(c => (
        // Action and Notes aren't draggable or foldable on their own — both
        // are always on, never a per-user hide/show choice, so they skip
        // headerProps/hide.
        c.key === 'action' || c.key === 'notes' ? (
          <th key={c.key} style={{ ...th, textAlign: c.align }}>{c.label}</th>
        ) : (
          <th key={c.key} {...L.headerProps(c.key)} style={{ ...th, textAlign: c.align, ...L.headerStyle(c.key) }}>
            <span style={{ marginRight: 4, color: HAIR }}>⠿</span>
            {c.label}
            <button type="button" onClick={() => L.hide(c.key)}
                    title={`Remove the ${c.label} column`}
                    style={{ marginLeft: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: MUTE, fontSize: 12, fontWeight: 700, padding: 0 }}>×</button>
          </th>
        )
      ))}
    </tr>
  )
  // Row tinted with its status color (owner, 2026-08-22, "colori più
  // intensi" the same day; 2026-08-23: a hand-change must repaint it too) —
  // hex + 20% alpha suffix.
  const bodyRows = (list: TrialRow[]) => list.map(r => (
    <tr key={r.charge_id} style={{ borderBottom: `1px solid ${HAIR}`, background: `${liveColors[r.charge_id] ?? r.derivedColor}33` }}>
      {visible.map(c => (
        <td key={c.key} style={{ ...td, textAlign: c.align }}>{c.cell(r, cellCtx)}</td>
      ))}
    </tr>
  ))

  // The bulk retry target: only the rows the shared verdict actually clears
  // (lib/revenue-shared retryVerdict, computed server-side per row) — same
  // rule the single-row buttons already obey.
  const eligible = nonPaying.filter(r => r.retry === 'eligible' && r.customer_id)
  const neverClicked = eligible.filter(r => !r.lastAttempt).length

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '4px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${INK}`, background: active ? INK : '#FFFDFA', color: active ? '#FEF7E7' : INK,
  })

  return (
    <>
      <div className="flex items-center flex-wrap" style={{ gap: 7, marginTop: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: MUTE, fontWeight: 700 }}>Showing:</span>
        <button type="button" onClick={() => setNonPayingOnly(false)} style={btn(!nonPayingOnly)}>All {rows.length}</button>
        <button type="button" onClick={() => setNonPayingOnly(true)} style={btn(nonPayingOnly)}
                title="Did not convert (state exactly 'lapsed') — Retry all and the recovery stats live only here, and act on exactly this set">
          Did not convert {nonPaying.length}
        </button>
        <span style={{ width: 10 }} />
        <ColumnsMenu all={MENU_COLUMNS.map(c => ({ key: c.key, label: c.label }))} hidden={L.hidden}
                     onHide={L.hide} onShow={L.show} onReset={L.reset} status={L.status} />
      </div>

      {/* The old recovery queue's headline, merged in (owner, 2026-08-23:
          "merging therefore this with the retry table feature"). Only in
          this toggle — the buttons everyone asked to fold away live here
          and nowhere else. */}
      {nonPayingOnly && (
        <div className="flex flex-wrap items-center justify-between" style={{ gap: 10, marginBottom: 10 }}>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            <Stat label="Chargeable now" value={String(eligible.length)} />
            <Stat label="We never clicked retry" value={String(neverClicked)} />
            <Stat label="Subscriptions won" value={String(recoveredCount)} />
            <Stat label="Invoices out" value={String(invoicedCount)} />
          </div>
          <ChargeAnnualAll
            trials={eligible.map(r => ({
              customerId: r.customer_id as string, personKey: r.person_key,
              chargeId: r.charge_id, trialCents: r.trial_cents,
            }))}
          />
        </div>
      )}

      {/* Cells never wrap, so the table scrolls sideways instead of
          growing a second line per row. */}
      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>{headRow}</thead>
        <tbody>{bodyRows(view)}</tbody>
      </table>
      </div>
    </>
  )
}
