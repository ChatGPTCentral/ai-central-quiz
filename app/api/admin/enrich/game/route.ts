// Enrichment labeling game: serve the next unlabeled round (+ running score)
// and record the owner's verdict. Verdicts become the eval set the resolver is
// tuned against.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHOICES = ['new', 'current', 'both', 'neither', 'skip']

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const c = sb()
  const { data: next } = await c.from('enrich_game').select('*').is('labeled_at', null).order('created_at').limit(1).maybeSingle()
  const { data: labeled } = await c.from('enrich_game').select('choice').not('labeled_at', 'is', null)
  const rows = labeled || []
  const scored = rows.filter(r => r.choice && r.choice !== 'skip')
  const stats = {
    total: 0, // filled below
    labeled: rows.length,
    scored: scored.length,
    newRight: scored.filter(r => r.choice === 'new' || r.choice === 'both').length,
    currentRight: scored.filter(r => r.choice === 'current' || r.choice === 'both').length,
    neither: scored.filter(r => r.choice === 'neither').length,
  }
  const { count } = await c.from('enrich_game').select('*', { count: 'exact', head: true })
  stats.total = count || 0
  return NextResponse.json({ round: next || null, stats })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: string; choice?: string; truth?: unknown; method?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id || !UUID_RE.test(body.id)) return NextResponse.json({ error: 'valid id required' }, { status: 400 })
  if (!body.choice || !CHOICES.includes(body.choice)) return NextResponse.json({ error: 'invalid choice' }, { status: 400 })
  const c = sb()
  const patch: Record<string, unknown> = {
    choice: body.choice,
    method: typeof body.method === 'string' ? body.method.slice(0, 2000) : null,
    truth: body.truth && typeof body.truth === 'object' ? body.truth : null,
    labeled_at: new Date().toISOString(),
  }
  const { error } = await c.from('enrich_game').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
