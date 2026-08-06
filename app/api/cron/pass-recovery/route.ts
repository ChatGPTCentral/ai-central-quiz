// Pass Recovery enrolment — Vercel Cron every 15 minutes, same Bearer
// CRON_SECRET contract as the other crons.
//
// WHY T+60 MINUTES, and not an hour picked because it sounded reasonable.
// Measured over 43 net-new payers, timing anchored on the result_view event:
// median time from seeing the result page to paying is 4.6 minutes, 88% pay
// inside 15 minutes, 97.7% inside 30. After 30 minutes exactly one person has
// ever bought, at 14 days. So people buy in minutes or they do not buy, and
// waiting an hour means we email essentially nobody who was still deciding
// while they can still remember taking the quiz.
//
// WHAT IT IS. Not a cart nag. The sequence hands over the member pass, invites
// a share, points out that week 1 of the study plan is already unlocked, and
// says the next stage is one rung away and $4.99 opens it. Someone who reached
// the result page already has the trial in their cart, in the only sense that
// matters, so the recovery is about the thing they earned rather than the thing
// they abandoned.
//
// SAFETY. Three separate gates, because the cost of emailing a paying customer
// a discount pitch is much higher than the cost of missing one abandoner:
//   1. only rows with an actual result_view event
//   2. never anyone whose Stripe charge lands after they saw the result
//   3. pass_recovery_enrolled_at is stamped only AFTER beehiiv confirms, so a
//      failure retries next pass instead of being lost, and a success can never
//      double-enrol
// The window is also bounded at both ends: nothing younger than 60 minutes,
// nothing older than 24 hours, so switching this on cannot backfill weeks of
// old quiz takers with a surprise blast.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enrollInAutomation } from '@/lib/beehiiv'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Draft in beehiiv until the owner publishes it; enrolling into a draft is a no-op. */
const AUTOMATION_ID = process.env.BEEHIIV_PASS_RECOVERY_AUTOMATION_ID
  || 'aut_1e8b3a84-70a4-4778-9df1-46fb87749fbc'

const MIN_AGE_MIN = 60
const MAX_AGE_H = 24
const BATCH = 50

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Inert until the owner explicitly switches it on. The automation is a draft
  // in beehiiv, so enrolling would fail anyway, but failing 50 times every 15
  // minutes is noise rather than safety. This way the cron still runs and still
  // reports what it WOULD send, which is the useful part while it is off.
  const armed = process.env.BEEHIIV_PASS_RECOVERY_ENABLED === 'true'
  const dry = !armed || req.nextUrl.searchParams.get('dry') === '1'
  const c = sb()

  // Candidates: saw their result between 60 minutes and 24 hours ago, gave us an
  // email, have not paid since seeing it, and have not been enrolled already.
  const { data, error } = await c.rpc('pass_recovery_candidates', {
    p_min_age_minutes: MIN_AGE_MIN,
    p_max_age_hours: MAX_AGE_H,
    p_limit: BATCH,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []) as { id: string; email: string; saw_result: string }[]
  if (dry) {
    return NextResponse.json({
      mode: armed ? 'dry-run' : 'DISABLED (set BEEHIIV_PASS_RECOVERY_ENABLED=true to arm)',
      automationId: AUTOMATION_ID,
      windowMinutes: [MIN_AGE_MIN, MAX_AGE_H * 60],
      candidates: rows.length,
      sample: rows.slice(0, 10).map(r => ({ email: r.email.replace(/(.{2}).*(@.*)/, '$1***$2'), sawResult: r.saw_result })),
    })
  }

  let enrolled = 0
  const failures: { email: string; error: string }[] = []
  for (const r of rows) {
    const res = await enrollInAutomation({ email: r.email, automationId: AUTOMATION_ID })
    if (!res.success) {
      failures.push({ email: r.email, error: res.error || 'unknown' })
      continue // no stamp: it retries next pass
    }
    const { error: uerr } = await c
      .from('submissions')
      .update({ pass_recovery_enrolled_at: new Date().toISOString() })
      .eq('id', r.id)
    if (uerr) {
      // Enrolled but not stamped. Log loudly: beehiiv's `limited` enrolment
      // stops the duplicate, but we want to see this if it ever happens.
      console.error('[pass-recovery] enrolled but failed to stamp', r.id, uerr.message)
    }
    enrolled++
  }

  return NextResponse.json({
    automationId: AUTOMATION_ID,
    candidates: rows.length,
    enrolled,
    failed: failures.length,
    failures: failures.slice(0, 5),
  })
}
