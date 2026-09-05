// Mirror Stripe's FAILED payments and its INVOICES.
//
// WHY THIS EXISTS. On 2026-08-20 the owner checked a handful of people the
// recovery queue called "never attempted" and found failed charges on them in
// Stripe. He was right and the label was wrong. Two blind spots caused it:
//
//   1. stripe_charges keeps SUCCEEDED charges only — the charges sync filters
//      `ch.status !== 'succeeded'` on the way in and the table has no status
//      column at all. A declined card has never once been written down here.
//   2. admin_actions logs only OUR retry button. Stripe's own subscription
//      dunning — the automatic attempt when the annual comes due, plus Smart
//      Retries afterwards — happens entirely inside Stripe and reaches no
//      table we own.
//
// So every screen we have was blind to the single most important fact about a
// lapsed trial: somebody already tried to take the money and the card said no.
//
// WHAT IT WRITES, and why two tables rather than one:
//   stripe_payment_failures — one row per failed charge attempt, carrying the
//     decline reason. Answers "why did this person not pay".
//   stripe_invoices — one row per invoice, carrying what is still owed, when
//     it was due, how many times it was attempted, whether Stripe has given
//     up, and the hosted URL. Answers "what is outstanding, and how could
//     they still pay it".
// They join on invoice_id. Neither is derivable from the other: an invoice
// does not carry the decline reason, and a failed charge does not carry the
// outstanding balance or the payment link.
//
// WHERE THE ERROR DETAIL COMES FROM. Deliberately from the failed CHARGE, not
// from expanding invoice.payment_intent. The pinned 2026 API has already moved
// fields off objects once in this codebase (amount_refunded vanished from the
// charge object and cost us a wrong net figure for weeks), and charge
// .failure_code / .failure_message / .outcome are version-stable and carry an
// `invoice` back-reference. One walk, no fragile expand.
//
// KNOWN LIMIT, stated rather than hidden: a payment that fails without ever
// creating a Charge object (some non-card methods, some early PaymentIntent
// failures) will not appear in stripe_payment_failures. Card dunning — which
// is what this account's lapsed annuals are — always creates one.
//
// FULL RE-WALK EVERY RUN, like the charges sync, for the same reason: statuses
// change underneath us (an open invoice gets paid, Stripe marks one
// uncollectible) and a cursor would freeze them. Upserts make it idempotent.
//
// Runs hourly at :35 (vercel.json) and on demand from the admin session.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Two full-history walks. Same reasoning as the charges sync's 300: a timeout
// here fails stale rather than loud, so the ceiling stays well clear.
export const maxDuration = 300

const CHARGE_PAGE_CAP = 120   // 12,000 charge attempts
const INVOICE_PAGE_CAP = 120  // 12,000 invoices

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

const iso = (epoch: number | null | undefined): string | null =>
  typeof epoch === 'number' && epoch > 0 ? new Date(epoch * 1000).toISOString() : null

const lower = (s: string | null | undefined): string | null => (s ? s.toLowerCase() : null)

interface FailureRow {
  id: string
  customer_id: string | null
  email: string | null
  customer_email: string | null
  amount_cents: number
  currency: string | null
  failed_at: string
  failure_code: string | null
  failure_message: string | null
  decline_code: string | null
  network_status: string | null
  seller_message: string | null
  invoice_id: string | null
  payment_intent_id: string | null
  description: string | null
  synced_at: string
}

interface InvoiceRow {
  id: string
  number: string | null
  customer_id: string | null
  email: string | null
  status: string | null
  collection_method: string | null
  currency: string | null
  amount_due_cents: number
  amount_paid_cents: number
  amount_remaining_cents: number
  created_at: string
  due_date: string | null
  finalized_at: string | null
  paid_at: string | null
  voided_at: string | null
  uncollectible_at: string | null
  attempt_count: number
  attempted: boolean
  next_payment_attempt: string | null
  subscription_id: string | null
  charge_id: string | null
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  has_payment_method: boolean
  synced_at: string
}

