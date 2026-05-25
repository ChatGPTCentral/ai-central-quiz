import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { enrichRowFields, type FieldEnrichResult } from '../route'

export const maxDuration = 300

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/admin/enrich/v2/field/batch
 *
 * Body: {
 *   field: 'photo' | 'demographics',     // which single column to fill
 *   filter?: { missingOnly?: boolean },  // default true — skip rows that have it
 *   limit?: number,                      // safety cap, default 50
 *   ids?: string[],                      // optional explicit ids; otherwise scans
 * }
 *
 * Runs the surgical field enricher on each matching row.
 * Returns per-row results + aggregate cost.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { field?: 'photo' | 'demographics'; ids?: string[]; limit?: number; missingOnly?: boolean }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const field = body.field
  if (field !== 'photo' && field !== 'demographics') {
    return NextResponse.json({ error: 'field must be "photo" or "demographics"' }, { status: 400 })
  }
  const limit = Math.max(1, Math.min(body.limit ?? 50, 200))
  const missingOnly = body.missingOnly !== false

  const c = client()
  let ids: string[] = []

  if (body.ids?.length) {
    ids = body.ids.slice(0, limit)
  } else {
    // Auto-pick rows that are missing the target field
    let q = c.from('submissions').select('id').order('ts', { ascending: false }).limit(limit)
    if (missingOnly) {
      if (field === 'photo') {
        q = q.or('photo_url.is.null,photo_url.eq.')
      } else {
        // demographics → either age or sex missing
        q = q.or('age_ai_estimate.is.null,sex_ai_estimate.is.null')
      }
    }
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    ids = (data || []).map((r: { id: string }) => r.id)
  }

  if (ids.length === 0) return NextResponse.json({ processed: 0, results: [], totalCost: { apify: 0, apollo: 0, claude: 0 } })

  // Sequential to keep the cost log accurate and avoid hammering any provider.
  const results: FieldEnrichResult[] = []
  for (const id of ids) {
    const r = await enrichRowFields(c, id, [field])
    results.push(r)
  }

  const totalCost = results.reduce(
    (acc, r) => ({ apify: acc.apify + r.cost.apify, apollo: acc.apollo + r.cost.apollo, claude: acc.claude + r.cost.claude }),
    { apify: 0, apollo: 0, claude: 0 },
  )
  const updatedCount = results.filter(r => r.updated.length > 0).length

  return NextResponse.json({
    processed: results.length,
    updatedCount,
    results,
    totalCost,
  })
}
