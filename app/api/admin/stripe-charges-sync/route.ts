// Mirror every Stripe charge since launch into stripe_charges.
//
// WHY A MIRROR. The dashboard's revenue split (net / not-from-quiz / annual /
// other) is defined over individual charges: "$4.99 charges from net-new
// people", "$59.75 bills". The submissions table only carries per-person
// aggregates (lifetime_value_usd), and an aggregate cannot be decomposed into
// dated components — there are $39.75 legacy annuals in the wild that would
// silently corrupt any inference from totals.
//
// FULL RE-WALK EVERY RUN, on purpose. Since launch it is a few hundred
// charges (~4 Stripe pages); walking them all keeps refunds current without
// bookkeeping a cursor, and the upsert makes it idempotent. Revisit if the
// volume ever makes this slow — the fix then is a created-window walk plus a
// trailing refund sweep, not a cursor.
//
// Runs daily at 06:20 UTC (vercel.json) and on demand from the admin session.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { MIRROR_START_ISO } from '@/lib/dashboard-queries'
import { runLedgerChecks, recordLedgerChecks } from '@/lib/ledger-invariants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 300, not 120: the full-history walk plus the refunds and disputes fetches
// blew the old cap and the gateway answered 504 with zero rows written (the
// owner's manual sync, 2026-08-17). The three fetches also run in parallel
// now, so wall time is the charges walk alone, but the ceiling stays high
// because a timeout here fails silent-ish and stale.
export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const cronOk = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  const cookieOk = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!cronOk && !cookieOk) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 })
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 2 })

  // FULL HISTORY, every run (2026-08-16). It used to walk only since the
  // mirror start (Jun 29), which froze the refund state of everything older:
  // the deep history arrived via a one-time backfill, so an old charge
  // refunded last week kept reading as paid, and partial refund amounts were
  // never captured at all. That is how the page said $83,760.56 while the
  // owner's Stripe screen said Net volume $77,464.56 with no bridge between
  // them. ~3,000 charges is ~30 pages — well under the ceiling; revisit only
  // if volume makes this slow.
  // WINDOW WALK (2026-09-05). The full re-walk above was correct and became
  // too slow: 3,238 mirrored charges since 2023-11-11, and the walk pages
  // over every charge ATTEMPT, failures included, so it ran past the 300s
  // ceiling 16 times between 2026-08-17 and 2026-09-05. A job that times out
  // is a job that one day loses rows, and these rows are the money.
  //
  // Only 322 of those 3,238 charges are from the last 45 days, so the daily
  // run now walks the window and nothing else. What the old full walk was
  // FOR — keeping the refund and dispute state of OLD charges current — is
  // kept by the trailing sweep after the upsert: the refunds and disputes
  // endpoints already report globally, and any charge they name that the
  // window did not cover has its refund and dispute columns updated on the
  // row already in the mirror. 111 old charges carry a refund or a dispute
  // today, and the sweep costs no Stripe calls at all.
  //
  // ?full=1 still walks everything, for a backfill or after a schema change.
  // ?days=N overrides the window.
  const fullWalk = req.nextUrl.searchParams.get('full') === '1'
  const daysParam = Number(req.nextUrl.searchParams.get('days'))
  const windowDays = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 3650) : 45
  const sinceEpoch = fullWalk ? 0 : Math.floor(Date.now() / 1000) - windowDays * 86400
  void MIRROR_START_ISO

  type Row = {
    id: string
    amount_cents: number
    currency: string
    charged_at: string
    customer_id: string | null
    email: string | null
    customer_email: string | null
    refunded: boolean
    description: string | null
    synced_at: string
    // Detail columns are OPTIONAL: each is written only when the endpoint
    // that owns it answered this run, so a degraded run can never overwrite
    // good detail with zeros (see the rows assembly below).
    amount_refunded_cents?: number
    disputed?: boolean
    dispute_lost_cents?: number
    dispute_fee_cents?: number
    dispute_open_cents?: number
    fee_cents?: number
    settled_cents?: number | null
    settled_currency?: string | null
    bt_exchange_rate?: number | null
  }

  // Refunds and disputes come from their OWN endpoints. The pinned 2026 API
  // version stopped exposing amount_refunded on the charge object — two
  // charges Stripe itself flags refunded synced with 0 refund detail
  // (caught 2026-08-17) — and dispute OUTCOMES were never on it anyway.
  // Refund and Dispute objects are version-stable, carry their charge id,
  // and the dispute status lets the bridge subtract only LOST disputes,
  // which is exactly what Stripe's own Net volume subtracts.
  //
  // Both fetches degrade gracefully: if the restricted key lacks the Refunds
  // or Disputes read scope, the sync still mirrors charges and SAYS what it
  // could not fetch, instead of dying or pretending zeros are data.
  const refundByCharge = new Map<string, number>()
  // Per disputed charge: amount lost, whether any dispute exists, net dispute
  // FEES from the dispute's own balance transactions ($15 taken at dispute,
  // returned if won — summing bt.fee handles both sides), and the amount
  // currently WITHHELD on disputes still open. The last two exist so the
  // revenue page can reconcile Stripe's home-screen Net volume, which
  // subtracts fees and open-dispute money that rule-6 net deliberately keeps.
  const disputeByCharge = new Map<string, { lost: number; any: boolean; fee: number; open: number }>()
  // An object, not two lets: the closures below mutate these, and TypeScript
  // narrows a captured let to its initializer at the read site (it cannot see
  // that Promise.all ran the closure), which turned the response line into a
  // type error that a masked build check then let through to main.
  const fetchErrors: { refunds: string | null; disputes: string | null; balanceTxn: string | null } = { refunds: null, disputes: null, balanceTxn: null }

  const fetchRefunds = async () => {
    try {
      let after: string | undefined
      for (let p = 0; p < 40; p++) {
        const page = await stripe.refunds.list({ limit: 100, ...(after ? { starting_after: after } : {}) })
        for (const r of page.data) {
          if (r.status === 'failed' || r.status === 'canceled') continue
          const chId = typeof r.charge === 'string' ? r.charge : r.charge?.id
          if (chId) refundByCharge.set(chId, (refundByCharge.get(chId) ?? 0) + (r.amount ?? 0))
        }
        if (!page.has_more) break
        after = page.data[page.data.length - 1]?.id
        if (!after) break
      }
    } catch (e) {
      fetchErrors.refunds = e instanceof Error ? e.message : String(e)
      console.error('[stripe-charges-sync] refunds fetch failed:', fetchErrors.refunds)
    }
  }
  const fetchDisputes = async () => {
    try {
      let after: string | undefined
      for (let p = 0; p < 20; p++) {
        const page = await stripe.disputes.list({ limit: 100, ...(after ? { starting_after: after } : {}) })
        for (const dp of page.data) {
          const chId = typeof dp.charge === 'string' ? dp.charge : dp.charge?.id
          if (!chId) continue
          const cur = disputeByCharge.get(chId) ?? { lost: 0, any: false, fee: 0, open: 0 }
          cur.any = true
          if (dp.status === 'lost') cur.lost += dp.amount ?? 0
          // needs_response / under_review are the statuses where the money is
          // withdrawn but the outcome is not final; warning_* inquiries move
          // no funds. Won and lost are final and covered elsewhere.
          if (dp.status === 'needs_response' || dp.status === 'under_review') cur.open += dp.amount ?? 0
          for (const bt of dp.balance_transactions ?? []) cur.fee += bt.fee ?? 0
          disputeByCharge.set(chId, cur)
        }
        if (!page.has_more) break
        after = page.data[page.data.length - 1]?.id
        if (!after) break
      }
    } catch (e) {
      fetchErrors.disputes = e instanceof Error ? e.message : String(e)
      console.error('[stripe-charges-sync] disputes fetch failed:', fetchErrors.disputes)
    }
  }

  // The charges walk collects snapshots; rows are assembled AFTER all three
  // fetches complete, because refund and dispute amounts join by charge id.
  type Snap = { id: string; amount: number; currency: string; created: number; customerId: string | null; email: string | null; customerEmail: string | null; refunded: boolean; description: string | null; feeCents: number | null; settledCents: number | null; settledCurrency: string | null; btExchangeRate: number | null }
  const snaps: Snap[] = []
  let pages = 0

  // Whether the balance-transaction expand worked. It carries the exact
  // Stripe fee and what the charge SETTLED for — IN THE BALANCE'S OWN
  // CURRENCY, which on this account is NOT always USD: card charges settle
  // in USD, but the 2024 → Jul-2025 PayPal/invoice era settled 1,147 charges
  // into a EUR balance at market × 0.98 (found 2026-08-17 when USD charges
  // appeared to settle at 83–92 cents on the dollar, drifting with the day —
  // an exchange rate, not a fee). settled_cents and fee_cents are therefore
  // cents OF settled_currency, and any USD reading of them must convert via
  // bt_exchange_rate. If the restricted key lacks the Balance transactions
  // read scope the walk falls back to charges alone, says so in the
  // response, and the fee columns are left untouched in the mirror.
  let btOk = true

  // 120-page ceiling = 12,000 charges. The full-history walk pages over ALL
  // charge attempts (failed ones included, filtered below), so the ceiling
  // sits far above the succeeded count; if it is ever hit, the sync is
  // INCOMPLETE and says so in the response rather than quietly serving a
  // truncated mirror.
  const fetchCharges = async () => {
    let startingAfter: string | undefined
    while (pages < 120) {
      // Expand the customer: the CHARGE's billing email and the CUSTOMER's
      // email are frequently different, and attribution matches on email, so
      // storing only one of them loses people.
      let page: Stripe.ApiList<Stripe.Charge>
      try {
        page = await stripe.charges.list({
          created: { gte: sinceEpoch },
          limit: 100,
          expand: btOk ? ['data.customer', 'data.balance_transaction'] : ['data.customer'],
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (btOk && /balance_transaction|permission|scope/i.test(msg)) {
          // Retry the SAME page without the expand, once, and remember: a key
          // without the Balance scope must degrade to a charges-only sync,
          // not die with zero rows written.
          btOk = false
          fetchErrors.balanceTxn = msg
          console.error('[stripe-charges-sync] balance_transaction expand unavailable:', msg)
          continue
        }
        throw e
      }
      pages++
      for (const ch of page.data) {
        if (ch.status !== 'succeeded') continue
        const bt = typeof ch.balance_transaction === 'object' && ch.balance_transaction ? ch.balance_transaction : null
        snaps.push({
          id: ch.id,
          amount: ch.amount,
          currency: ch.currency,
          created: ch.created,
          customerId: typeof ch.customer === 'string' ? ch.customer : ch.customer?.id ?? null,
          email: (ch.billing_details?.email || ch.receipt_email || null)?.toLowerCase() ?? null,
          customerEmail: (typeof ch.customer === 'object' && ch.customer && !ch.customer.deleted
            ? ch.customer.email?.toLowerCase() ?? null
            : null),
          refunded: ch.refunded === true,
          description: ch.description ?? null,
          feeCents: bt ? bt.fee : null,
          settledCents: bt ? bt.amount : null,
          settledCurrency: bt ? bt.currency : null,
          btExchangeRate: bt ? bt.exchange_rate ?? null : null,
        })
      }
      if (!page.has_more) break
      startingAfter = page.data[page.data.length - 1]?.id
      if (!startingAfter) break
    }
  }

  // IN PARALLEL: the three endpoints are independent, and running them in
  // sequence is what pushed the old 120s cap into a 504. Wall time is now the
  // charges walk alone.
  await Promise.all([fetchCharges(), fetchRefunds(), fetchDisputes()])
  const truncated = pages >= 120

  const syncStamp = new Date().toISOString()
  // Detail columns are written ONLY when their endpoint answered this run.
  // Before this guard, a transient refunds or disputes failure upserted the
  // defaults over every previously good value, silently lifting net by the
  // whole refund total until the next clean run. The conditions are per-run
  // constants, so every row in a chunk carries the same keys (PostgREST
  // requires uniform keys in a bulk upsert).
  const rows: Row[] = snaps.map(s => ({
    id: s.id,
    amount_cents: s.amount,
    currency: s.currency,
    charged_at: new Date(s.created * 1000).toISOString(),
    customer_id: s.customerId,
    email: s.email,
    customer_email: s.customerEmail,
    refunded: s.refunded,
    description: s.description,
    synced_at: syncStamp,
    ...(fetchErrors.refunds ? {} : { amount_refunded_cents: refundByCharge.get(s.id) ?? 0 }),
    ...(fetchErrors.disputes
      ? {}
      : {
          disputed: disputeByCharge.get(s.id)?.any === true,
          dispute_lost_cents: disputeByCharge.get(s.id)?.lost ?? 0,
          dispute_fee_cents: disputeByCharge.get(s.id)?.fee ?? 0,
          dispute_open_cents: disputeByCharge.get(s.id)?.open ?? 0,
        }),
    ...(btOk ? { fee_cents: s.feeCents ?? 0, settled_cents: s.settledCents, settled_currency: s.settledCurrency, bt_exchange_rate: s.btExchangeRate } : {}),
  }))

  const c = sb()
  let written = 0
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error } = await c.from('stripe_charges').upsert(chunk, { onConflict: 'id' })
    if (error) {
      return NextResponse.json({ error: `upsert failed after ${written}: ${error.message}` }, { status: 500 })
    }
    written += chunk.length
  }

  // TRAILING SWEEP. Charges outside the window that the refunds or disputes
  // endpoints named this run: their money changed, their row did not move.
  // Two round trips, no Stripe calls — the amounts are already in the maps,
  // only the mirror needs to hear about them. Skipped when a fetch failed,
  // for the same reason the columns above are conditional: a degraded run
  // must never write zeros over good detail.
  let swept = 0
  if (!fullWalk && !fetchErrors.refunds && !fetchErrors.disputes) {
    const inWindow = new Set(snaps.map(s2 => s2.id))
    // Array.from, not a spread: this file's TS target does not allow
    // iterating a Map iterator directly, and the rest of the route already
    // uses Array.from for the same reason.
    const touched = new Set<string>(Array.from(refundByCharge.keys()).concat(Array.from(disputeByCharge.keys())))
    const sweepIds = Array.from(touched).filter(id => !inWindow.has(id))
    for (let i = 0; i < sweepIds.length; i += 200) {
      const ids = sweepIds.slice(i, i + 200)
      const { data: existing, error: readErr } = await c
        .from('stripe_charges')
        .select('id')
        .in('id', ids)
      if (readErr || !existing?.length) continue
      for (const row of existing as { id: string }[]) {
        const d = disputeByCharge.get(row.id)
        const { error: updErr } = await c
          .from('stripe_charges')
          .update({
            amount_refunded_cents: refundByCharge.get(row.id) ?? 0,
            disputed: d?.any === true,
            dispute_lost_cents: d?.lost ?? 0,
            dispute_fee_cents: d?.fee ?? 0,
            dispute_open_cents: d?.open ?? 0,
            synced_at: syncStamp,
          })
          .eq('id', row.id)
        if (!updErr) swept++
      }
    }
  }

  // The mirror has just moved, so the ledger's invariants are re-checked
  // against what it now says. This is the guardrail the 2026-08-11 bugs got
  // past: a double-claimed renewal and 39 deduplicated trials both survived
  // for weeks because nothing asked whether the numbers still added up.
  // Failures are recorded and returned, never thrown: a check that can break
  // the sync it guards is the first thing anyone disables.
  const checks = await runLedgerChecks(c)
  await recordLedgerChecks(c, checks)
  const failed = checks.filter(k => !k.ok)
  if (failed.length) {
    console.error('[stripe-charges-sync] LEDGER CHECKS FAILED:', failed.map(f => `${f.key}: ${f.detail}`).join(' | '))
  }

  return NextResponse.json({
    ok: true,
    mode: fullWalk ? 'full-history walk' : `window walk, last ${windowDays} days`,
    since: fullWalk ? 'account inception' : new Date(sinceEpoch * 1000).toISOString(),
    pages,
    charges: rows.length,
    written,
    // Old charges whose refund or dispute money moved, updated in place
    // without re-walking them. Zero on a full walk, where the window covers
    // everything already.
    sweptOutsideWindow: swept,
    refunded: rows.filter(r => r.refunded).length,
    refundDetailUsd: Array.from(refundByCharge.values()).reduce((a, b) => a + b, 0) / 100,
    disputesLostUsd: Array.from(disputeByCharge.values()).reduce((a, b) => a + b.lost, 0) / 100,
    disputesOpenUsd: Array.from(disputeByCharge.values()).reduce((a, b) => a + b.open, 0) / 100,
    // Settlement is multi-currency (see the btOk comment), so fees and
    // settled totals are reported per settlement currency, never mushed.
    ...(btOk
      ? {
          settledByCurrency: Object.fromEntries(
            Array.from(
              snaps.reduce((m, s) => {
                const cur = s.settledCurrency ?? 'unknown'
                const e = m.get(cur) ?? { settled: 0, fees: 0, n: 0 }
                e.settled += s.settledCents ?? 0
                e.fees += s.feeCents ?? 0
                e.n++
                m.set(cur, e)
                return m
              }, new Map<string, { settled: number; fees: number; n: number }>()),
            ).map(([cur, e]) => [cur, { settled: e.settled / 100, fees: e.fees / 100, charges: e.n }]),
          ),
        }
      : {}),
    checksPassed: failed.length === 0,
    checks,
    ...(fetchErrors.refunds ? { REFUNDS_NOT_FETCHED: `the key likely lacks Refunds read scope: ${fetchErrors.refunds.slice(0, 200)}` } : {}),
    ...(fetchErrors.disputes ? { DISPUTES_NOT_FETCHED: `the key likely lacks Disputes read scope: ${fetchErrors.disputes.slice(0, 200)}` } : {}),
    ...(fetchErrors.balanceTxn ? { FEES_NOT_FETCHED: `the key likely lacks Balance transactions read scope: ${fetchErrors.balanceTxn.slice(0, 200)}` } : {}),
    ...(truncated ? { WARNING: 'page ceiling hit — the mirror is INCOMPLETE' } : {}),
  })
}
