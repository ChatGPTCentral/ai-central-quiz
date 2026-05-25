import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { enrichRowFields, type FieldName } from '@/lib/enrichment/field-enricher'

export const maxDuration = 180

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/admin/enrich/v2/field
 *
 * Surgical field-level enrichment — runs ONLY the minimum API calls needed
 * for the requested fields. Use when you just need a single missing column.
 *
 * Body: { id: string, fields: ('photo' | 'demographics' | 'beehiiv' | 'stripe')[] }
 *
 * Cost map (per row):
 *   'photo'        → 1× Apify scrape (~$0.004), Apollo fallback if Apify misses
 *   'demographics' → 1× Claude vision (~$0.005) — fills age + sex together
 *   'beehiiv'      → 1× Beehiiv API call (free)
 *   'stripe'       → 1× Stripe customers.search + charges.list (free)
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string; fields?: FieldName[] }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!body.fields?.length) return NextResponse.json({ error: 'fields required' }, { status: 400 })

  const c = client()
  const result = await enrichRowFields(c, body.id, body.fields)
  return NextResponse.json(result)
}
