import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const c = client()
    const [total, withLi, missing, failedRecent] = await Promise.all([
      c.from('submissions').select('id', { count: 'exact', head: true }),
      c.from('submissions').select('id', { count: 'exact', head: true }).not('linkedin_url', 'is', null),
      c.from('submissions').select('id', { count: 'exact', head: true }).is('linkedin_url', null),
      c.from('submissions').select('id', { count: 'exact', head: true }).eq('enrichment_status', 'failed'),
    ])
    const totalN = total.count || 0
    const withLiN = withLi.count || 0
    const missingN = missing.count || 0
    const failedN = failedRecent.count || 0
    return NextResponse.json({
      total: totalN,
      withLinkedin: withLiN,
      missingLinkedin: missingN,
      previouslyFailed: failedN,
      reEnrichTargets: missingN, // rows we'd attempt
      hitRatePct: totalN > 0 ? Math.round((withLiN / totalN) * 100) : 0,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
