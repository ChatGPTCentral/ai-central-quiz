// Once a day: the trials trend, the funnel steps, the traffic-source
// breakdown, and a written synthesis — the routine the owner asked for,
// 2026-08-24: "ci dobbiamo ossessionare con il fare 10+ trial al giorno ...
// ogni volta che una routine ritorna sotto le 10 trial, noi esploriamo".
// See lib/daily-digest.ts for what it actually computes and why.

import { NextRequest, NextResponse } from 'next/server'
import { db, runDailyDigest } from '@/lib/daily-digest'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // SAME CONTRACT AS EVERY OTHER CRON IN THIS REPO: Bearer CRON_SECRET, or a
  // signed-in admin so a person can ask for today's digest right now instead
  // of waiting for the schedule.
  const secret = process.env.CRON_SECRET
  const fromCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  const fromAdmin = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!fromCron && !fromAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const c = db()
  const result = await runDailyDigest(c)

  const { error } = await c.from('daily_digests').upsert({
    day: result.day,
    ran_at: new Date().toISOString(),
    is_monday: result.isMonday,
    trials_yesterday: result.trialsYesterday,
    bar: 10,
    bar_hit: result.barHit,
    trend: result.trend,
    daily_funnel: result.dailyFunnel,
    weekly_funnel: result.weeklyFunnel,
    sources: result.sources,
    cohort: result.cohort,
    cohort_yesterday: result.cohortYesterday,
    headline: result.headline,
    synthesis: result.synthesis,
  }, { onConflict: 'day' })

  if (error) {
    console.error('[daily-digest] could not store:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...result })
}
