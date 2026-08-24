// Checkout Recovery enrolment — Vercel Cron every 15 minutes, offset from
// Pass Recovery's slots so the two jobs never examine the same rows in the
// same minute. Same Bearer CRON_SECRET contract as the other crons.
//
// WHO THIS IS FOR. People who clicked the buy button, watched the payment
// form open, and left without paying. ~120 a week with a known email. They
// were meant to be the hottest segment the funnel produces, and until
// 2026-08-10 they either got the generic Pass Recovery sequence or nothing.
// This sequence talks to the moment they actually stopped at: the payment
// form.
//
// MEASURED, 2026-08-24: two weeks live, 280 enrolled, 1 became a trial,
// 0.4%. Of the 100 checkout clicks that led to a trial in the trailing 90
// days, 70% paid inside 5 minutes of that click, 87% inside 15, 94% inside
// 45 — and the 45min-2h band the old T+45 floor opened into produced not
// one trial in the whole 90 days. The email was arriving almost entirely
// after the window in which this audience has ever paid.
//
// WHY T+20 MINUTES NOW. Comfortably past the 15-minute mark (87% of the
// clickers who ever pay have already paid by then), while more than halving
// the old miss. The real guard against emailing an active buyer is not this
// delay, it is the re-verification below against stripe_first_charge_at
// right before sending — moving the floor earlier cannot reach someone who
// already paid, it only reaches the rest sooner, closer to the moment they
// were still deciding. Still starts well before Pass Recovery's
// (result_view + 60), same race won as before.
//
// MUTUAL EXCLUSION, both directions. 51 of last week's 120 unpaid clickers
// were already inside Pass Recovery when this was built; without exclusion
// they would get two sequences an hour apart. The candidate RPCs exclude each
// other's enrolled_at stamp, and the re-verification below repeats the check
// against the table. First stamp wins, the other job never sees the row again.
//
// SAFETY. Inherits every guard Pass Recovery earned the hard way (see that
// route for the incident reports): no-store fetch, wide fetch + client-side
// window re-derivation, re-verification of every candidate against the table
// before mailing, stamp only after beehiiv confirms. One rule here is STRICTER:
// any prior Stripe charge disqualifies, full stop — "you were one field away
// from the $4.99 trial" must never reach an existing customer.
//
// ARMED since 2026-08-10: the "Checkout Recovery" automation is published
// live in beehiiv and BEEHIIV_CHECKOUT_RECOVERY_ENABLED=true in Production.
// Nothing left to switch on. If it is ever paused, re-arming needs both:
// publish the automation in beehiiv (a draft makes enrolment a no-op) AND
// set the env var true in Vercel, Production scope, AND REDEPLOY — Vercel
// bakes env vars at build time, so saving the variable without redeploying
// changes nothing and looks broken.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enrollInAutomation, setPassRecoveryFields } from '@/lib/beehiiv'
import { personResultPath, CHECKOUT_RECOVERY_UTM } from '@/lib/result-url'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Live in beehiiv since 2026-08-10. */
const AUTOMATION_ID = process.env.BEEHIIV_CHECKOUT_RECOVERY_AUTOMATION_ID
  || 'aut_02e82e63-8053-446d-a5cb-14266bd17fcb'

