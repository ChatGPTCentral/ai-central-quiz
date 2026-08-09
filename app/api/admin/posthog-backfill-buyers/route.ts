// Back-label every session that belongs to a buyer.
//
// THE OWNER'S IDEA, and it is the right one. The result page URL carries the
// submission id (/result?...&id=<uuid>), so every PostHog event fired on that
// page already contains the key that identifies the person — we just never used
// it. That means the buyer cohort does not have to be built forward from today;
// it can be recovered from history.
//
// Why it is needed at all: identifyPerson was written and never called, so
// PostHog only ever knew people by an anonymous device id. Purchases captured
// against a submission id therefore landed on a person with no browsing
// history. This walks back through the events, maps each anonymous distinct_id
// to the submission id in the URL it visited, and marks the ones that bought.
//
// Runs on demand. Idempotent: $set is a write of the same value, so running it
// twice changes nothing.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { posthogCapture } from '@/lib/posthog-server'
import { hogql } from '@/lib/posthog-read'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

export async function GET(req: NextRequest) {
  if (!(await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'

  // 1. Who bought, from OUR database, which is authoritative on payment.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env vars missing' }, { status: 500 })
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
  const { data: buyerRows, error: dbErr } = await c
    .from('submissions')
    .select('id, quiz_completed_at, stripe_first_charge_at, lifetime_value_usd')
    .not('stripe_first_charge_at', 'is', null)
    .is('archived_at', null)
    .or('is_test.is.null,is_test.eq.false')
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // Net-new only: someone who paid BEFORE their quiz is an existing customer,
  // and flagging them as a buyer would poison every "what converts" question
  // with people the quiz never converted.
  const buyers = new Set<string>()
  for (const r of (buyerRows || []) as { id: string; quiz_completed_at: string | null; stripe_first_charge_at: string }[]) {
    if (!r.quiz_completed_at) continue
    if (new Date(r.stripe_first_charge_at).getTime() > new Date(r.quiz_completed_at).getTime()) buyers.add(r.id)
  }

  // 2. Every anonymous distinct_id, mapped to the submission id in the result
  //    URL it visited. This is the join the owner spotted.
  const { rows, error } = await hogql(`
    SELECT
      extract(properties.$current_url, 'id=(${UUID})') AS submission_id,
      distinct_id,
      count() AS events
    FROM events
    WHERE properties.$current_url LIKE '%/result%id=%'
    GROUP BY submission_id, distinct_id
    HAVING submission_id != ''
    LIMIT 10000
  `)
  if (error) return NextResponse.json({ ok: false, error }, { status: 502 })

  // A submission can map to several device ids (phone then laptop), and a
  // device id can map to several submissions (shared machine). Both are marked:
  // the question is "did this person's sessions belong to a buyer", and a
  // shared device genuinely did.
  const toMark = new Map<string, string>()   // distinctId -> submissionId
  let seenPairs = 0
  for (const r of rows) {
    const submissionId = String(r[0] || '')
    const distinctId = String(r[1] || '')
    if (!submissionId || !distinctId) continue
    seenPairs++
    if (buyers.has(submissionId)) toMark.set(distinctId, submissionId)
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true,
      buyersInDb: buyers.size,
      resultPagePairs: seenPairs,
      wouldMark: toMark.size,
      sample: Array.from(toMark.entries()).slice(0, 5).map(([d, s]) => ({ distinctId: d, submissionId: s })),
    })
  }

  // 3. Mark them. $set writes the PERSON, so every earlier session becomes
  //    queryable against the buyer cohort. backfilled:true keeps these
  //    distinguishable from live purchases, since the timestamp is not the
  //    real purchase moment.
  let marked = 0
  for (const [distinctId, submissionId] of Array.from(toMark)) {
    await posthogCapture({
      distinctId,
      event: 'buyer_backfill',
      properties: { submission_id: submissionId, backfilled: true },
      personSet: { is_buyer: true, backfilled: true },
    })
    marked++
  }

  return NextResponse.json({
    ok: true,
    buyersInDb: buyers.size,
    resultPagePairs: seenPairs,
    marked,
    note: 'is_buyer is now set on those PostHog persons. Cohort queries in posthog-sync will pick them up on the next run.',
  })
}
