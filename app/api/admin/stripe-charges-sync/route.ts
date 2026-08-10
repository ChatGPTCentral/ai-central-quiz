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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

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

  // Monday of launch week, not launch day: the week-gran matrix column that
  // contains launch day starts Jun 29, and a mirror starting Jul 5 made that
  // column silently incomplete.
  const sinceEpoch = Math.floor(Date.parse(`${MIRROR_START_ISO}T00:00:00Z`) / 1000)

  type Row = {
    id: string
    amount_cents: number
    currency: string
    charged_at: string
    customer_id: string | null
    email: string | null
    refunded: boolean
    description: string | null
    synced_at: string
  }
  const rows: Row[] = []
  let pages = 0
  let startingAfter: string | undefined

  // 50-page ceiling = 5,000 charges. Far above current volume; if it is ever
  // hit, the sync is INCOMPLETE and says so in the response rather than
  // quietly serving a truncated mirror.
  while (pages < 50) {
    const page = await stripe.charges.list({
      created: { gte: sinceEpoch },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    pages++
    for (const ch of page.data) {
      if (ch.status !== 'succeeded') continue
      rows.push({
        id: ch.id,
        amount_cents: ch.amount,
        currency: ch.currency,
        charged_at: new Date(ch.created * 1000).toISOString(),
        customer_id: typeof ch.customer === 'string' ? ch.customer : ch.customer?.id ?? null,
        email: (ch.billing_details?.email || ch.receipt_email || null)?.toLowerCase() ?? null,
        refunded: ch.refunded === true,
        description: ch.description ?? null,
        synced_at: new Date().toISOString(),
      })
    }
    if (!page.has_more) break
    startingAfter = page.data[page.data.length - 1]?.id
    if (!startingAfter) break
  }
  const truncated = pages >= 50

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

  return NextResponse.json({
    ok: true,
    since: MIRROR_START_ISO,
    pages,
    charges: rows.length,
    written,
    refunded: rows.filter(r => r.refunded).length,
    ...(truncated ? { WARNING: 'page ceiling hit — the mirror is INCOMPLETE' } : {}),
  })
}
