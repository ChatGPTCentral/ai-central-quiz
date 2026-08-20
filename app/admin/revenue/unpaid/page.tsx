// Unpaid & overdue — money already invoiced that never arrived.
//
// Owner, 2026-08-20, after catching the recovery queue calling people "never
// attempted" who had failed charges all over Stripe: build the failed payment
// sync, and something similar for invoices that are unpaid and overdue.
//
// This is the second half. It reads stripe_outstanding_invoices, which is a
// VIEW, not arithmetic done here — "overdue" has exactly one definition in the
// database and every screen slices it (CLAUDE.md: one source per fact). The
// view also carries the failure count and the last decline reason per invoice,
// joined from stripe_payment_failures, because the two questions a person asks
// looking at an unpaid invoice are "how much" and "why did it not go through".
//
// THE COLUMN THAT MATTERS IS "Pay link". Every one of these invoices has a
// hosted Stripe URL that accepts a DIFFERENT card. A merchant-initiated retry
// re-runs the card that already failed; the hosted invoice does not. As of the
// day this shipped we had sent zero of them, ever.

import { createClient } from '@supabase/supabase-js'
import InvoiceRetry from '@/components/admin/InvoiceRetry.client'
import InvoiceRetryAll from '@/components/admin/InvoiceRetryAll.client'

export const dynamic = 'force-dynamic'
export const revalidate = 60

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const RED = '#B00020'
const GREEN = '#2E7D32'
const AMBER = '#B26A00'

const navChip: React.CSSProperties = {
  padding: '6px 12px', fontSize: 11.5, fontWeight: 700,
  border: '2px solid #1A1A1A', background: '#FFFDFA', color: '#1A1A1A', textDecoration: 'none',
}

interface Row {
  id: string
  number: string | null
  email: string | null
  customer_id: string | null
  status: string | null
  collection_method: string | null
  currency: string | null
  amount_remaining_cents: number
  created_at: string
  due_date: string | null
  attempt_count: number
  next_payment_attempt: string | null
  hosted_invoice_url: string | null
  subscription_id: string | null
  failure_count: number
  last_failure_at: string | null
  last_failure_message: string | null
  last_decline_code: string | null
  is_overdue: boolean
  days_overdue: number
  paid_since: boolean
  blocked_reason: string | null
  has_payment_method: boolean | null
  synced_at: string
}

interface QueueRow {
  invoice_id: string
  invoice_number: string | null
  person_key: string | null
  person_name: string | null
  customer_id: string | null
  amount_remaining_cents: number
  currency: string | null
  is_overdue: boolean
  days_overdue: number
  collection_method: string | null
  pay_url: string | null
  stripe_attempts: number
  stripe_last_failure: string | null
  stripe_decline_code: string | null
  our_attempts: number | null
  our_last_at: string | null
  our_last_outcome: string | null
  has_payment_method: boolean | null
}

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

/** Money is shown in the invoice's OWN currency. These are amounts still owed,
 *  not settled money, so rule 6's kept-money conversion does not apply and
 *  pretending a EUR invoice is dollars would be a made-up number. */
const money = (cents: number, cur: string | null) => {
  const c = (cur || 'usd').toUpperCase()
  const sym = c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : ''
  return `${sym}${(cents / 100).toFixed(2)}${sym ? '' : ' ' + c}`
}

