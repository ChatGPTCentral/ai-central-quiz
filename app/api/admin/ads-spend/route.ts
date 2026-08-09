// Ad spend, saved.
//
// LinkedIn owns the real number and neither this codebase nor its database can
// reach it: there is no 2026 LinkedIn invoice in the finance DB, and the ads
// app is a separate deployment. So it is entered by hand — but it must PERSIST.
// It used to be a component default, which meant every page load reset it to
// 666.74 and the whole ads page priced itself against a figure nobody typed.
// A wrong number that persists is bad. A wrong number that resets on refresh is
// worse, because it looks like data.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { ADS_SPEND_KEY } from '@/lib/ltv-model'
import { readAdsSpend } from '@/lib/ltv-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ usd: await readAdsSpend() })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { usd?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }
  const usd = Number(body.usd)
  if (!Number.isFinite(usd) || usd < 0) return NextResponse.json({ error: 'usd must be a non-negative number' }, { status: 400 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env vars missing' }, { status: 500 })
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
  const { error } = await c
    .from('app_settings')
    .upsert({ key: ADS_SPEND_KEY, value: { usd }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, usd })
}
