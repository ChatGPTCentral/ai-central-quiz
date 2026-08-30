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
// Was 60 — raised for the 2026-08-29 additions (a PostHog HogQL query plus
// one experiment_results() RPC per running experiment, sequential).
export const maxDuration = 120

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
    trial_sums: result.trialSums,
    week_to_date: result.weekToDate,
    cohort_learnings_snapshot: result.cohortLearnings,
    experiments_snapshot: result.runningExperiments,
    ux_signals: result.uxSignals,
    proposed_hypothesis: result.proposedHypothesis,
    headline: result.headline,
    synthesis: result.synthesis,
  }, { onConflict: 'day' })

  if (error) {
    console.error('[daily-digest] could not store:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Feed the theory of conversions. Owner, 2026-08-30: "non mi stai
  // spiegando comunque come unire e unificare 'coorti' + 'esperimenti' +
  // 'x-ray' + 'digest giornaliero' in un unico 'diario scientifico'". Before
  // this, proposedHypothesis lived only in today's daily_digests row —
  // real on the day it was written, invisible a week later, and never
  // tracked to a verdict. Every OTHER instrument already writes here
  // (experiments via their cohort evidence, analyses by hand); the digest
  // was the one gap. One row per day, guarded on the day-tagged note so
  // a manual "rifai il digest" re-run does not duplicate it.
  if (result.proposedHypothesis) {
    const dayTag = `digest-day:${result.day}`
    const { data: already } = await c.from('cohort_learnings').select('id').ilike('notes', `%${dayTag}%`).limit(1)
    if (!already?.length) {
      const { error: learnErr } = await c.from('cohort_learnings').insert({
        title: result.headline || `Digest hypothesis, ${result.day}`,
        hypothesis: result.proposedHypothesis,
        kind: 'analysis',
        status: 'open',
        notes: `Auto-proposed by the daily digest (${dayTag}). Trials yesterday: ${result.trialsYesterday}, bar ${result.barHit ? 'hit' : 'missed'}. Written by the same synthesis step that produces the digest's synthesis text — read /admin/digest for the day's full context.`,
      })
      if (learnErr) console.error('[daily-digest] could not log proposedHypothesis to cohort_learnings:', learnErr)
    }
  }

  return NextResponse.json({ ok: true, ...result })
}
