// Unpaid & overdue — money already invoiced that never arrived.
//
// Owner, 2026-08-20, after catching the recovery queue calling people "never
// attempted" who had failed charges all over Stripe: build the failed payment
// sync, and something similar for invoices that are unpaid and overdue.
//
// ONE TABLE, corrected 2026-08-20. The first version split this into three:
// a "Retry queue," an "Overdue" table, and an "Outstanding, not yet due"
// table. The owner asked why — they were one population shown three times,
// and "not yet due" was a lie: EVERY row in it had already failed at least
// one Stripe attempt and was simply still inside Stripe's own retry schedule,
// not "nothing has happened yet." Verified before fixing it, not assumed: all
// 35 such rows had attempt_count > 0 and a next_payment_attempt already
// scheduled.
//
// So this is now the one true list: every outstanding invoice, blocked ones
// included, with the reason printed inline instead of hidden in a separate
// table. invoice_retry_queue (the view) carries blocked_reason as a COLUMN,
// not a filter, and orders actionable-and-untouched first, blocked rows sink
// to the bottom — visible, never invisible.
//
// RETRY ALL now runs on literally everybody. Owner: "can't the retry button
// go on everybody, why just a subset?" It does. Rows already known blocked
// (a reliable status enum, or our own paid-since join — not a guessed Stripe
// field) are skipped WITHOUT spending a network call, but still listed in the
// results as skipped, never silently dropped. Everyone else gets a real,
// live-checked attempt.

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

