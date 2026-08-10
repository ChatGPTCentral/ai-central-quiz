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
//
// TO ARM IT, both steps, in this order:
//   1. publish the automation in beehiiv (enrolling into a draft is a no-op)
//   2. set BEEHIIV_PASS_RECOVERY_ENABLED=true in Vercel, Production scope,
//      AND REDEPLOY
// Step 2's second half is the one that catches people. Vercel bakes env vars
// into a deployment when it builds, so saving the variable changes the project
// config and does nothing at all to the deployment already serving traffic.
// The cron keeps running, keeps finding candidates, keeps enrolling nobody,
// and looks identical to being broken. Confirmed the hard way on 2026-08-07.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enrollInAutomation, setPassRecoveryFields } from '@/lib/beehiiv'
import { personResultPath, PASS_RECOVERY_UTM } from '@/lib/result-url'
import { STAGES } from '@/lib/segmentation-v2'

/**
 * The rung above theirs, as a human label. Null at the top of the ladder or for
 * an unrecognised stage — we do not invent a rung above Builder.
 */
function nextStageLabel(stage: string): string | null {
  const ordered = STAGES.filter(s => s.key.startsWith('S'))
  const i = ordered.findIndex(s => s.key === stage)
  if (i < 0 || i >= ordered.length - 1) return null
  return ordered[i + 1].label
}

/**
 * The whole headline sentence, not just the noun, because "one stage off" is
 * false for the 13% of takers who come out at S5_builder. Merging a bare label
 * into a fixed sentence would tell a Builder they are one stage off "the next
 * stage", which is nonsense and exactly the kind of thing that makes a
 * personalised email read as automated. One field, always a true sentence.
 */