/** Stripe moved `subscription` and `charge` off the invoice object in some 2025+
 *  versions; read them defensively so a shape change degrades one column
 *  instead of throwing the whole sync. */
function readRef(obj: unknown, key: string): string | null {
  const v = (obj as Record<string, unknown> | null)?.[key]
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id
  return null
}

/** Is there a DEFAULT payment method set, by the invoice's own default, then
 *  the legacy default_source — both invoice-level fields, no customer
 *  expansion needed.
 *
 *  PROVEN UNRELIABLE, 2026-08-20 — kept only as a free, best-effort hint, NEVER
 *  as a gate. Ton Kuijlen has a Mastercard attached and nine Stripe retry
 *  attempts on his invoice (Smart Retries never fires without a card to try),
 *  yet this returned false for him: the account's pinned API version does not
 *  populate these fields the way expected, the same class of bug that moved
 *  amount_refunded off the Charge object. A false negative here once told the
 *  owner a real customer had "no card on file". This used to also check the
 *  CUSTOMER object's own invoice_settings/default_source, which needed
 *  `expand: ['data.customer']` on the list call — removed 2026-08-30 once that
 *  expand turned out to be the likely cause of this sync timing out at 300s
 *  (see walkInvoices): the customer-level fallback was already unreliable, so
 *  paying for it on every one of ~2,400 invoices, every hour, bought nothing.
 *
 *  The AUTHORITATIVE check lives in app/api/admin/invoice-retry/route.ts,
 *  which calls stripe.paymentMethods.list() live, at the moment of the click —
 *  a dedicated endpoint whose shape cannot silently move the way an object
 *  field can. Do not resurrect this function to hide or show a button. */
