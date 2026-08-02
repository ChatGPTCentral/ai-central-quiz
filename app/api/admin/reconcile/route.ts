// Reconciliation: does every real Stripe sale show up in our funnel?
//
// Why this exists. Two datasets disagree and one of them is wrong:
//   - Stripe says non-US payments COMPLETE as well as US ones (34% vs 31%),
//     and shows roughly 55 successful non-US payments in 30 days.
//   - Our submissions table shows non-US quiz takers converting at 2.04%
//     against 6.57% for the US, and only ~10 non-US net-new paid.
//   - Click rate is identical across every cohort (32-36%).
//
// Same clicks in, same payment completion, 3x different recorded conversion.
// That cannot all be true. The likely culprit is the JOIN, not the funnel:
// buyers who pay with a different email from the one they gave the quiz never
// get linked, and we have already hand-merged four of those.
//
// If that is what is happening, then "US converts 3.2x better" is a
// measurement artifact and any plan built on it is built on sand. So this
// walks real Stripe successes and asks, one by one, whether we can see them.
//
// Read-only. Nothing is written; the repair is a separate, supervised step.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 })
  const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 2 })

  const days = Math.min(90, Math.max(1, parseInt(req.nextUrl.searchParams.get('days') || '30', 10)))
  const since = Math.floor(Date.now() / 1000) - days * 86400

  // 1. Every successful charge in the window, with the email and the issuing
  //    country. billing_details.email is what the buyer actually typed into
  //    Stripe, which is precisely the value that can diverge from the quiz.
  type Sale = {
    id: string; created: string; amount: number; email: string | null
    country: string | null; metaSubmissionId: string | null
  }
  const sales: Sale[] = []
  try {
    let startingAfter: string | undefined
    for (let page = 0; page < 6; page++) {
      const list = await stripe.charges.list({
        limit: 100, created: { gte: since },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })
      for (const ch of list.data) {
        if (ch.status !== 'succeeded' || ch.refunded) continue
        if ((ch.amount - (ch.amount_refunded || 0)) <= 0) continue
        sales.push({
          id: ch.id,
          created: new Date(ch.created * 1000).toISOString(),
          amount: ch.amount,
          email: (ch.billing_details?.email || ch.receipt_email || '').toLowerCase() || null,
          country: ch.payment_method_details?.card?.country || ch.billing_details?.address?.country || null,
          metaSubmissionId:
            (ch.metadata?.submission_id as string | undefined) ||
            (typeof ch.payment_intent === 'string' ? null : (ch.payment_intent?.metadata?.submission_id as string | undefined)) ||
            null,
        })
      }
      if (!list.has_more) break
      startingAfter = list.data[list.data.length - 1]?.id
      if (!startingAfter) break
    }
  } catch (e) {
    return NextResponse.json({ error: 'stripe_failed', detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }

  // 2. Can we see each one? Two ways a sale is legitimately ours: the metadata
  //    carries the submission id (embedded checkout sets it), or the paying
  //    email matches a submission. Anything matching neither is a sale our
  //    funnel is blind to.
  const client = db()
  const emails = Array.from(new Set(sales.map(s => s.email).filter((e): e is string => !!e)))
  const known = new Map<string, { id: string; source: string | null; created_at: string | null; ip_country: string | null; charge_at: string | null }>()

  for (let i = 0; i < emails.length; i += 200) {
    const chunk = emails.slice(i, i + 200)
    const { data } = await client
      .from('submissions')
      .select('id, email, source, created_at, ip_country, stripe_first_charge_at')
      .in('email', chunk)
    for (const r of data || []) {
      const e = String(r.email || '').toLowerCase()
      if (e && !known.has(e)) {
        known.set(e, { id: r.id, source: r.source, created_at: r.created_at, ip_country: r.ip_country, charge_at: r.stripe_first_charge_at })
      }
    }
  }

  const matched: Sale[] = []
  const unmatched: Sale[] = []
  const matchedButUncredited: (Sale & { submissionId: string })[] = []
  for (const s of sales) {
    const hit = s.email ? known.get(s.email) : undefined
    if (s.metaSubmissionId || hit) {
      matched.push(s)
      // Matched by email, but the row never got its charge stamped — the sale
      // exists in both systems and still does not appear in any funnel number.
      if (hit && !hit.charge_at) matchedButUncredited.push({ ...s, submissionId: hit.id })
    } else {
      unmatched.push(s)
    }
  }

  const byCountry: Record<string, { sales: number; matched: number }> = {}
  for (const s of sales) {
    const c = s.country || '??'
    const b = (byCountry[c] ||= { sales: 0, matched: 0 })
    b.sales++
    if (s.metaSubmissionId || (s.email && known.has(s.email))) b.matched++
  }

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)

  return NextResponse.json({
    windowDays: days,
    checkedAt: new Date().toISOString(),
    stripeSales: sales.length,
    visibleToFunnel: matched.length,
    invisibleToFunnel: unmatched.length,
    visiblePct: pct(matched.length, sales.length),
    matchedButNeverCredited: matchedButUncredited.length,
    byCountry: Object.entries(byCountry)
      .map(([country, b]) => ({ country, ...b, matchedPct: pct(b.matched, b.sales) }))
      .sort((a, b) => b.sales - a.sales),
    // Enough to act on, not a data dump. Emails are the owner's own customers.
    sampleInvisible: unmatched.slice(0, 25),
    sampleUncredited: matchedButUncredited.slice(0, 25),
    note:
      'invisibleToFunnel = real money Stripe took that no quiz row can be joined to. ' +
      'matchedButNeverCredited = the person IS in submissions and the sale still never reached any funnel number, ' +
      'which is a repairable bug rather than a lost customer. If invisible sales skew non-US, the "US converts 3.2x better" ' +
      'finding is an attribution artifact and the cohort plan needs rewriting.',
  })
}
