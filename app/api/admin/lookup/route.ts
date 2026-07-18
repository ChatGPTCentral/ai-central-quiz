import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { getPrefillData } from '@/lib/prefill'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ?recent=1 → the latest quiz submissions as quick-pick candidates for the
  // debug page (no more coming up with emails by hand).
  if (req.nextUrl.searchParams.get('recent') === '1') {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return NextResponse.json({ recent: [] })
    const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await c
      .from('submissions')
      .select('name, email, created_at')
      .eq('source', 'quiz_v2').is('archived_at', null).not('email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(12)
    return NextResponse.json({ recent: data || [] })
  }

  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase() || ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }
  try {
    const data = await getPrefillData(email)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