function hasChargeableMethod(inv: Stripe.Invoice): boolean {
  if (readRef(inv, 'default_payment_method')) return true
  if (readRef(inv, 'default_source')) return true
  return false
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const cronOk = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  const cookieOk = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!cronOk && !cookieOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 })
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 5, timeout: 30_000 })

  // WINDOW WALK (2026-09-05). This route walked every charge ATTEMPT since
  // account inception on every run: 3,238 succeeded plus 7,713 failed is
  // ~11,000 attempts, ~110 sequential pages, and it hit the 300s ceiling 16
  // times between 2026-08-17 and 2026-09-05 together with the charges sync.
  // A job that times out is a job that one day loses rows.
  //
  // 1,775 of those failures are from the last 45 days, so the daily run walks
  // the window. A failed charge never changes after the fact, so nothing is
  // lost by not re-reading a failure from March.
  //
  // INVOICES ARE DIFFERENT and get two passes, because an invoice DOES
  // change: an old unpaid one that finally gets paid must stop being
  // outstanding, and a created-date window would never look at it again. So
  // the window pass is joined by a pass over everything still `open`,
  // whatever its age. Open invoices are few and they are the only ones
  // dunning acts on.
  //
  // ?full=1 walks everything, for a backfill. ?days=N overrides the window.
  const fullWalk = req.nextUrl.searchParams.get('full') === '1'
  const daysParam = Number(req.nextUrl.searchParams.get('days'))
  const windowDays = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 3650) : 45
  const sinceEpoch = fullWalk ? 0 : Math.floor(Date.now() / 1000) - windowDays * 86400

  const syncStamp = new Date().toISOString()
  const failures: FailureRow[] = []
  const invoices: InvoiceRow[] = []
  const errors: { charges: string | null; invoices: string | null } = { charges: null, invoices: null }
  let chargePages = 0
  let invoicePages = 0
  let succeededSeen = 0

  // ── FAILED CHARGES ────────────────────────────────────────────────────
  // The same endpoint the charges sync walks, keeping the rows it throws away.
  const walkCharges = async () => {
    try {
      let after: string | undefined
      while (chargePages < CHARGE_PAGE_CAP) {
        const page: Stripe.ApiList<Stripe.Charge> = await stripe.charges.list({
          created: { gte: sinceEpoch },
          limit: 100,
          expand: ['data.customer'],
          ...(after ? { starting_after: after } : {}),
        })
        chargePages++
        for (const ch of page.data) {
          if (ch.status === 'succeeded') { succeededSeen++; continue }
          // 'pending' is not a failure — it has not resolved yet.
          if (ch.status !== 'failed') continue
          const out = ch.outcome ?? null
          failures.push({
            id: ch.id,
            customer_id: typeof ch.customer === 'string' ? ch.customer : ch.customer?.id ?? null,
            email: lower(ch.billing_details?.email || ch.receipt_email || null),
            customer_email:
              typeof ch.customer === 'object' && ch.customer && !ch.customer.deleted
                ? lower(ch.customer.email) : null,
            amount_cents: ch.amount ?? 0,
            currency: ch.currency ?? null,
            failed_at: new Date((ch.created ?? 0) * 1000).toISOString(),
            failure_code: ch.failure_code ?? null,
            failure_message: ch.failure_message ?? null,
            // The issuer's own reason. This is the field that tells a
            // do-not-honour apart from an expired card, which is the whole
            // difference between "retry is pointless" and "ask for a new card".
            decline_code: (ch as unknown as { failure_balance_transaction?: unknown; outcome?: { reason?: string } })
              .outcome?.reason ?? null,
            network_status: out?.network_status ?? null,
            seller_message: out?.seller_message ?? null,
            invoice_id: readRef(ch, 'invoice'),
            payment_intent_id: readRef(ch, 'payment_intent'),
            description: ch.description ?? null,
            synced_at: syncStamp,
          })
        }
        if (!page.has_more) break
        after = page.data[page.data.length - 1]?.id
        if (!after) break
      }
    } catch (e) {
      errors.charges = e instanceof Error ? e.message : String(e)
      console.error('[stripe-dunning-sync] charges walk failed:', errors.charges)
    }
  }

  // ── INVOICES ──────────────────────────────────────────────────────────
  /** One pass over the invoice list. Called twice: once for the recent
   *  window, once for everything still OPEN regardless of age. An old
   *  invoice that gets paid must stop being outstanding, and a created-date
   *  window alone would never look at it again. */
  const walkInvoicePass = async (filter: Stripe.InvoiceListParams) => {
    try {
      let after: string | undefined
      while (invoicePages < INVOICE_PAGE_CAP) {
        const page: Stripe.ApiList<Stripe.Invoice> = await stripe.invoices.list({
          limit: 100,
          ...filter,
          ...(after ? { starting_after: after } : {}),
        })
        invoicePages++
        for (const inv of page.data) {
          if (!inv.id) continue
          const st = inv.status_transitions ?? null
          invoices.push({
            id: inv.id,
            number: inv.number ?? null,
            customer_id: readRef(inv, 'customer'),
            email: lower(inv.customer_email),
            status: inv.status ?? null,
            collection_method: inv.collection_method ?? null,
            currency: inv.currency ?? null,
            amount_due_cents: inv.amount_due ?? 0,
            amount_paid_cents: inv.amount_paid ?? 0,
            amount_remaining_cents: inv.amount_remaining ?? 0,
            created_at: new Date((inv.created ?? 0) * 1000).toISOString(),
            due_date: iso(inv.due_date),
            finalized_at: iso(st?.finalized_at),
            paid_at: iso(st?.paid_at),
            voided_at: iso(st?.voided_at),
            uncollectible_at: iso(st?.marked_uncollectible_at),
            attempt_count: inv.attempt_count ?? 0,
            attempted: inv.attempted === true,
            next_payment_attempt: iso(inv.next_payment_attempt),
            subscription_id: readRef(inv, 'subscription'),
            charge_id: readRef(inv, 'charge'),
            hosted_invoice_url: inv.hosted_invoice_url ?? null,
            invoice_pdf: inv.invoice_pdf ?? null,
            has_payment_method: hasChargeableMethod(inv),
            synced_at: syncStamp,
          })
        }
        if (!page.has_more) break
        after = page.data[page.data.length - 1]?.id
        if (!after) break
      }
    } catch (e) {
      errors.invoices = e instanceof Error ? e.message : String(e)
      console.error('[stripe-dunning-sync] invoices walk failed:', errors.invoices)
    }
  }

  // SEQUENTIAL, not Promise.all, and each written the moment ITS walk ends —
  // not both held until the slower one also finishes.
  //
  // Found 2026-08-30 (owner's watcher flagged /admin/revenue/unpaid stale for
  // 21.5h): this route was timing out at the 300s platform ceiling on most
  // hourly runs (23 occurrences since 2026-08-17, Vercel runtime error log),
  // yet stripe_payment_failures kept refreshing while stripe_invoices did
  // not. Cause: both walks ran concurrently under one Promise.all with a
  // single write step after BOTH resolved — a slow or killed invoices walk
  // meant the whole function never reached either write, and running two
  // full Stripe walks at once likely doubled the account's request rate into
  // its rate limit right when it mattered. Now invoices goes first (it is
  // the one that was starving) and gets its own write immediately, so a
  // charges walk that runs long afterward can no longer cost invoices its
  // freshness, or vice versa — and a bad run degrades to ONE stale table
  // instead of both.
  const c = sb()
  const write = async (table: string, rows: object[]) => {
    let n = 0
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200)
      const { error } = await c.from(table).upsert(chunk, { onConflict: 'id' })
      if (error) throw new Error(`${table} upsert failed after ${n}: ${error.message}`)
      n += chunk.length
    }
    return n
  }

  let failuresWritten = 0
  let invoicesWritten = 0
  try {
    // Recent invoices, then every open one regardless of age. The second
    // pass is what keeps stripe_outstanding_invoices honest.
    await walkInvoicePass(fullWalk ? {} : { created: { gte: sinceEpoch } })
    if (!fullWalk) await walkInvoicePass({ status: 'open' })
    // A walk that ERRORED wrote nothing, so do not upsert its partial rows on
    // top of a complete previous run. Same rule the charges sync applies to
    // its refund and dispute detail: a degraded run must never overwrite good
    // data with an incomplete picture.
    // DEDUPE. The two invoice passes overlap by construction: an invoice that
    // is both recent and still open is collected twice, and Postgres refuses
    // an ON CONFLICT that touches the same row twice inside one statement.
    // Last write wins, which is the open pass, the fresher read of the two.
    const invoicesById = new Map<string, InvoiceRow>()
    for (const inv of invoices) invoicesById.set(inv.id, inv)
    const uniqueInvoices = Array.from(invoicesById.values())
    if (!errors.invoices) invoicesWritten = await write('stripe_invoices', uniqueInvoices)
    await walkCharges()
    if (!errors.charges) failuresWritten = await write('stripe_payment_failures', failures)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  const { count: outstanding } = await c
    .from('stripe_outstanding_invoices')
    .select('id', { count: 'exact', head: true })

  const truncated = chargePages >= CHARGE_PAGE_CAP || invoicePages >= INVOICE_PAGE_CAP

  // NON-2xx WHEN A WALK FAILED. This returned 200 with ok:false, which meant a
  // sync that fetched nothing and wrote nothing looked identical to a healthy
  // one in the Vercel logs — the precise shape of failure this whole morning
  // was spent removing from other places. Status codes are what monitoring
  // reads; a body nobody parses is not a signal.
  const failed = !!errors.charges || !!errors.invoices
  return NextResponse.json({
    ok: !failed,
    synced_at: syncStamp,
    failures: { found: failures.length, written: failuresWritten, skipped_succeeded: succeededSeen, pages: chargePages },
    invoices: { found: invoices.length, unique: invoicesWritten, written: invoicesWritten, pages: invoicePages },
    outstanding_invoices: outstanding ?? null,
    // Say what did not happen, loudly. A sync that half-worked and returns 200
    // is how a stale mirror looks healthy for weeks.
    errors,
    truncated,
    ...(truncated ? { warning: 'PAGE CAP HIT — this mirror is INCOMPLETE. Raise the cap.' } : {}),
  }, { status: failed ? 500 : 200 })
}
