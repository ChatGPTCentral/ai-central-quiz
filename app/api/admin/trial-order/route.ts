// Save the manual order of the trials table after a drag.
//
// The client sends the charge ids in their new visual order; we write them as
// positions 0..n. Only the rows the owner has actually arranged get an entry,
// so anything new keeps falling back to the date sort instead of appearing in
// an arbitrary spot.

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

  const body = await req.json().catch(() => null) as { order?: string[]; reset?: boolean } | null
  const c = db()

  if (body?.reset) {
    const { error } = await c.from('trial_row_order').delete().neq('charge_id', '')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, cleared: true })
  }

  const order = body?.order
  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'order[] required' }, { status: 400 })
  }
  if (order.length > 5000) {
    return NextResponse.json({ error: 'too many rows' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const rows = order.map((charge_id, i) => ({ charge_id, position: i, updated_at: now }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await c.from('trial_row_order').upsert(rows.slice(i, i + 500), { onConflict: 'charge_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, saved: rows.length })
}
