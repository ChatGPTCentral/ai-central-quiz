// Retry an outstanding Stripe invoice, from /admin/revenue/unpaid.
//
// Owner, 2026-08-20: "a queue of invoices outstanding that I can retry the
// charge just as you did for the outstanding trials." This is the money-moving
// half of that. It is the sibling of /api/admin/charge-annual and it copies
// that route's posture deliberately: a button that moves real money must
// refuse more readily than it charges.
//
// TWO ACTIONS, and they are not interchangeable:
//
//   pay   invoices.pay() — Stripe charges the payment method on file, right
//         now. This re-runs the card that already failed. Use it when the
//         earlier failure was transient: insufficient funds, a processing
//         error, a network decline.
//
//   send  invoices.sendInvoice() — Stripe emails the hosted invoice. The
//         person pays it with ANY card, including a different one. This is
//         the only lever that works on the failures a retry can never fix:
//         a card that does not support the purchase type, an expired card, a
//         3DS challenge that needs the cardholder present. As of today we had
//         sent zero of these, ever.
//         An invoice set to charge_automatically cannot be emailed, so this
//         switches collection_method to send_invoice first, with a due date.
//
// THE GUARDS, all re-checked against Stripe rather than trusted from the
// client, because a stale page is not a permission:
//   · admin session required
//   · the invoice is re-read from Stripe; status must be 'open'
//   · REFUSED if nothing is owed
//   · REFUSED if the person paid us anything after the invoice was raised —
//     64 of these invoices belong to people who already paid another way, and
//     charging them again is the worst outcome this button can produce
//   · idempotency key from invoice id + action, so a double click cannot
//     charge twice
//   · every attempt lands in admin_actions, refusals included, which is what
//     orders the queue
//
// The result reaches the screen at the next :35 dunning sync.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Days the person gets to pay an emailed invoice. Short enough to be a real
 *  deadline, long enough to survive a weekend and a holiday. */
const DAYS_UNTIL_DUE = 7

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

async function audit(action: string, personKey: string | null, customerId: string | null, detail: Record<string, unknown>) {
  try {
    await db().from('admin_actions').insert({ action, person_key: personKey, customer_id: customerId, detail })
  } catch (e) {
    // An audit failure must never swallow the outcome of a money action.
    console.error('[invoice-retry] audit insert failed:', e)
  }
}

const refuse = async (invoiceId: string, personKey: string | null, customerId: string | null, reason: string) => {
  await audit('invoice_refused', personKey, customerId, { invoice_id: invoiceId, reason })
  return NextResponse.json({ ok: false, refused: true, error: `refused: ${reason}` }, { status: 409 })
}

export async function POST(req: NextRequest) {
  const cookieOk = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!cookieOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    invoiceId?: string; action?: string; personKey?: string | null
  }
  const invoiceId = String(body.invoiceId || '').trim()
  const action = body.action === 'send' ? 'send' : 'pay'
  if (!invoiceId.startsWith('in_')) {
    return NextResponse.json({ error: 'invoiceId must be a Stripe invoice id' }, { status: 400 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 })
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 2, timeout: 30_000 })

  // ── Re-read from Stripe. The page may be minutes stale, and this decides
  //    whether to move money.
  let inv: Stripe.Invoice
  try {
    inv = await stripe.invoices.retrieve(invoiceId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await audit('invoice_failed', body.personKey ?? null, null, { invoice_id: invoiceId, action, error: msg })
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }

  const personKey = (inv.customer_email || body.personKey || null)?.toLowerCase() ?? null
  const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id ?? null
  const owed = inv.amount_remaining ?? 0

  if (inv.status !== 'open') return refuse(invoiceId, personKey, customerId, `invoice is ${inv.status}, not open`)
  if (owed <= 0) return refuse(invoiceId, personKey, customerId, 'nothing is owed on this invoice')

  // The guard that matters most. Somebody who has paid us since this invoice
  // was raised is a customer, not a debtor.
  if (personKey || customerId) {
    const createdIso = new Date((inv.created ?? 0) * 1000).toISOString()
    const c = db()
    let q = c.from('stripe_charges').select('id, charged_at', { count: 'exact', head: false })
      .gt('charged_at', createdIso).eq('refunded', false).limit(1)
    q = personKey && customerId
      ? q.or(`email.eq.${personKey},customer_email.eq.${personKey},customer_id.eq.${customerId}`)
      : personKey
        ? q.or(`email.eq.${personKey},customer_email.eq.${personKey}`)
        : q.eq('customer_id', customerId as string)
    const { data: paidSince } = await q
    if (paidSince && paidSince.length > 0) {
      return refuse(invoiceId, personKey, customerId, 'this person paid us after the invoice was raised')
    }
  }

  const idempotencyKey = `inv-${action}-${invoiceId}`

  // ── SEND: email the hosted invoice so they can pay with a different card.
  if (action === 'send') {
    try {
      if (inv.collection_method !== 'send_invoice') {
        // An auto-charge invoice cannot be emailed as an invoice. Switch it,
        // and give a real due date at the same time — Stripe requires one.
        await stripe.invoices.update(invoiceId, {
          collection_method: 'send_invoice',
          days_until_due: DAYS_UNTIL_DUE,
        })
      }
      const sent = await stripe.invoices.sendInvoice(invoiceId, undefined, { idempotencyKey })
      await audit('invoice_emailed', personKey, customerId, {
        invoice_id: invoiceId, amount_cents: owed, currency: inv.currency,
        hosted_invoice_url: sent.hosted_invoice_url, days_until_due: DAYS_UNTIL_DUE,
      })
      return NextResponse.json({
        ok: true, action: 'send', invoice: invoiceId,
        status: sent.status,
        payUrl: sent.hosted_invoice_url,
        message: `emailed to ${personKey ?? 'the customer'}, due in ${DAYS_UNTIL_DUE} days. They can pay with any card.`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await audit('invoice_failed', personKey, customerId, { invoice_id: invoiceId, action, error: msg })
      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }
  }

  // ── PAY: charge the payment method on file, now.
  try {
    const paid = await stripe.invoices.pay(invoiceId, {}, { idempotencyKey })
    const ok = paid.status === 'paid'
    await audit(ok ? 'invoice_paid' : 'invoice_failed', personKey, customerId, {
      invoice_id: invoiceId, amount_cents: owed, currency: inv.currency, status: paid.status,
    })
    return NextResponse.json({
      ok, action: 'pay', invoice: invoiceId, status: paid.status,
      message: ok
        ? `paid ${(owed / 100).toFixed(2)} ${String(inv.currency || 'usd').toUpperCase()}. The screen updates at the next :35 sync.`
        : `Stripe returned status ${paid.status}. Try the email invoice instead.`,
    })
  } catch (e) {
    // A decline arrives here as an exception. Report the reason verbatim: the
    // reason IS the next decision, and a truncated one sent the owner looking
    // for a phantom problem on 2026-08-13.
    const msg = e instanceof Error ? e.message : String(e)
    await audit('invoice_failed', personKey, customerId, { invoice_id: invoiceId, action, error: msg })
    return NextResponse.json({ ok: false, error: msg, canEmail: true }, { status: 502 })
  }
}
