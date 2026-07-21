// Verify new records: serve the next unverified-but-enriched submission and
// let the owner confirm (or correct) the profile already stored in the DB,
// stamping enrichment_verified_at directly on `submissions`. This is the QA
// pass over live records — distinct from the tuner (which compares pipelines
// into `enrich_game` to train the resolver). No enrichment is re-run here, so
// confirming/correcting spends zero API credits.

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
const HAS_ENRICH = 'linkedin_url.not.is.null,company_name.not.is.null,job_title.not.is.null'
const val = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

interface Row {
  id: string; name: string | null; email: string | null; country: string | null
  linkedin_url: string | null; company_name: string | null; job_title: string | null
  photo_url: string | null; job_level: string | null; work_area: string | null
  seniority: string | null; company_industry: string | null
  enrichment_status: string | null; enriched_at: string | null; created_at: string | null
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const c = sb()

  // Skipped-this-session ids the client asks us to step over (bounded).
  const exclude = (req.nextUrl.searchParams.get('exclude') || '')
    .split(',').map(s => s.trim()).filter(s => UUID_RE.test(s)).slice(0, 300)

  // The true DB backlog (ignores per-session skips) + how many are already done.
  // Common cohort filters go AFTER .select() (supabase-js only exposes filter
  // methods on the builder that .select() returns).
  const { count: queueTotal } = await c.from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'quiz_v2').is('archived_at', null).not('email', 'is', null)
    .is('enrichment_verified_at', null).or(HAS_ENRICH)
  const { count: verifiedTotal } = await c.from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'quiz_v2').is('archived_at', null).not('email', 'is', null)
    .not('enrichment_verified_at', 'is', null)

  // No reassignment of the builder (that trips TS2589 on supabase-js): apply
  // the optional exclude filter inline on the same const builder.
  const rowsQ = c.from('submissions')
    .select('id, name, email, country, linkedin_url, company_name, job_title, photo_url, job_level, work_area, seniority, company_industry, enrichment_status, enriched_at, created_at')
    .eq('source', 'quiz_v2').is('archived_at', null).not('email', 'is', null)
    .is('enrichment_verified_at', null).or(HAS_ENRICH)
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
    current: {
      linkedinUrl: r.linkedin_url, companyName: r.company_name, jobTitle: r.job_title,
      country: r.country, seniority: r.seniority, industry: r.company_industry,
      photoUrl: r.photo_url, enrichmentStatus: r.enrichment_status, enrichedAt: r.enriched_at,
    },
  } : null

  return NextResponse.json({ record, stats: { queueTotal: queueTotal || 0, verifiedTotal: verifiedTotal || 0 } })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: string; action?: string; truth?: { linkedinUrl?: string; companyName?: string; jobTitle?: string; country?: string } }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id || !UUID_RE.test(body.id)) return NextResponse.json({ error: 'valid id required' }, { status: 400 })
  if (body.action !== 'confirm' && body.action !== 'correct') return NextResponse.json({ error: 'invalid action' }, { status: 400 })

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { enrichment_verified_at: now, enrichment_status: 'verified' }

  if (body.action === 'correct') {
    // Owner corrected the stored profile by hand. Write exactly what they gave
    // (no re-enrichment → no API spend), then stamp verified.
    const t = body.truth || {}
    const set = (col: string, v?: string) => { if (v) update[col] = v }
    set('linkedin_url', val(t.linkedinUrl))
    set('company_name', val(t.companyName))
    set('job_title', val(t.jobTitle))
    const country = normalizeCountry(val(t.country) || '')
    if (country) update.country = country
    // Need at least one corrected field, else this should have been a confirm.
    if (!update.linkedin_url && !update.company_name && !update.job_title && !update.country) {
      return NextResponse.json({ error: 'correction needs at least one field' }, { status: 400 })
    }
    update.enriched_at = now
  }

  const c = sb()
  const { error } = await c.from('submissions').update(update).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
