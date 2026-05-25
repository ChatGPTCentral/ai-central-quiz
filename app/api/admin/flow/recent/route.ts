import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * GET /api/admin/flow/recent
 *
 * Lightweight observability payload for the Flow page:
 *  - `recent`: 12 newest submissions (email + archetype)
 *  - `stats`:  per-archetype population count across the entire table
 */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const c = client()

  const [recent, all] = await Promise.all([
    c.from('submissions').select('id, email, archetype').order('ts', { ascending: false }).limit(12),
    c.from('submissions').select('archetype'),
  ])

  const stats: Record<string, number> = {}
  for (const r of (all.data || []) as Array<{ archetype: string | null }>) {
    const key = r.archetype || '(none)'
    stats[key] = (stats[key] || 0) + 1
  }

  return NextResponse.json({
    recent: recent.data || [],
    stats,
  })
}
