// The shared brief: what the OTHER codebase needs to know about this one.
//
// The quiz and the linkedin-ads-agent are separate repos, worked on in separate
// Claude sessions, but they are one funnel. Decisions on either side constrain
// the other: change the result page and the ads are optimising for a page that
// no longer exists; change targeting and a different population lands on it.
// Two sessions each reasoning from their own half will drift, confidently.
//
// They already share this Postgres, so rather than invent a channel this route
// publishes the quiz side's live state in one payload the ads session can read.
// It is deliberately DERIVED, not written by hand: a hand-maintained brief goes
// stale silently and then actively misleads, which is worse than having none.
//
// Auth: the ads app has no admin cookie for this domain, so a bearer token is
// accepted as well. Nothing here is PII - counts, rates and decisions only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const TRIAL_USD = 4.99
const ANNUAL_USD = 59.75

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function authorized(req: NextRequest): Promise<boolean> {
  if (await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)) return true
  const token = process.env.SHARED_CONTEXT_TOKEN
  return !!token && req.headers.get('authorization') === `Bearer ${token}`
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json(
      { error: 'unauthorized', hint: 'admin cookie, or Authorization: Bearer $SHARED_CONTEXT_TOKEN' },
      { status: 401 },
    )
  }

  const c = sb()
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 365)

  const [{ data: funnel }, { data: rate }, { data: cards }, { data: exps }] = await Promise.all([
    c.rpc('paid_source_funnel', { p_days: days }),
    c.rpc('trial_to_annual_rate'),
    c.from('roadmap_tasks')
      .select('title, status, phase, project, notes, shipped_at')
      .in('project', ['ads', 'both'])
      .in('status', ['in_progress', 'next', 'waiting_owner'])
      .order('sort'),
    c.from('experiments').select('key, name, status, primary_metric').eq('status', 'running'),
  ])

  const renewalRate = rate?.[0]?.rate != null ? Number(rate[0].rate) : null
  const ltv = TRIAL_USD + (renewalRate ?? 0) * ANNUAL_USD

  interface Src { source: string; takers: number; buyers: number; buyRate: number; worthPerTakerUsd: number }
  const bySource: Src[] = (funnel || []).map((r: Record<string, unknown>): Src => {
    const takers = Number(r.takers)
    const buyers = Number(r.buyers)
    const buyRate = takers > 0 ? buyers / takers : 0
    return {
      source: String(r.src),
      takers,
      buyers,
      buyRate: Number(buyRate.toFixed(4)),
      // The most you could pay for one visitor from this source and break even.
      // This is the number an ads session should be bidding against.
      worthPerTakerUsd: Number((ltv * buyRate).toFixed(2)),
    }
  }).sort((a: Src, b: Src) => b.takers - a.takers)

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    windowDays: days,
    economics: {
      trialUsd: TRIAL_USD,
      annualUsd: ANNUAL_USD,
      observedTrialToAnnualRate: renewalRate,
      ltvUsd: Number(ltv.toFixed(2)),
      note: renewalRate === null
        ? 'No renewals due yet, LTV is the trial alone and is a floor'
        : 'LTV uses the OBSERVED renewal rate, not an assumption that every trial renews',
    },
    bySource,
    runningExperiments: exps || [],
    sharedRoadmap: cards || [],
    contract: {
      whatThisIs: 'The quiz side of the funnel, published for the ads codebase.',
      bidAgainst: 'worthPerTakerUsd is the ceiling for cost-per-quiz-taker by source. Paying above it loses money.',
      writeBack: "Put ads decisions on the shared board: insert into roadmap_tasks with project='ads', or 'both' when it constrains the quiz too.",
    },
  })
}
