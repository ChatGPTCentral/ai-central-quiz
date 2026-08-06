// Prime one subscriber's Pass Recovery merge fields, so the beehiiv preview
// manager shows what a real person will actually receive.
//
// Why this exists. The emails merge {{result_url}}, {{rung_line}},
// {{next_stage}} and {{first_name}}, and those are written by the enrolment
// cron at send time. Before the sequence is armed, nobody has them, so a
// preview renders every fallback and tells you nothing about whether the
// personalisation works — which is the only part worth testing.
//
// This runs exactly the same field-writing code the cron does, for one email,
// behind the admin session. It does NOT enrol anyone and does NOT send
// anything: it only populates the fields so the preview has something to show.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { setPassRecoveryFields } from '@/lib/beehiiv'
import { personResultPath } from '@/lib/result-url'
import { STAGES } from '@/lib/segmentation-v2'

export const dynamic = 'force-dynamic'

function nextStageLabel(stage: string): string | null {
  const ordered = STAGES.filter(s => s.key.startsWith('S'))
  const i = ordered.findIndex(s => s.key === stage)
  if (i < 0 || i >= ordered.length - 1) return null
  return ordered[i + 1].label
}

function rungLine(stage: string | null): string {
  const next = stage ? nextStageLabel(stage) : null
  if (next) return `You are one stage off ${next}`
  return 'You are at the top of the ladder, the risk now is staying there'
}

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
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'pass ?email=' }, { status: 400 })

  const { data, error } = await sb()
    .from('submissions')
    .select('id, email, name, score, persona, stage')
    .ilike('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = data?.[0]
  if (!row) return NextResponse.json({ error: 'no submission for that email' }, { status: 404 })

  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai').replace(/\/$/, '')
  const resultUrl = site + personResultPath({
    id: row.id, name: row.name, score: row.score, persona: row.persona, stage: row.stage,
  })
  const fields = {
    result_url: resultUrl,
    rung_line: rungLine(row.stage),
    next_stage: row.stage ? nextStageLabel(row.stage) : null,
    first_name: (row.name as string | null)?.trim().split(/\s+/)[0] ?? null,
  }

  const res = await setPassRecoveryFields({
    email: row.email,
    resultUrl,
    rungLine: fields.rung_line,
    nextStage: fields.next_stage,
    firstName: fields.first_name,
  })

  return NextResponse.json({
    email: row.email,
    wrote: res.success,
    error: res.success ? undefined : res.error,
    subscriptionId: res.subscriptionId ?? null,
    fields,
    next: res.success
      ? 'Open the automation in beehiiv, use the preview manager, and search this email'
      : 'Field write failed - - if NOT_SUBSCRIBED, this person is not in beehiiv, so merges would fall back',
  })
}
