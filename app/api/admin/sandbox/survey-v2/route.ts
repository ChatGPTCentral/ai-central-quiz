import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { fromRow, type DbRow } from '@/lib/kv'
import { assignSegmentationV2 } from '@/lib/segmentation-v2'
import { answersToV2 } from '@/lib/questions-v2'

export const maxDuration = 60

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/admin/sandbox/survey-v2
 *
 * Records Survey v2 answers for a target email and re-classifies the
 * row using the upgraded sandbox classifier. Writes ONLY to the new
 * sandbox columns - - existing quiz answers untouched.
 *
 * Body: {
 *   email: string,            // target row
 *   answers: { frequency?, depth?, breadth?, momentum?, friction?, intent_30d? }
 * }
 *
 * Where each answer is the raw form value (string or string[]).
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { email?: string; answers?: Record<string, string | string[]> } = {}
  try { body = await req.json() } catch { /* empty */ }
  const email = (body.email || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
  const v2 = answersToV2(body.answers || {})
  if (Object.keys(v2).length === 0) {
    return NextResponse.json({ error: 'no answers to record' }, { status: 400 })
  }

  const c = sb()

  // Find the target row
  const { data: rows, error: findErr } = await c
    .from('submissions')
    .select('*')
    .ilike('email', email)
    .is('archived_at', null)
    .limit(1)
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: `no row for ${email}` }, { status: 404 })
  }
  const dbRow = rows[0] as DbRow

  // Build update — only the v2 columns the answers covered
  const update: Record<string, unknown> = {}
  if (v2.frequency_score !== undefined) update.frequency_score = v2.frequency_score
  if (v2.depth_score !== undefined)     update.depth_score     = v2.depth_score
  if (v2.breadth_score !== undefined)   update.breadth_score   = v2.breadth_score
  if (v2.momentum !== undefined)        update.momentum        = v2.momentum
  if (v2.friction !== undefined)        update.friction        = v2.friction
  if (v2.intent_30d !== undefined)      update.intent_30d      = v2.intent_30d

  // Compute new stage/persona using the updated values
  const merged = { ...dbRow, ...update } as DbRow
  const seg = assignSegmentationV2(fromRow(merged))
  update.stage = seg.stage
  update.stage_score = seg.stageScore
  update.stage_reason = seg.stageReason
  update.persona = seg.persona
  update.persona_reason = seg.personaReason
  update.staged_at = new Date().toISOString()

  const { error: upErr } = await c.from('submissions').update(update).eq('id', dbRow.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Append to stage_history so we can see this transition later
  await c.from('stage_history').insert({
    submission_id: dbRow.id,
    stage: seg.stage,
    stage_score: seg.stageScore,
    persona: seg.persona,
  })

  return NextResponse.json({
    saved: true,
    id: dbRow.id,
    email,
    previousStage: dbRow.stage,
    newStage: seg.stage,
    newStageReason: seg.stageReason,
    newPersona: seg.persona,
    newPersonaReason: seg.personaReason,
    v2Recorded: v2,
  })
}