interface QueueRow {
  invoice_id: string
  invoice_number: string | null
  person_key: string | null
  person_name: string | null
  customer_id: string | null
  amount_remaining_cents: number
  currency: string | null
  status: string | null
  collection_method: string | null
  is_overdue: boolean
  days_overdue: number
  invoice_created_at: string
  due_date: string | null
  pay_url: string | null
  subscription_id: string | null
  has_payment_method: boolean | null
  stripe_attempts: number
  stripe_attempted: boolean
  stripe_next_attempt: string | null
  stripe_last_failure_at: string | null
  stripe_last_failure: string | null
  stripe_decline_code: string | null
  blocked_reason: string | null
  our_attempts: number | null
  our_last_at: string | null
  our_last_outcome: string | null
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

/** The honest per-row status. Replaces the old "not yet due" label, which was
 *  wrong for every row that ever carried it — Stripe had already tried and
 *  failed, it just had not given up yet. */
function statusOf(q: QueueRow): { label: string; color: string; detail?: string } {
  if (q.is_overdue) {
    return {
      label: `${q.days_overdue}d overdue`,
      color: q.days_overdue > 180 ? MUTE : q.days_overdue > 60 ? AMBER : RED,
    }
  }
  if (q.stripe_attempted) {
    return {
      label: 'Stripe still retrying',
      color: AMBER,
      detail: q.stripe_next_attempt ? `next attempt ${day(q.stripe_next_attempt)}` : undefined,
    }
  }
  return { label: 'not yet attempted', color: MUTE }
}

export default async function UnpaidInvoicesPage() {
  let queue: QueueRow[] = []
  let err: string | null = null
  try {
    const { data, error } = await sb().from('invoice_retry_queue').select('*').limit(2000)
    if (error) throw new Error(error.message)
    queue = (data ?? []) as QueueRow[]
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

  const actionable = queue.filter(q => !q.blocked_reason)
  const blocked = queue.filter(q => q.blocked_reason)
  const uncollectible = queue.filter(q => q.status === 'uncollectible')
  const paidSince = queue.filter(q => (q.blocked_reason || '').startsWith('They paid us'))
  const stillRetrying = queue.filter(q => !q.is_overdue && q.stripe_attempted)
  const neverAttemptedByStripe = queue.filter(q => q.stripe_attempts === 0)

  // Totals are per CURRENCY. Summing mixed currencies into one figure is the
  // kind of number nobody can verify against a Stripe screen. Only the
  // ACTIONABLE ones count toward "money we could actually still collect."
  const byCurrency = new Map<string, { n: number; cents: number }>()
  for (const q of actionable) {
    const k = (q.currency || 'usd').toUpperCase()
    const cur = byCurrency.get(k) ?? { n: 0, cents: 0 }
    cur.n++; cur.cents += q.amount_remaining_cents
    byCurrency.set(k, cur)
  }

  const th: React.CSSProperties = {
    textAlign: 'left', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
    textTransform: 'uppercase', color: MUTE, padding: '8px 10px', borderBottom: `2px solid ${INK}`, whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { fontSize: 12.5, padding: '8px 10px', borderBottom: '1px solid #E8E2D4', verticalAlign: 'top' }

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 1280 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Unpaid &amp; overdue</h1>
      <p style={{ fontSize: 12.5, color: MUTE, marginTop: 6, maxWidth: 880, lineHeight: 1.6 }}>
        Every invoice with money still owed, mirrored from Stripe hourly, in ONE list. &quot;Stripe still
        retrying&quot; means it already failed at least once and Stripe has a next attempt scheduled — that is
        different from a row nobody has ever tried, and both are shown as what they are, not folded into one
        misleading label. Blocked rows (already collected another way, or written off) print their reason instead of
        a button, in place, never hidden in a separate table.
      </p>

      <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 12 }}>
        <a href="/admin/revenue" style={navChip}>← Revenue</a>
        <a href="/admin/revenue/trials?nonpaying=1#top" style={navChip}>Trial recovery →</a>
        <a href="/admin/revenue/trials" style={navChip}>Every trial &amp; status →</a>
      </div>

      <div className="flex flex-wrap" style={{ gap: 18, marginTop: 20 }}>
        {Array.from(byCurrency.entries()).map(([cur, v]) => (
          <div key={cur} style={{ border: `2px solid ${INK}`, padding: '10px 14px', background: '#FFFDFA' }}>
            <div style={{ fontSize: 10.5, color: MUTE, fontWeight: 700, letterSpacing: '0.04em' }}>ACTIONABLE, {cur}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: RED }}>{money(v.cents, cur)}</div>
            <div style={{ fontSize: 11, color: MUTE }}>{v.n} invoice{v.n === 1 ? '' : 's'}</div>
          </div>
        ))}
        {byCurrency.size === 0 && (
          <div style={{ border: `2px solid ${INK}`, padding: '10px 14px', background: '#FFFDFA' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>Nothing actionable</div>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 12 }}>
        {actionable.length} of {queue.length} can still be actioned
        {' · '}{uncollectible.length} written off as uncollectible by Stripe
        {' · '}{paidSince.length} excluded because the person paid us since
        {' · '}{stillRetrying.length} not overdue yet, but already failed once and Stripe is still retrying
        {' · '}{neverAttemptedByStripe.length} Stripe has never attempted at all
      </p>

      {/* THE ONE LIST. Ordered by the view: actionable-and-untouched first,
          then longest since our last try, blocked rows sink to the bottom —
          visible, not removed. */}
      <section style={{ marginTop: 26 }}>
        <div className="flex flex-wrap items-start justify-between" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: INK }}>
            All unpaid invoices <span style={{ color: MUTE, fontWeight: 600 }}>({queue.length})</span>
          </h2>
          {/* Runs on EVERY row above. Known-blocked rows are skipped without a
              Stripe call but still appear in the results, so nothing here is
              a hidden subset. Owner, 2026-08-20. */}
          <InvoiceRetryAll
            invoices={queue.map(q => ({
              invoiceId: q.invoice_id, personKey: q.person_key,
              amountCents: q.amount_remaining_cents, currency: q.currency,
              blockedReason: q.blocked_reason,
            }))}
          />
        </div>
        <p style={{ fontSize: 12, color: MUTE, marginTop: 5, maxWidth: 880, lineHeight: 1.6 }}>
          <strong style={{ color: INK }}>Retry all</strong> runs on every row in this table, full stop — the{' '}
          {blocked.length} already known blocked are skipped without spending a Stripe call, the other{' '}
          {actionable.length} get a real, live-checked attempt. Whether a card actually exists is checked LIVE at the
          click, not guessed from this list.
        </p>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1150 }}>
            <thead>
              <tr>
                <th style={th}>Status</th>
                <th style={th}>Owed</th>
                <th style={th}>Person</th>
                <th style={th}>Invoice</th>
                <th style={th}>Stripe tried</th>
                <th style={th}>Why it failed</th>
                <th style={th}>We tried</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {queue.map(q => {
                const st = statusOf(q)
                return (
                  <tr key={q.invoice_id}>
                    <td style={{ ...td, fontWeight: 700, color: st.color, whiteSpace: 'nowrap' }}>
                      {st.label}
                      {st.detail && <div style={{ fontSize: 10.5, fontWeight: 400, color: MUTE }}>{st.detail}</div>}
                    </td>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(q.amount_remaining_cents, q.currency)}</td>
                    <td style={td}>
                      {q.person_name && <div style={{ fontWeight: 600 }}>{q.person_name}</div>}
                      {q.person_key ? (
                        <a href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(q.person_key)}`}
                           target="_blank" rel="noreferrer" style={{ color: MUTE, fontSize: 11.5 }}>{q.person_key}</a>
                      ) : <span style={{ color: MUTE, fontSize: 11.5 }}>no email</span>}
                    </td>
                    <td style={{ ...td, fontSize: 11.5, color: MUTE }}>
                      {q.invoice_number || q.invoice_id}
                      <div style={{ fontSize: 10.5 }}>
                        {q.status}{q.collection_method === 'send_invoice' ? ' · emailed' : ' · auto-charge'}
                      </div>
                    </td>
                    <td style={td}>
                      {q.stripe_attempts === 0
                        ? <span style={{ color: AMBER, fontWeight: 700 }}>never</span>
                        : <span style={{ fontWeight: 700 }}>{q.stripe_attempts}×</span>}
                      {q.stripe_last_failure_at && <div style={{ fontSize: 10.5, color: MUTE }}>last {day(q.stripe_last_failure_at)}</div>}
                    </td>
                    <td style={{ ...td, fontSize: 11.5, maxWidth: 240 }}>
                      {q.stripe_last_failure || <span style={{ color: MUTE }}>—</span>}
                      {q.stripe_decline_code && <div style={{ fontSize: 10.5, color: MUTE }}>{q.stripe_decline_code}</div>}
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
                        blockedReason={q.blocked_reason}
                      />
                      {q.pay_url && !q.blocked_reason && (
                        <div style={{ marginTop: 4 }}>
                          <a href={q.pay_url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: '#3B5C8F' }}>pay link ↗</a>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {queue.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 16, color: MUTE, fontSize: 12 }}>Nothing outstanding.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
