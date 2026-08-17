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
  const sinceEpoch = 0
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
    amount_refunded_cents: number
    disputed: boolean
    dispute_lost_cents: number
    description: string | null
    synced_at: string
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
  const disputeByCharge = new Map<string, { lost: number; any: boolean }>()
  let refundsError: string | null = null
  let disputesError: string | null = null

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
      refundsError = e instanceof Error ? e.message : String(e)
      console.error('[stripe-charges-sync] refunds fetch failed:', refundsError)
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
          const cur = disputeByCharge.get(chId) ?? { lost: 0, any: false }
          cur.any = true
          if (dp.status === 'lost') cur.lost += dp.amount ?? 0
          disputeByCharge.set(chId, cur)
        }
        if (!page.has_more) break
        after = page.data[page.data.length - 1]?.id
        if (!after) break
      }
    } catch (e) {
      disputesError = e instanceof Error ? e.message : String(e)
      console.error('[stripe-charges-sync] disputes fetch failed:', disputesError)
    }
  }

  // The charges walk collects snapshots; rows are assembled AFTER all three
  // fetches complete, because refund and dispute amounts join by charge id.
  type Snap = { id: string; amount: number; currency: string; created: number; customerId: string | null; email: string | null; customerEmail: string | null; refunded: boolean; description: string | null }
  const snaps: Snap[] = []
  let pages = 0

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
      const page = await stripe.charges.list({
        created: { gte: sinceEpoch },
        limit: 100,
        expand: ['data.customer'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })
      pages++
      for (const ch of page.data) {
        if (ch.status !== 'succeeded') continue
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
  const rows: Row[] = snaps.map(s => ({
    id: s.id,
    amount_cents: s.amount,
    currency: s.currency,
    charged_at: new Date(s.created * 1000).toISOString(),
    customer_id: s.customerId,
    email: s.email,
    customer_email: s.customerEmail,
    refunded: s.refunded,
    amount_refunded_cents: refundByCharge.get(s.id) ?? 0,
    disputed: disputeByCharge.get(s.id)?.any === true,
    dispute_lost_cents: disputeByCharge.get(s.id)?.lost ?? 0,
    description: s.description,
    synced_at: syncStamp,
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
    since: 'account inception (full-history walk)',
    pages,
    charges: rows.length,
    written,
    refunded: rows.filter(r => r.refunded).length,
    refundDetailUsd: Array.from(refundByCharge.values()).reduce((a, b) => a + b, 0) / 100,
    disputesLostUsd: Array.from(disputeByCharge.values()).reduce((a, b) => a + b.lost, 0) / 100,
    checksPassed: failed.length === 0,
    checks,
    ...(refundsError ? { REFUNDS_NOT_FETCHED: `the key likely lacks Refunds read scope: ${refundsError.slice(0, 200)}` } : {}),
    ...(disputesError ? { DISPUTES_NOT_FETCHED: `the key likely lacks Disputes read scope: ${disputesError.slice(0, 200)}` } : {}),
    ...(truncated ? { WARNING: 'page ceiling hit — the mirror is INCOMPLETE' } : {}),
  })
}
