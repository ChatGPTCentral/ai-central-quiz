// Save a table's column layout (order + which are hidden).
//
// Stored in app_settings under `table_layout:<table>` so it survives deploys
// and follows the owner across devices, rather than living in one browser's
// localStorage where a new laptop loses it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

export async function POST(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    { table?: string; order?: string[]; hidden?: string[]; reset?: boolean } | null
  const table = body?.table?.trim()
  if (!table || !/^[a-z0-9_]{3,40}$/.test(table)) {
    return NextResponse.json({ error: 'table required' }, { status: 400 })
  }
  const c = db()
  const settingKey = `table_layout:${table}`

  if (body?.reset) {
    const { error } = await c.from('app_settings').delete().eq('key', settingKey)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, reset: true })
  }

  const order = Array.isArray(body?.order) ? body!.order.slice(0, 60) : []
  const hidden = Array.isArray(body?.hidden) ? body!.hidden.slice(0, 60) : []
  if (order.length === 0) return NextResponse.json({ error: 'order[] required' }, { status: 400 })

  const { error } = await c.from('app_settings').upsert({
    key: settingKey,
    value: { order, hidden },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, order, hidden })
}
