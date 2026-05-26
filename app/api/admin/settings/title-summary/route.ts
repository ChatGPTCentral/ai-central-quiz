import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { resolveSeniority, resolveTitle } from '@/lib/classification-overrides'

export const maxDuration = 60

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * GET /api/admin/settings/title-summary
 * Returns every unique job_title in submissions, with its resolved seniority
 * + standardized title (after overrides). Used by the Settings page to show
 * the user exactly how each raw title gets classified.
 */
export async function GET(_req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const c = client()
  const { data, error } = await c
    .from('submissions')
    .select('job_title')
    .not('job_title', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts = new Map<string, number>()
  for (const row of (data || []) as { job_title: string }[]) {
    const t = row.job_title?.trim()
    if (!t) continue
    counts.set(t, (counts.get(t) || 0) + 1)
  }

  const out: { title: string; count: number; seniority: string; standardized: string | null }[] = []
  for (const [title, count] of Array.from(counts.entries())) {
    const seniority = (await resolveSeniority(title)) || 'Other'
    const standardized = (await resolveTitle(title)) || null
    out.push({ title, count, seniority, standardized })
  }
  out.sort((a, b) => b.count - a.count)
  return NextResponse.json({ items: out })
}
