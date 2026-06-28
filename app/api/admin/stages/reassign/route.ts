import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { fromRow, type DbRow } from '@/lib/kv'
import { assignSegmentationV2 } from '@/lib/segmentation-v2'

export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/admin/stages/reassign
 *
 * Re-runs the v2 (laddered Stage + Persona) classifier on every
 * row. Writes to stage / stage_score / stage_reason / persona /
 * persona_reason / staged_at — leaves the original `segment` columns
 * untouched.
 *
 * Body: { dryRun?: boolean, limit?: number }
 *
 * Idempotent — skips writes when nothing changed.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { dryRun?: boolean; limit?: number } = {}
  try { body = await req.json() } catch { /* empty ok */ }
  const cap = Math.min(Math.max(body.limit ?? 5000, 1), 10000)
  const dryRun = body.dryRun === true

  const c = sb()
  const PAGE = 1000
  let offset = 0
  let scanned = 0
  let updated = 0
  const stageDist: Record<string, number> = {}
  const personaDist: Record<string, number> = {}
  const crossTab: Record<string, number> = {}  // `${stage}|${persona}` -> count
  const t0 = Date.now()
  const deadline = t0 + 270_000

  while (scanned < cap && Date.now() < deadline) {
    const sel = [
      'id', 'email', 'name', 'ts', 'created_at', 'ip', 'user_agent', 'archived_at',
      'ai_level', 'work_area', 'learning_style', 'time_commitment', 'main_goal', 'ai_tools', 'job_level',
      'score',
      'linkedin_url', 'photo_url',
      'job_title', 'job_title_standardized', 'seniority', 'job_function', 'department',
      'company_name', 'company_domain', 'company_linkedin_url', 'company_website',
      'company_size', 'company_industry', 'company_sub_industry',
      'country', 'region', 'city',
      'age_bracket', 'age_ai_estimate', 'sex_ai_estimate',
      'source', 'utm_source', 'utm_source_beehiiv',
      'subscription_tier', 'beehiiv_status',
      'stripe_customer_id', 'lifetime_value_usd',
      'stage', 'stage_score', 'stage_reason', 'persona', 'persona_reason', 'staged_at',
    ].join(', ')

    const { data, error } = await c
      .from('submissions')
      .select(sel)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const batch = (data || []) as unknown as DbRow[]
    if (batch.length === 0) break

    for (const dbRow of batch) {
      scanned++
      const row = fromRow(dbRow)
      const v2 = assignSegmentationV2(row)

      stageDist[v2.stage] = (stageDist[v2.stage] || 0) + 1
      personaDist[v2.persona] = (personaDist[v2.persona] || 0) + 1
      const ck = `${v2.stage}|${v2.persona}`
      crossTab[ck] = (crossTab[ck] || 0) + 1

      const changed =
        row.stage !== v2.stage ||
        row.stageScore !== v2.stageScore ||
        row.stageReason !== v2.stageReason ||
        row.persona !== v2.persona ||
        row.personaReason !== v2.personaReason

      if (!dryRun && changed) {
        const { error: upErr } = await c
          .from('submissions')
          .update({
            stage: v2.stage,
            stage_score: v2.stageScore,
            stage_reason: v2.stageReason,
            persona: v2.persona,
            persona_reason: v2.personaReason,
            staged_at: new Date().toISOString(),
          })
          .eq('id', dbRow.id)
        if (!upErr) updated++
      }
      if (scanned >= cap || Date.now() > deadline) break
    }
    if (batch.length < PAGE) break
    offset += PAGE
  }

  return NextResponse.json({
    scanned,
    updated,
    stageDist,
    personaDist,
    crossTab,
    dryRun,
    elapsedMs: Date.now() - t0,
    hasMore: scanned >= cap,
  })
}
