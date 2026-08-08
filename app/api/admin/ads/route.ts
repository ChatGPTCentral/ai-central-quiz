// Paid-acquisition economics, computed from OUR data.
//
// What this is and is not. Ad SPEND lives in LinkedIn, not here, and the token
// that could read it is a per-browser cookie in the ads-agent app, so this route
// deliberately does not pretend to know it. What it does own is the half
// LinkedIn cannot see: how many of those clicks became quiz takers, how many
// reached the result page, how many clicked buy, and how many actually paid.
// Spend is entered in the UI and the CAC maths is done against these counts.
//
// The number that matters is BREAK-EVEN CONVERSION: at a given cost per quiz
// taker, what share of takers must buy for the channel to wash its face. Every
// paid source can then be read against one honest bar instead of against a
// vibe. Getting this wrong in the optimistic direction is how ad accounts quietly
// lose money for months, so LTV here is computed from the OBSERVED trial→annual
// rate rather than assuming every trial renews.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const TRIAL_USD = 4.99
const ANNUAL_USD = 59.75

/** utm_source values that cost money. 'linkedin' is organic posts and must not count.
 *  Not exported: a Next route file may only export route handlers and config. */
const PAID_SOURCES = ['li_ads', 'google_ads', 'meta_ads']

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

interface SourceRow {
  source: string
  paid: boolean
  takers: number
  sawResult: number
  clicked: number
  buyers: number
  clickRate: number
  buyRate: number
}

export async function GET(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 365)
  const c = sb()

  const { data, error } = await c.rpc('paid_source_funnel', { p_days: days })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: SourceRow[] = (data || []).map((r: Record<string, unknown>) => {
    const takers = Number(r.takers)
    const sawResult = Number(r.saw_result)
    const clicked = Number(r.clicked)
    const buyers = Number(r.buyers)
    return {
      source: String(r.src),
      paid: PAID_SOURCES.includes(String(r.src)),
      takers, sawResult, clicked, buyers,
      clickRate: sawResult > 0 ? clicked / sawResult : 0,
      buyRate: takers > 0 ? buyers / takers : 0,
    }
  })

  // Recent ad-driven quiz activity, mirroring the cockpit's own feed
  // (/api/quiz/recent over there). Same idea, one difference: that route gates
  // identity behind the LinkedIn operator cookie because it can be hit by an
  // unauthenticated public alias. This route is already behind the admin
  // session, so names and CRM links are always present.
  const { data: recentRows } = await c
    .from('submissions')
    .select('id, name, email, score, stage, utm_ref, created_at, stripe_first_charge_at')
    .in('utm_source', PAID_SOURCES)
    .order('created_at', { ascending: false })
    .limit(15)

  const recent = (recentRows || []).map(r => ({
    id: r.id,
    name: r.name,
    score: r.score,
    stage: r.stage,
    campaign: r.utm_ref || '(none)',
    at: r.created_at,
    buyer: !!(r.stripe_first_charge_at && r.stripe_first_charge_at > r.created_at),
  }))

  // LTV from the OBSERVED trial→annual rate, not from hope. If nobody has
  // renewed yet the rate is null and the UI must say so rather than default to
  // 100% and flatter every channel.
  const { data: rr } = await c.rpc('trial_to_annual_rate')
  const renewalRate: number | null =
    rr && rr.length && rr[0].rate != null ? Number(rr[0].rate) : null
  const ltv = TRIAL_USD + (renewalRate ?? 0) * ANNUAL_USD

  return NextResponse.json({
    days,
    rows: rows.sort((a, b) => b.takers - a.takers),
    recent,
    economics: {
      trialUsd: TRIAL_USD,
      annualUsd: ANNUAL_USD,
      renewalRate,
      ltv,
      ltvIsFloor: renewalRate === null,
      note: renewalRate === null
        ? 'No renewals observed yet, so LTV is the trial alone. Treat it as a floor.'
        : `LTV = $${TRIAL_USD} trial + ${(renewalRate * 100).toFixed(0)}% renewing at $${ANNUAL_USD}`,
    },
    adsAppUrl: process.env.NEXT_PUBLIC_ADS_APP_URL || null,
  })
}