const MIN_AGE_MIN = 20
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
    // A cron that reads current state must never be cached. See pass-recovery
    // for the frozen-snapshot incident this line prevents.
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

  // Inert until the owner explicitly switches it on. While off it still runs
  // and reports what it WOULD send, which is the useful part while it is off.
  const armed = process.env.BEEHIIV_CHECKOUT_RECOVERY_ENABLED === 'true'
  const dry = !armed || req.nextUrl.searchParams.get('dry') === '1'
  const c = sb()

  // Candidates: last checkout click between MIN_AGE_MIN and 24 hours ago,
  // email known, no Stripe charge EVER, not enrolled in either recovery
  // sequence.
  // Fetch WIDE and re-check everything here — the RPC result is a list of
  // suggestions, not facts (see pass-recovery for the three incidents behind
  // that rule).
  const FETCH_LIMIT = 1000
  const { data, error } = await c.rpc('checkout_recovery_candidates', {
    p_min_age_minutes: MIN_AGE_MIN,
    p_max_age_hours: MAX_AGE_H,
    p_limit: FETCH_LIMIT,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []) as {
    id: string; email: string; clicked_at: string
    name: string | null; score: number | null; persona: string | null; stage: string | null
  }[]
  if (dry) {
    return NextResponse.json({
      mode: armed ? 'dry-run' : 'DISABLED (set BEEHIIV_CHECKOUT_RECOVERY_ENABLED=true to arm)',
      automationId: AUTOMATION_ID,
      windowMinutes: [MIN_AGE_MIN, MAX_AGE_H * 60],
      candidates: rows.length,
      sample: rows.slice(0, 10).map(r => ({ email: r.email.replace(/(.{2}).*(@.*)/, '$1***$2'), clickedAt: r.clicked_at })),
    })
  }

  let enrolled = 0
  const failures: { email: string; error: string }[] = []
  const skipped: { id: string; ageHours: number }[] = []
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai').replace(/\/$/, '')

  // Independent window check, ages re-derived from clicked_at against the real
  // clock. A wrong result set becomes a logged no-op, not an apology.
  const inWindow = (clickedAt: string | null | undefined): { ok: boolean; ageHours: number } => {
    if (!clickedAt) return { ok: false, ageHours: -1 }
    const ms = Date.now() - Date.parse(clickedAt)
    if (!Number.isFinite(ms)) return { ok: false, ageHours: -1 }
    const ageHours = ms / 3_600_000
    return { ok: ageHours >= MIN_AGE_MIN / 60 && ageHours <= MAX_AGE_H, ageHours }
  }

  const eligible = rows.filter(r => {
    const w = inWindow(r.clicked_at)
    if (w.ok) return true
    skipped.push({ id: r.id, ageHours: Math.round(w.ageHours * 10) / 10 })
    return false
  })
  if (skipped.length > 0) {
    console.error(
      `[checkout-recovery] query returned ${rows.length} rows, ${skipped.length} outside the ` +
      `${MIN_AGE_MIN}min-${MAX_AGE_H}h window and refused. The client-side window check is load-bearing, do not remove it.`,
    )
  }

  // Re-verify every candidate against the table before mailing anybody:
  // still un-enrolled in BOTH sequences, still never charged.
  let verified = eligible
  if (eligible.length > 0) {
    const { data: fresh, error: vErr } = await c
      .from('submissions')
      .select('id')
      .in('id', eligible.map(r => r.id))
      .is('checkout_recovery_enrolled_at', null)
      .is('checkout_recovery_misfire_at', null)
      .is('pass_recovery_enrolled_at', null)
      .is('stripe_first_charge_at', null)
    if (vErr) {
      return NextResponse.json({ error: `verification failed, enrolled nobody: ${vErr.message}` }, { status: 500 })
    }
    const okIds = new Set((fresh ?? []).map(r => (r as { id: string }).id))
    const before = verified.length
    verified = eligible.filter(r => okIds.has(r.id))
    if (verified.length !== before) {
      console.error(
        `[checkout-recovery] verification dropped ${before - verified.length} of ${before} candidates the ` +
        `query claimed were eligible.`,
      )
    }
  }

  for (const r of verified.slice(0, BATCH)) {
    // Merge fields BEFORE enrolment: both emails read {{result_url}} and
    // {{first_name}}. The URL carries utm_source=checkrec so a return visit is
    // attributable to THIS sequence, distinct from Pass Recovery's passrec.
    const fieldRes = await setPassRecoveryFields({
      email: r.email,
      resultUrl: site + personResultPath({
        id: r.id, name: r.name, score: r.score, persona: r.persona, stage: r.stage,
      }, CHECKOUT_RECOVERY_UTM),
      firstName: r.name?.trim().split(/\s+/)[0] ?? null,
    })
    if (!fieldRes.success) {
      console.warn('[checkout-recovery] merge fields not set for', r.id, fieldRes.error)
    }

    const res = await enrollInAutomation({ email: r.email, automationId: AUTOMATION_ID })
    if (!res.success) {
      failures.push({ email: r.email, error: res.error || 'unknown' })
      continue // no stamp: it retries next pass
    }
    const { error: uerr } = await c
      .from('submissions')
      .update({ checkout_recovery_enrolled_at: new Date().toISOString() })
      .eq('id', r.id)
    if (uerr) {
      console.error('[checkout-recovery] enrolled but failed to stamp', r.id, uerr.message)
    }
    enrolled++
  }

  return NextResponse.json({
    automationId: AUTOMATION_ID,
    candidates: rows.length,
    enrolled,
    refusedOutOfWindow: skipped.length,
    refusedSample: skipped.slice(0, 5),
    verifiedAgainstTable: true,
    failed: failures.length,
    failures: failures.slice(0, 5),
  })
}
