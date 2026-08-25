// Revenue recovery follow-up queue — Vercel Cron, daily.
//
// WHO THIS IS FOR. People already IN a revenue-recovery cohort (right now:
// india_3ds_v1, billing blocked by 3D Secure on off-session renewal) who got
// a manual email from the owner (from Claire Donovan, legal@thecentral.ai —
// these are billing claims, reviewed and sent by hand, never auto-sent) and
// then went quiet for a week.
//
// Owner, 2026-08-25: "come le mando tu mi aggiorni la tabella e mi metti già
// un follow-up a +7 giorni che mi triggererà nuove draft in gmail che
// mando." Two separate jobs, on purpose:
//   1. THIS CRON — durable, server-side, needs no credentials this repo
//      doesn't already have. Every day it checks who crossed 7 days since
//      their last SENT stage with nobody moving them to the next stage and
//      nobody paying since, and inserts the next stage as a QUEUED row in
//      recovery_outreach. That row is the "never forget" guarantee: once
//      queued, it sits on /admin/revenue/outreach until acted on, it cannot
//      silently expire.
//   2. AUTHORING THE ACTUAL DRAFT — this cron does NOT do this, and cannot:
//      there is no server-side Gmail credential anywhere in this codebase
//      (checked, only the interactive Claude session has live Gmail MCP
//      access). A queued row is a to-do, not a sent email. Turning it into
//      an actual Gmail draft for the owner to review and send is done by
//      Claude in a live session, reading the queue this cron fills.
//
// STAGE CAP. 3 total stages (the original send plus two follow-ups, one
// week apart), matching every other hand-run sequence in this codebase
// (Pass Recovery is 1/3 2/3 3/3). An unanswered legal-sounding billing claim
// does not need a fourth nudge.
//
// SAFETY. Inserting a queued row has no external effect — nothing sends
// until a human authors and sends it from Gmail — so this cron is armed by
// default, unlike the crons that enroll people into live automations. The
// guard against duplicates is a DB constraint (person_key, stage) unique,
// not an env flag: see the recovery_followup_candidates migration.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const WAIT_DAYS = 7
const STAGE_CAP = 3
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
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}

interface Candidate {
  person_key: string
  next_stage: number
  prior_stage: number
  prior_sent_at: string
  invoice_id: string
  amount_cents: number
  currency: string | null
  pay_url: string | null
  from_address: string | null
  from_name: string | null
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dry = req.nextUrl.searchParams.get('dry') === '1'
  const c = sb()

  const { data, error } = await c.rpc('recovery_followup_candidates', {
    p_wait_days: WAIT_DAYS,
    p_stage_cap: STAGE_CAP,
    p_limit: 200,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const rows = (data || []) as Candidate[]

  if (dry) {
    return NextResponse.json({
      mode: 'dry-run',
      waitDays: WAIT_DAYS,
      stageCap: STAGE_CAP,
      candidates: rows.length,
      sample: rows.slice(0, 10).map(r => ({
        person: r.person_key.replace(/(.{2}).*(@.*)/, '$1***$2'),
        nextStage: r.next_stage,
        priorSentAt: r.prior_sent_at,
      })),
    })
  }

  // Re-verify every candidate right before inserting: still no row at
  // next_stage, still nobody paid since. The RPC result is a suggestion,
  // not a fact — same rule as checkout-recovery and pass-recovery.
  let queued = 0
  const failures: { person: string; error: string }[] = []
  const skipped: { person: string; reason: string }[] = []

  for (const r of rows.slice(0, BATCH)) {
    const { data: already } = await c
      .from('recovery_outreach')
      .select('id')
      .eq('person_key', r.person_key)
      .eq('stage', r.next_stage)
      .maybeSingle()
    if (already) {
      skipped.push({ person: r.person_key, reason: 'already queued/sent' })
      continue
    }
    const { data: paidSince } = await c
      .from('stripe_charges')
      .select('id')
      .or(`email.eq.${r.person_key},customer_email.eq.${r.person_key}`)
      .gt('charged_at', r.prior_sent_at)
      .eq('refunded', false)
      .limit(1)
      .maybeSingle()
    if (paidSince) {
      skipped.push({ person: r.person_key, reason: 'paid since prior send' })
      continue
    }

    const { error: insErr } = await c.from('recovery_outreach').insert({
      invoice_id: r.invoice_id,
      person_key: r.person_key,
      stage: r.next_stage,
      amount_cents: r.amount_cents,
      currency: r.currency,
      pay_url: r.pay_url,
      from_address: r.from_address,
      from_name: r.from_name,
      status: 'queued',
    })
    if (insErr) {
      failures.push({ person: r.person_key, error: insErr.message })
      continue
    }
    queued++
  }

  return NextResponse.json({
    waitDays: WAIT_DAYS,
    stageCap: STAGE_CAP,
    candidates: rows.length,
    queued,
    skipped: skipped.length,
    skippedSample: skipped.slice(0, 5),
    failed: failures.length,
    failures: failures.slice(0, 5),
  })
}
