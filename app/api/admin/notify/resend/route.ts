// Re-enrich a submission and (re)send its new-lead notification email.
// Used by the "Resend last lead notification" button in admin settings, and
// handy for spot-checking the notification format on demand.
//
// POST body (all optional):
//   { id?: string, email?: string, reEnrich?: boolean }
//   - no id/email → the most recent submission
//   - reEnrich (default true) → re-run the enrichment pipeline first

import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { enrichLeadAndNotify } from '@/lib/enrichment/enrich-lead'

export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string; email?: string; reEnrich?: boolean } = {}
  try { body = await req.json() } catch { /* empty body = latest */ }

  const c = sb()

  // Resolve the target row.
  let rowId = body.id || null
  if (!rowId) {
    let q = c.from('submissions').select('id').order('ts', { ascending: false }).limit(1)
    if (body.email) q = c.from('submissions').select('id').ilike('email', body.email.trim().toLowerCase()).order('ts', { ascending: false }).limit(1)
    const { data } = await q.maybeSingle()
    rowId = data?.id ?? null
  }
  if (!rowId) return NextResponse.json({ error: 'No submission found' }, { status: 404 })

  const result = await enrichLeadAndNotify(rowId, {
    reEnrich: body.reEnrich !== false,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  })

  return NextResponse.json({ ok: true, rowId, ...result })
}
