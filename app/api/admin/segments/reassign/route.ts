import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { fromRow, type DbRow } from '@/lib/kv'
import { assignSegment } from '@/lib/segmentation'

export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/admin/segments/reassign
 *
 * Re-runs the persona classifier on every submissions row and persists
 * segment + segment_score + segment_reason + segmented_at.
 *
 * Body: { dryRun?: boolean, limit?: number }
 *   dryRun=true returns the distribution without writing
 *   limit caps the number of rows touched in one call (default 5000, max 10000)
 *
 * Idempotent — skipping rows whose segment is already correct.
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
  const distribution: Record<string, number> = {}
  const t0 = Date.now()
  const deadline = t0 + 270_000

  while (scanned < cap && Date.now() < deadline) {
    // Pull everything we need to compute a segment + write the result.
    // Drop heavy jsonb columns (matches LIST_COLUMNS in dashboard-queries).
    const sel = [
      'id', 'email', 'name', 'ts', 'created_at', 'ip', 'user_agent', 'archived_at',
      'ai_level', 'work_area', 'learning_style', 'time_commitment', 'main_goal', 'ai_tools', 'job_level',
      'archetype', 'score',
      'linkedin_url', 'photo_url',
      'job_title', 'job_title_standardized', 'seniority', 'job_function', 'department',
      'company_name', 'company_domain', 'company_linkedin_url', 'company_website',
      'company_size', 'company_industry', 'company_sub_industry',
      'company_revenue', 'company_funding', 'company_founded_year',
      'country', 'region', 'city',
      'enrichment_status', 'enriched_at',
      'age_bracket', 'age_ai_estimate', 'sex_ai_estimate', 'ai_estimate_confidence',
      'source', 'buying_intent', 'utm_source', 'utm_ref', 'utm_source_beehiiv',
      'subscription_tier', 'beehiiv_status',
      'stripe_customer_id', 'stripe_customer_ids', 'stripe_products', 'stripe_subscriptions',
      'stripe_first_charge_at', 'stripe_last_charge_at', 'stripe_imported_at',
      'lifetime_value_usd',
      'segment', 'segment_score', 'segment_reason', 'segmented_at',
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
      const { segment, score, reason } = assignSegment(row)
      distribution[segment] = (distribution[segment] || 0) + 1
      // Skip write if nothing changed
      if (!dryRun && (row.segment !== segment || row.segmentScore !== score || row.segmentReason !== reason)) {
        const { error: upErr } = await c
          .from('submissions')
          .update({
            segment,
            segment_score: score,
            segment_reason: reason,
            segmented_at: new Date().toISOString(),
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
    distribution,
    dryRun,
    elapsedMs: Date.now() - t0,
    hasMore: scanned >= cap,
  })
}
