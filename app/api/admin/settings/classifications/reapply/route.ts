import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { resolveSeniority, resolveTitle } from '@/lib/classification-overrides'

export const maxDuration = 300

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/admin/settings/classifications/reapply
 * Re-runs seniority + standardized-title classification on every submissions
 * row, applying the current overrides + hardcoded banks. Idempotent — rows
 * already mapped to the same value are skipped.
 */
export async function POST(_req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const c = client()
  const { data, error } = await c
    .from('submissions')
    .select('id, job_title, seniority, job_title_standardized')
    .not('job_title', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let seniorityUpdated = 0
  let titleUpdated = 0
  let scanned = 0
  for (const row of (data || []) as { id: string; job_title: string; seniority: string | null; job_title_standardized: string | null }[]) {
    scanned++
    const seniority = await resolveSeniority(row.job_title, row.seniority)
    const titleCanonical = await resolveTitle(row.job_title)
    const update: Record<string, unknown> = {}
    if (seniority && seniority !== row.seniority) { update.seniority = seniority; seniorityUpdated++ }
    if (titleCanonical && titleCanonical !== row.job_title_standardized) { update.job_title_standardized = titleCanonical; titleUpdated++ }
    if (Object.keys(update).length > 0) {
      await c.from('submissions').update(update).eq('id', row.id)
    }
  }

  return NextResponse.json({ scanned, seniorityUpdated, titleUpdated })
}
