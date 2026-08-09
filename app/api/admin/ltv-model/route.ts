// Read and save the shared LTV assumptions.
//
// One row in app_settings, read by the simulator (where the owner sets it) and
// by the ads page (which prices paid traffic against it). Deliberately a
// server route rather than component state: the whole point is that the two
// screens cannot disagree about what a customer is worth.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { LTV_SETTINGS_KEY, LTV_DEFAULTS, parseLtvModel, ltvFrom } from '@/lib/ltv-model'
import { readLtvModel } from '@/lib/ltv-settings'

export const dynamic = 'force-dynamic'

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read: an ads page pricing spend against a stale
    // assumption is worse than one that fails loudly.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const model = await readLtvModel()
  return NextResponse.json({ model, ltv: ltvFrom(model), defaults: LTV_DEFAULTS })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }

  // parseLtvModel is total, so a typo cannot write a model that renders NaN on
  // a page used to decide advertising spend.
  const model = parseLtvModel(body)
  try {
    const { error } = await sb()
      .from('app_settings')
      .upsert({ key: LTV_SETTINGS_KEY, value: model, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  return NextResponse.json({ ok: true, model, ltv: ltvFrom(model) })
}
