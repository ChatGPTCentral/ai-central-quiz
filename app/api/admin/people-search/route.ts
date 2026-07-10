// Typeahead search for the ⌘K command palette. Matches name / email /
// company across submissions. isAdmin-guarded.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

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
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ people: [] })
  const like = `%${q.replace(/[%_]/g, '')}%`
  try {
    const { data, error } = await sb()
      .from('submissions')
      .select('id, name, email, job_title, company_name, stage, photo_url')
      .is('archived_at', null)
      .or(`name.ilike.${like},email.ilike.${like},company_name.ilike.${like}`)
      .order('staged_at', { ascending: false, nullsFirst: false })
      .limit(6)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      people: (data || []).map(r => ({
        id: r.id, name: r.name, email: r.email, jobTitle: r.job_title, company: r.company_name, stage: r.stage,
        photoUrl: r.photo_url,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
