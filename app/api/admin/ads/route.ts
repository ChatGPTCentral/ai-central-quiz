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
import { readLtvModel } from '@/lib/ltv-settings'
import { ltvFrom } from '@/lib/ltv-model'

export const dynamic = 'force-dynamic'

// Prices live in the owner's LTV model (app_settings, set on /admin/simulator),
// not as constants here. A constant is how the same business fact ends up
// written down in two places with two values.

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
  /** Landing views from this source: our proxy for the click we paid for. */
  landing: number
  sawResult: number
  clicked: number
  buyers: number
  clickRate: number
  buyRate: number
}

export async function GET(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Cap raised so the UI can ask for all time. This screen answers "does paid
  // pay for itself", which is a standing question, not a weekly trend.
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 3650, 1), 3650)
  const c = sb()

  const { data, error } = await c.rpc('paid_source_funnel', { p_days: days })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Landing views per source. The RPC starts at "completed the quiz", so the
  // click we actually paid for is missing from it entirely, and cost-per-click
  // could not be computed at all. quiz_view fires on the landing page, which is
  // the closest thing we own to a click.
  const sinceIso = new Date(Date.now() - days * 864e5).toISOString()
  const landingBySource = new Map<string, Set<string>>()
  for (let offset = 0; offset < 200_000; offset += 1000) {
    const { data: ev } = await c
      .from('funnel_events')
      .select('anon_id, session_id, utm_source')
      .eq('event', 'quiz_view')
      .gte('ts', sinceIso)
      .range(offset, offset + 999)
    if (!ev || ev.length === 0) break
    for (const e of ev as { anon_id: string | null; session_id: string | null; utm_source: string | null }[]) {
      const who = e.anon_id || e.session_id
      const src = (e.utm_source || '').trim()
      if (!who || !src) continue
      const set = landingBySource.get(src) || new Set<string>()
      set.add(who)
      landingBySource.set(src, set)
    }
    if (ev.length < 1000) break
  }

  const rows: SourceRow[] = (data || []).map((r: Record<string, unknown>) => {
    const takers = Number(r.takers)
    const sawResult = Number(r.saw_result)
    const clicked = Number(r.clicked)
    const buyers = Number(r.buyers)
    return {
      source: String(r.src),
      paid: PAID_SOURCES.includes(String(r.src)),
      takers, sawResult, clicked, buyers,
      landing: landingBySource.get(String(r.src))?.size ?? 0,
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

  // LTV comes from the OWNER'S saved model on /admin/simulator, so this page
  // and that one can never disagree about what a customer is worth. The model
  // is trial + year-1 renewal x annual + year-2 renewal x annual.
  //
  // The MEASURED trial→annual rate is still fetched, but only to show the
  // assumption next to the evidence. It is not silently substituted: this page
  // decides advertising spend, and quietly swapping the number under the owner
  // would be worse than showing both and letting them choose.
  const ltvModel = await readLtvModel()
  const ltv = ltvFrom(ltvModel)

  const { data: rr } = await c.rpc('trial_to_annual_rate')
  const renewalRate: number | null =
    rr && rr.length && rr[0].rate != null ? Number(rr[0].rate) : null
  const renewalDue: number = rr && rr.length ? Number(rr[0].due) || 0 : 0

  // The QUIZ-ERA rate, alongside the all-time one rather than instead of it.
  //
  // All-time rests on ~1,679 customers going back to 2023, across prices and
  // offers we no longer sell, so it is robust but not necessarily OUR number.
  // The quiz cohort is the right population and currently reads much higher,
  // but on a handful of mature trials. Showing both, each with its sample
  // size, is the only honest option: swapping to the small number would
  // flatter every channel on this page, and ignoring it would hide the fact
  // that our own cohort may be behaving differently.
  const { data: qz } = await c
    .from('submissions')
    .select('stripe_first_charge_at, stripe_last_charge_at')
    .gte('stripe_first_charge_at', '2026-07-05')
    .lt('stripe_first_charge_at', new Date(Date.now() - 32 * 864e5).toISOString())
    .is('archived_at', null)
    .or('is_test.is.null,is_test.eq.false')
  const qzRows = (qz || []) as { stripe_first_charge_at: string; stripe_last_charge_at: string | null }[]
  const qzRenewed = qzRows.filter(r =>
    r.stripe_last_charge_at &&
    new Date(r.stripe_last_charge_at).getTime() > new Date(r.stripe_first_charge_at).getTime() + 20 * 864e5).length
  const cohortRate: number | null = qzRows.length > 0 ? qzRenewed / qzRows.length : null

  return NextResponse.json({
    days,
    rows: rows.sort((a, b) => b.takers - a.takers),
    recent,
    economics: {
      trialUsd: ltvModel.trialUsd,
      annualUsd: ltvModel.annualUsd,
      year1Pct: ltvModel.year1Pct,
      year2Pct: ltvModel.year2Pct,
      renewalRate,
      renewalDue,
      cohortRate,
      cohortDue: qzRows.length,
      ltv,
      ltvIsFloor: false,
      note: renewalRate === null
        ? 'No renewals observed yet, so LTV is the trial alone. Treat it as a floor.'
        : `Your model: $${ltvModel.trialUsd} + ${(ltvModel.year1Pct * 100).toFixed(0)}% yr1 + ${(ltvModel.year2Pct * 100).toFixed(0)}% yr2 at $${ltvModel.annualUsd}`
          + ` · measured yr1 ${(renewalRate * 100).toFixed(0)}% on ${renewalDue} due`
          + (cohortRate !== null && qzRows.length > 0
              ? ` · quiz-era ${(cohortRate * 100).toFixed(0)}% on ${qzRows.length}`
              : ''),
    },
    adsAppUrl: process.env.NEXT_PUBLIC_ADS_APP_URL || null,
  })
}