function rungLine(stage: string | null): string {
  const next = stage ? nextStageLabel(stage) : null
  if (next) return `You are one stage off ${next}`
  return 'You are at the top of the ladder, the risk now is staying there'
}

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
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // ROOT CAUSE of the 2026-08-07/08 misfires. supabase-js talks over fetch,
    // and inside Next this route's fetches were being served from cache, so the
    // candidate list was a FROZEN SNAPSHOT rather than a query.
    //
    // The proof is in the logs of four consecutive runs: identical 69 rows at
    // 13:31, 13:45, 14:00 and 14:15, containing people already enrolled and
    // missing the 24 who had genuinely become eligible since. The only thing
    // that moved was the refused count, 20 -> 21, because THIS code ages each
    // row against the real clock while the rows themselves stood still.
    //
    // It explains all three failures from one cause. The first armed run mailed
    // people from 10 July because it was handed a response cached during the
    // dry-run period. Later runs enrolled nobody because the snapshot no longer
    // contained anyone enrollable. And it looked healthy throughout, because a
    // cached answer is a fast, well-formed, confident answer.
    //
    // A cron that reads current state must never be cached. no-store, always.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })
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
  // Fetch WIDE, filter here, then cap. Not the same as asking for BATCH rows.
  //
  // Confirmed 2026-08-08 00:15: through supabase-js the candidate query returns
  // rows outside the window it was asked for (that run: 50 people between 42
  // and 62 hours old, when the window is 1 to 24). Called directly in SQL with
  // identical arguments it returns only in-window rows. So the fault is in the
  // client -> PostgREST path, not the function.
  //
  // Asking for exactly BATCH rows was therefore fatal in a quieter way than the
  // original misfire: the query hands back BATCH out-of-window people, the
  // check below refuses all of them, and the genuinely waiting people are never
  // reached. Every run enrols nobody and reports success. That is a worse
  // failure than sending the wrong email, because nothing looks broken.
  //
  // The query sorts oldest-first and the people we want are the newest, so a
  // wide fetch is what guarantees they are in the page at all.
  const FETCH_LIMIT = 1000
  const { data, error } = await c.rpc('pass_recovery_candidates', {
    p_min_age_minutes: MIN_AGE_MIN,
    p_max_age_hours: MAX_AGE_H,
    p_limit: FETCH_LIMIT,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []) as {
    id: string; email: string; saw_result: string
    name: string | null; score: number | null; persona: string | null; stage: string | null
  }[]
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
  const skipped: { id: string; ageHours: number }[] = []
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai').replace(/\/$/, '')

  // INDEPENDENT WINDOW CHECK. 2026-08-07: the first armed run enrolled 50
  // people, 49 of whom had no result_view anywhere inside the 60min-24h window
  // - - their result views went back to 10 July. They got an email whose first
  // line is "You took the AI quiz about an hour ago". The candidate RPC, called
  // directly with the same arguments, does not return those rows, and no
  // migration touched it that day, so the cause is still open.
  //
  // The lesson does not depend on the cause. A job that sends mail must not
  // delegate its safety to a query it cannot see the execution of. It now
  // re-derives every candidate's age from saw_result and refuses anything
  // outside the window, so a wrong result set becomes a logged no-op instead of
  // an apology to 50 people. Belt and braces, and the braces are the ones here.
  const inWindow = (sawResult: string | null | undefined): { ok: boolean; ageHours: number } => {
    if (!sawResult) return { ok: false, ageHours: -1 }
    const ms = Date.now() - Date.parse(sawResult)
    if (!Number.isFinite(ms)) return { ok: false, ageHours: -1 }
    const ageHours = ms / 3_600_000
    return { ok: ageHours >= MIN_AGE_MIN / 60 && ageHours <= MAX_AGE_H, ageHours }
  }

  // Filter first, cap second, so refusals cannot eat the batch.
  const eligible = rows.filter(r => {
    const w = inWindow(r.saw_result)
    if (w.ok) return true
    skipped.push({ id: r.id, ageHours: Math.round(w.ageHours * 10) / 10 })
    return false
  })
  if (skipped.length > 0) {
    console.error(
      `[pass-recovery] query returned ${rows.length} rows, ${skipped.length} outside the ` +
      `${MIN_AGE_MIN / 60}-${MAX_AGE_H}h window and refused. Oldest refused ` +
      `${Math.max(...skipped.map(s => s.ageHours)).toFixed(1)}h. Enrolling ${Math.min(eligible.length, BATCH)} of ` +
      `${eligible.length} genuine candidates. The client-side window check is load-bearing, do not remove it.`,
    )
  }

  // RE-VERIFY AGAINST THE TABLE. 2026-08-08 14:00: the fault is wider than the
  // window. The candidate query's `pass_recovery_enrolled_at is null` clause is
  // not surviving the client path either - - direct SQL said 23 eligible while
  // the cron was handed 48, the extra ones being people already enrolled. It
  // tried them every 15 minutes, beehiiv rejected each as a duplicate, nothing
  // was ever stamped, and the retries crowded genuine candidates out of the
  // batch. A stuck loop that reports success, which is the third shape this
  // same bug has taken.
  //
  // So nothing from that query is trusted as a fact any more. It is a list of
  // SUGGESTIONS, and every one is checked against the table before we mail
  // anybody. One extra round trip per run, and it makes the whole job
  // independent of whatever the RPC path is doing.
  let verified = eligible
  if (eligible.length > 0) {
    const { data: fresh, error: vErr } = await c
      .from('submissions')
      .select('id')
      .in('id', eligible.map(r => r.id))
      .is('pass_recovery_enrolled_at', null)
      .is('pass_recovery_misfire_at', null)
      // Checkout Recovery got them first — the specific sequence outranks this
      // generic one, and nobody ever receives both. Same clause lives in the
      // RPC; repeated here because the RPC path has lied three times.
      .is('checkout_recovery_enrolled_at', null)
    if (vErr) {
      return NextResponse.json({ error: `verification failed, enrolled nobody: ${vErr.message}` }, { status: 500 })
    }
    const okIds = new Set((fresh ?? []).map(r => (r as { id: string }).id))
    const before = verified.length
    verified = eligible.filter(r => okIds.has(r.id))
    if (verified.length !== before) {
      console.error(
        `[pass-recovery] verification dropped ${before - verified.length} of ${before} candidates that the ` +
        `query claimed were un-enrolled. The RPC's WHERE clause is not reaching this code path.`,
      )
    }
  }

  for (const r of verified.slice(0, BATCH)) {
    // Fields BEFORE enrolment. The emails merge {{result_url}}, {{next_stage}}
    // and {{first_name}}; a missing field silently falls back and the sequence
    // quietly stops being personal, which is the only reason it is worth
    // sending. Non-fatal on failure: a generic send still beats no send.
    const fieldRes = await setPassRecoveryFields({
      email: r.email,
      resultUrl: site + personResultPath({
        id: r.id, name: r.name, score: r.score, persona: r.persona, stage: r.stage,
      }, PASS_RECOVERY_UTM),
      nextStage: r.stage ? nextStageLabel(r.stage) : null,
      rungLine: rungLine(r.stage),
      firstName: r.name?.trim().split(/\s+/)[0] ?? null,
    })
    if (!fieldRes.success) {
      console.warn('[pass-recovery] merge fields not set for', r.id, fieldRes.error)
    }

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
    // Non-zero means the candidate query is still handing back people it should
    // not. Enrolment is safe either way, but it wants investigating, not muting.
    refusedOutOfWindow: skipped.length,
    refusedSample: skipped.slice(0, 5),
    // Both of these being non-zero means the candidate query is unreliable in
    // two separate ways. Enrolment is safe regardless: nothing is mailed that
    // has not been re-checked against the table first.
    verifiedAgainstTable: true,
    failed: failures.length,
    failures: failures.slice(0, 5),
  })
}
