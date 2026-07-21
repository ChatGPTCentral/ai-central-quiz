// Unified verify + tune. GET serves the next unverified contact (every quiz_v2
// record with an email that no one has confirmed yet — the enrichers run fresh
// via ./enrich, so a record needs no prior enrichment to appear here). POST
// records the owner's decision: it writes the chosen/overridden profile onto the
// submission and stamps it verified, banks it as ground truth in
// `verified_identities` (so the resolver reuses it as few-shot for look-alikes),
// and logs the head-to-head into `enrich_game` for the weekly re-tune.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { normalizeCountry } from '@/lib/normalize'

export const dynamic = 'force-dynamic'

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WON = ['apollo', 'verified', 'both', 'manual', 'neither'] as const
const val = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

interface Row {
  id: string; name: string | null; email: string | null; country: string | null
  job_level: string | null; work_area: string | null; created_at: string | null
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const c = sb()
  const exclude = (req.nextUrl.searchParams.get('exclude') || '')
    .split(',').map(s => s.trim()).filter(s => UUID_RE.test(s)).slice(0, 300)

  // Everyone not yet verified (with an email) is in the queue.
  const { count: queueTotal } = await c.from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'quiz_v2').is('archived_at', null).not('email', 'is', null)
    .is('enrichment_verified_at', null)
  const { count: verifiedTotal } = await c.from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'quiz_v2').is('archived_at', null).not('email', 'is', null)
    .not('enrichment_verified_at', 'is', null)

  const rowsQ = c.from('submissions')
    .select('id, name, email, country, job_level, work_area, created_at')
    .eq('source', 'quiz_v2').is('archived_at', null).not('email', 'is', null)
    .is('enrichment_verified_at', null)
    .order('created_at', { ascending: false }).limit(1)
  const { data, error } = await (exclude.length
    ? rowsQ.not('id', 'in', `(${exclude.join(',')})`)
    : rowsQ
  ).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const r = data as Row | null
  const record = r ? {
    id: r.id,
    known: { name: r.name, email: r.email, country: r.country, jobLevel: r.job_level, workArea: r.work_area },
  } : null
  return NextResponse.json({ record, stats: { queueTotal: queueTotal || 0, verifiedTotal: verifiedTotal || 0 } })
}

interface Profile { linkedinUrl?: string; companyName?: string; jobTitle?: string; country?: string; seniority?: string; industry?: string; photoUrl?: string }

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: {
    id?: string; won?: string; profile?: Profile; method?: string
    apollo?: Record<string, unknown>; verified?: Record<string, unknown>
    known?: Record<string, string | null>
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id || !UUID_RE.test(body.id)) return NextResponse.json({ error: 'valid id required' }, { status: 400 })
  if (!body.won || !WON.includes(body.won as typeof WON[number])) return NextResponse.json({ error: 'invalid won' }, { status: 400 })

  const c = sb()
  const now = new Date().toISOString()
  const won = body.won as typeof WON[number]
  const p = body.profile || {}

  // 1) Write the chosen/overridden profile onto the record + stamp verified.
  const update: Record<string, unknown> = { enrichment_verified_at: now }
  const set = (col: string, v?: string) => { if (v) update[col] = v }
  if (won === 'neither') {
    update.enrichment_status = 'unresolved'
  } else {
    set('linkedin_url', val(p.linkedinUrl))
    set('company_name', val(p.companyName))
    set('job_title', val(p.jobTitle))
    const country = normalizeCountry(val(p.country) || '')
    if (country) update.country = country
    set('seniority', val(p.seniority))
    set('company_industry', val(p.industry))
    set('photo_url', val(p.photoUrl))
    update.enriched_at = now
    update.enrichment_status = 'verified'
  }
  const { error: upErr } = await c.from('submissions').update(update).eq('id', body.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // 2) Bank a positive ground truth (few-shot fuel) when a real profile stood.
  const email = val(body.known?.email)?.toLowerCase()
  const domain = email && email.includes('@') ? email.split('@')[1] : undefined
  if (won !== 'neither' && (val(p.linkedinUrl) || val(p.companyName) || val(p.jobTitle))) {
    await c.from('verified_identities').insert({
      submission_id: body.id, email: email || null, email_domain: domain || null,
      name: val(body.known?.name) || null, linkedin_url: val(p.linkedinUrl) || null,
      company_name: val(p.companyName) || null, job_title: val(p.jobTitle) || null,
      country: normalizeCountry(val(p.country) || '') || val(p.country) || null, won,
    }).then(() => {}, () => {}) // best-effort; never block the decision
  }

  // 3) Log the head-to-head for the weekly re-tune / accuracy measurement.
  const choice = won === 'apollo' ? 'current' : won === 'verified' ? 'new' : won // both|manual|neither pass through
  await c.from('enrich_game').upsert({
    submission_id: body.id,
    known: body.known || {},
    current: body.apollo || {},
    proposed: body.verified || {},
    choice,
    truth: won === 'manual' ? p : null,
    method: val(body.method) || null,
    labeled_at: now,
    committed_at: now,
  }, { onConflict: 'submission_id' }).then(() => {}, () => {})

  return NextResponse.json({ ok: true })
}
