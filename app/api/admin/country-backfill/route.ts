// Backfill billing country from Stripe onto submissions.
//
// Why: 2,109 paying members have NO country at all, because ip_country was only
// added a few weeks ago. That makes every per-country claim unbuildable — the
// largest true number we can state today is "29 members in the US", and putting
// an invented figure like "1,247 in the US" on the result page would be a
// fabrication a buyer could check.
//
// Every one of those customers has a billing country sitting in Stripe. This
// reads it and writes it to a DEDICATED column, never over ip_country: one is
// where the browser was at quiz time (VPNs, work proxies, holidays), the other
// is where the card lives. Collapsing them would silently corrupt the geography
// numbers we have already computed.
//
// DRY RUN BY DEFAULT. It reports exactly what it would change and writes
// nothing until ?apply=1, because this touches 2,000+ customer rows.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

export async function GET(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 })
  const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 2 })

  const apply = req.nextUrl.searchParams.get('apply') === '1'
  const maxPages = Math.min(60, Math.max(1, parseInt(req.nextUrl.searchParams.get('pages') || '30', 10)))

  // 1. Walk Stripe customers and take the best country we can find. The address
  //    on the customer is the strongest signal; a card's country is the
  //    fallback, since a customer can exist with no address at all.
  const byEmail = new Map<string, string>()
  let scanned = 0
  let withCountry = 0
  try {
    let startingAfter: string | undefined
    for (let page = 0; page < maxPages; page++) {
      const list = await stripe.customers.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      })
      for (const cu of list.data) {
        scanned++
        const email = cu.email?.trim().toLowerCase()
        if (!email) continue
        const country =
          cu.address?.country ||
          (typeof cu.default_source === 'object' && cu.default_source && 'country' in cu.default_source
            ? (cu.default_source as { country?: string }).country
            : undefined)
        if (!country) continue
        withCountry++
        // First writer wins: customers are listed newest-first, so the most
        // recent record for an email is the one we trust.
        if (!byEmail.has(email)) byEmail.set(email, country.toUpperCase().slice(0, 2))
      }
      if (!list.has_more) break
      startingAfter = list.data[list.data.length - 1]?.id
      if (!startingAfter) break
    }
  } catch (e) {
    return NextResponse.json({ error: 'stripe_failed', detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }

  // 2. Match to submissions that do not already have a billing country.
  const c = db()
  const emails = Array.from(byEmail.keys())
  const updates: { id: string; email: string; country: string }[] = []
  const alreadySet: string[] = []

  for (let i = 0; i < emails.length; i += 200) {
    const chunk = emails.slice(i, i + 200)
    const { data, error } = await c
      .from('submissions')
      .select('id, email, billing_country, ip_country')
      .in('email', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const r of data || []) {
      const e = String(r.email || '').toLowerCase()
      const country = byEmail.get(e)
      if (!country) continue
      if (r.billing_country) { alreadySet.push(r.id); continue }
      updates.push({ id: r.id, email: e, country })
    }
  }

  // Where ip_country and the card disagree, the card wins for "where members
  // are" — but the disagreement itself is worth surfacing, because a big gap
  // means the geography conclusions drawn from IP need revisiting.
  let disagreements = 0
  {
    const ids = updates.map(u => u.id)
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await c
        .from('submissions')
        .select('id, ip_country')
        .in('id', ids.slice(i, i + 200))
      for (const r of data || []) {
        const u = updates.find(x => x.id === r.id)
        if (u && r.ip_country && r.ip_country !== u.country) disagreements++
      }
    }
  }

  const distribution: Record<string, number> = {}
  for (const u of updates) distribution[u.country] = (distribution[u.country] || 0) + 1

  let written = 0
  if (apply) {
    const now = new Date().toISOString()
    for (const u of updates) {
      const { error } = await c
        .from('submissions')
        .update({ billing_country: u.country, billing_country_at: now })
        .eq('id', u.id)
      if (!error) written++
    }
  }

  return NextResponse.json({
    mode: apply ? 'APPLIED' : 'dry-run (nothing written — add &apply=1 to commit)',
    stripe: { customersScanned: scanned, withACountry: withCountry, uniqueEmailsWithCountry: byEmail.size },
    submissions: {
      wouldUpdate: updates.length,
      alreadyHadBillingCountry: alreadySet.length,
      written,
    },
    ipVsBillingDisagreements: disagreements,
    distribution: Object.fromEntries(Object.entries(distribution).sort((a, b) => b[1] - a[1]).slice(0, 25)),
    note:
      'billing_country is written to its OWN column and never over ip_country: one is where the browser was at quiz time, ' +
      'the other is where the card lives. ipVsBillingDisagreements counts rows where the two differ — a large number means ' +
      'the geography conclusions drawn from IP need revisiting.',
  })
}