const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export default async function UnpaidInvoicesPage() {
  let rows: Row[] = []
  let queue: QueueRow[] = []
  let err: string | null = null
  try {
    const c = sb()
    // The view already orders itself: never-attempted-by-us first, then
    // longest since our last try. Do NOT re-order here — the ordering is the
    // queue's whole behaviour and it belongs in one place.
    const [outstanding, retryQueue] = await Promise.all([
      c.from('stripe_outstanding_invoices').select('*').order('days_overdue', { ascending: false }).limit(2000),
      c.from('invoice_retry_queue').select('*').limit(500),
    ])
    if (outstanding.error) throw new Error(outstanding.error.message)
    if (retryQueue.error) throw new Error(retryQueue.error.message)
    rows = (outstanding.data ?? []) as Row[]
    queue = (retryQueue.data ?? []) as QueueRow[]
  } catch (e) {
    err = e instanceof Error ? e.message : String(e)
  }

  if (err) {
    return (
      <div style={{ padding: 26 }}>
        <h1 style={{ fontWeight: 800, fontSize: 24 }}>Unpaid &amp; overdue</h1>
        <p style={{ color: RED, marginTop: 10 }}>{err}</p>
      </div>
    )
  }

  const overdue = rows.filter(r => r.is_overdue)
  const notYetDue = rows.filter(r => !r.is_overdue)
  const uncollectible = rows.filter(r => r.status === 'uncollectible')
  // The bulk button and the queue table below it must show the SAME set, or
  // the button's count and the table's row count silently disagree — which is
  // exactly the kind of mismatch that reads as broken. invoice_retry_queue
  // blends overdue with not-yet-due (Stripe is still auto-retrying those on
  // its own schedule), so this page splits them: not-yet-due invoices stay
  // individually actionable in the reference table further down, and never
  // enter the bulk run. Owner, 2026-08-20: "I'd like to have it for all
  // overdue invoices" — this is that scope, applied to both the button and
  // the list underneath it.
  const overdueQueue = queue.filter(q => q.is_overdue)
  // Totals are per CURRENCY. Summing mixed currencies into one figure is the
  // kind of number nobody can verify against a Stripe screen.
  const byCurrency = new Map<string, { n: number; cents: number }>()
  for (const r of overdue) {
    const k = (r.currency || 'usd').toUpperCase()
    const cur = byCurrency.get(k) ?? { n: 0, cents: 0 }
    cur.n++; cur.cents += r.amount_remaining_cents
    byCurrency.set(k, cur)
  }
  const neverAttempted = overdue.filter(r => r.attempt_count === 0).length
  const stillRetrying = rows.filter(r => r.next_payment_attempt).length
  const lastSync = rows.length ? rows.map(r => r.synced_at).sort().slice(-1)[0] : null

  const th: React.CSSProperties = {
    textAlign: 'left', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
    textTransform: 'uppercase', color: MUTE, padding: '8px 10px', borderBottom: `2px solid ${INK}`, whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { fontSize: 12.5, padding: '8px 10px', borderBottom: '1px solid #E8E2D4', verticalAlign: 'top' }

  const table = (list: Row[], caption: string, emptyNote: string) => (
    <section style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: INK }}>{caption} <span style={{ color: MUTE, fontWeight: 600 }}>({list.length})</span></h2>
      {list.length === 0 ? (
        <p style={{ fontSize: 12.5, color: MUTE, marginTop: 8 }}>{emptyNote}</p>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1050 }}>
            <thead>
              <tr>
                <th style={th}>Days</th>
                <th style={th}>Owed</th>
                <th style={th}>Person</th>
                <th style={th}>Invoice</th>
                <th style={th}>Due</th>
                <th style={th}>Stripe tried</th>
                <th style={th}>Why it failed</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 700, color: r.days_overdue > 180 ? MUTE : r.days_overdue > 60 ? AMBER : RED }}>
                    {r.days_overdue}
                  </td>
                  <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(r.amount_remaining_cents, r.currency)}</td>
                  <td style={td}>
                    {r.email ? (
                      <a href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(r.email)}`}
                         target="_blank" rel="noreferrer" style={{ color: INK }}>{r.email}</a>
                    ) : <span style={{ color: MUTE }}>no email on invoice</span>}
                    {r.subscription_id && <div style={{ fontSize: 10.5, color: MUTE }}>subscription</div>}
                  </td>
                  <td style={{ ...td, fontSize: 11.5, color: MUTE }}>
                    {r.number || r.id}
                    <div style={{ fontSize: 10.5 }}>
                      {r.status}{r.collection_method === 'send_invoice' ? ' · emailed' : ' · auto-charge'}
                    </div>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {r.due_date ? day(r.due_date) : <span style={{ color: MUTE }}>{day(r.created_at)} (no due date)</span>}
                  </td>
                  <td style={td}>
                    {r.attempt_count === 0 ? (
                      <span style={{ color: AMBER, fontWeight: 700 }}>never</span>
                    ) : (
                      <>
                        <span style={{ fontWeight: 700 }}>{r.attempt_count}×</span>
                        {r.last_failure_at && <div style={{ fontSize: 10.5, color: MUTE }}>last {day(r.last_failure_at)}</div>}
                      </>
                    )}
                    {r.next_payment_attempt
                      ? <div style={{ fontSize: 10.5, color: GREEN }}>retrying {day(r.next_payment_attempt)}</div>
                      : r.attempt_count > 0 && <div style={{ fontSize: 10.5, color: RED }}>gave up</div>}
                  </td>
                  <td style={{ ...td, fontSize: 11.5, maxWidth: 300 }}>
                    {r.last_failure_message || <span style={{ color: MUTE }}>{r.failure_count === 0 ? 'no failed charge recorded' : '—'}</span>}
                    {r.last_decline_code && <div style={{ fontSize: 10.5, color: MUTE }}>{r.last_decline_code}</div>}
                  </td>
                  <td style={td}>
                    {/* The owner asked why the overdue table had no buttons.
                        It now has the same controls as the queue, and where a
                        row cannot be actioned it says WHY instead of going
                        blank — a blank cell reads as a broken feature. */}
                    <InvoiceRetry
                      invoiceId={r.id}
                      personKey={r.email}
                      amountCents={r.amount_remaining_cents}
                      currency={r.currency}
                      blockedReason={r.blocked_reason}
                    />
                    {r.hosted_invoice_url && (
                      <div style={{ marginTop: 4 }}>
                        <a href={r.hosted_invoice_url} target="_blank" rel="noreferrer"
                           style={{ fontSize: 10.5, color: '#3B5C8F' }}>pay link ↗</a>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 1240 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Unpaid &amp; overdue</h1>
      <p style={{ fontSize: 12.5, color: MUTE, marginTop: 6, maxWidth: 880, lineHeight: 1.6 }}>
        Every invoice with money still owed, mirrored from Stripe hourly. &quot;Overdue&quot; means the due date has
        passed, or, for auto-charge invoices that have no due date, that Stripe attempted it and scheduled no further
        attempt, which is the dunning cycle finished and lost. The definition lives in the
        <code style={{ fontSize: 11.5 }}> stripe_outstanding_invoices</code> view, not on this page, so every screen
        agrees. Totals are per currency because these are amounts owed, not settled money.
      </p>
      <p style={{ fontSize: 12.5, color: INK, marginTop: 10, maxWidth: 880, lineHeight: 1.6, fontWeight: 600 }}>
        The pay link is the point. It accepts a different card. A retry re-runs the card that already failed.
      </p>

      <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 12 }}>
        <a href="/admin/revenue" style={navChip}>← Revenue</a>
        <a href="/admin/revenue/recovery" style={navChip}>Trial recovery →</a>
        <a href="/admin/revenue/trials" style={navChip}>Every trial &amp; status →</a>
      </div>

      <div className="flex flex-wrap" style={{ gap: 18, marginTop: 20 }}>
        {Array.from(byCurrency.entries()).map(([cur, v]) => (
          <div key={cur} style={{ border: `2px solid ${INK}`, padding: '10px 14px', background: '#FFFDFA' }}>
            <div style={{ fontSize: 10.5, color: MUTE, fontWeight: 700, letterSpacing: '0.04em' }}>OVERDUE, {cur}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: RED }}>{money(v.cents, cur)}</div>
            <div style={{ fontSize: 11, color: MUTE }}>{v.n} invoice{v.n === 1 ? '' : 's'}</div>
          </div>
        ))}
        {byCurrency.size === 0 && (
          <div style={{ border: `2px solid ${INK}`, padding: '10px 14px', background: '#FFFDFA' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>Nothing overdue</div>
            <div style={{ fontSize: 11, color: MUTE }}>
              {lastSync ? `mirror synced ${lastSync.slice(0, 16).replace('T', ' ')} UTC` : 'no invoices mirrored yet — run the sync'}
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 12 }}>
        {overdue.filter(r => !r.blocked_reason).length} of {overdue.length} overdue invoices can be actioned
        {' · '}{overdue.filter(r => r.paid_since).length} excluded because the person paid us since
        {' · '}{neverAttempted} Stripe never attempted at all
        {' · '}{stillRetrying} still inside Stripe&apos;s retry schedule
        {' · '}{uncollectible.length} written off as uncollectible
        {lastSync ? ` · mirror synced ${lastSync.slice(0, 16).replace('T', ' ')} UTC` : ' · never synced'}
      </p>

      {/* THE RETRY QUEUE. The thing to actually work, above the reference
          tables. Ordered by the view: untouched first, then longest since our
          last attempt, so working it top to bottom never hits the same person
          twice while an untouched invoice waits. */}
      <section style={{ marginTop: 30 }}>
        <div className="flex flex-wrap items-start justify-between" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: INK }}>
            Retry queue <span style={{ color: MUTE, fontWeight: 600 }}>({overdueQueue.length})</span>
          </h2>
          {/* One click for the whole queue instead of one row at a time. Reuses
              the exact same endpoint as the single-row button, so every guard
              it has — live card check, paid-since exclusion, idempotency —
              applies to each invoice here too. Owner request, 2026-08-20. */}
          <InvoiceRetryAll
            invoices={overdueQueue.map(q => ({
              invoiceId: q.invoice_id, personKey: q.person_key,
              amountCents: q.amount_remaining_cents, currency: q.currency,
            }))}
          />
        </div>
        <p style={{ fontSize: 12, color: MUTE, marginTop: 5, maxWidth: 880, lineHeight: 1.6 }}>
          Every OVERDUE invoice with money owed, not yet excluded for a known reason. Not-yet-due invoices Stripe is
          still auto-retrying on its own schedule are not in this list — they stay individually actionable in
          &quot;Outstanding, not yet due&quot; below. Untouched first, then whoever we tried longest ago, then oldest
          debt. Anyone who paid us after the invoice was raised is excluded, so this can never charge a current
          customer. Whether a card actually exists is checked LIVE at the click, not guessed from this list —{' '}
          <strong style={{ color: INK }}>Retry</strong> re-runs the card on file when one exists and says plainly
          when it does not. <strong style={{ color: INK }}>Retry all</strong> runs every row above, in full, with one
          confirmation stating the exact count and total first.
        </p>
        {overdueQueue.length === 0 ? (
          <p style={{ fontSize: 12.5, color: MUTE, marginTop: 10 }}>Nothing to retry.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1080 }}>
              <thead>
                <tr>
                  <th style={th}>Days</th>
                  <th style={th}>Owed</th>
                  <th style={th}>Person</th>
                  <th style={th}>Stripe tried</th>
                  <th style={th}>Why it failed</th>
                  <th style={th}>We tried</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {overdueQueue.map(q => (
                  <tr key={q.invoice_id}>
                    <td style={{ ...td, fontWeight: 700, color: q.days_overdue > 180 ? MUTE : q.days_overdue > 90 ? AMBER : RED }}>
                      {q.days_overdue}
                    </td>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(q.amount_remaining_cents, q.currency)}</td>
                    <td style={td}>
                      {q.person_name && <div style={{ fontWeight: 600 }}>{q.person_name}</div>}
                      {q.person_key ? (
                        <a href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(q.person_key)}`}
                           target="_blank" rel="noreferrer" style={{ color: MUTE, fontSize: 11.5 }}>{q.person_key}</a>
                      ) : <span style={{ color: MUTE, fontSize: 11.5 }}>no email</span>}
                    </td>
                    <td style={td}>
                      {q.stripe_attempts === 0
                        ? <span style={{ color: AMBER, fontWeight: 700 }}>never</span>
                        : <span style={{ fontWeight: 700 }}>{q.stripe_attempts}×</span>}
                    </td>
                    <td style={{ ...td, fontSize: 11.5, maxWidth: 250 }}>
                      {q.stripe_last_failure || <span style={{ color: MUTE }}>—</span>}
                    </td>
                    <td style={td}>
                      {!q.our_attempts
                        ? <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>never</span>
                        : (
                          <>
                            <span style={{ fontWeight: 700 }}>{q.our_attempts}×</span>
                            <div style={{ fontSize: 10.5, color: MUTE }}>
                              {day(q.our_last_at)} {String(q.our_last_outcome || '').replace('invoice_', '')}
                            </div>
                          </>
                        )}
                    </td>
                    <td style={td}>
                      <InvoiceRetry
                        invoiceId={q.invoice_id}
                        personKey={q.person_key}
                        amountCents={q.amount_remaining_cents}
                        currency={q.currency}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {table(overdue, 'Overdue', 'Nothing is past due.')}
      {table(notYetDue, 'Outstanding, not yet due', 'Nothing outstanding inside its due window.')}
    </div>
  )
}
