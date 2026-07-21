// Run BOTH enrichers fresh for one record, on demand, so the verify screen can
// show two live options side by side:
//   Enricher 1 · Apollo      — by-email people/match (1 Apollo credit)
//   Enricher 2 · Google+Apify — verified resolver (search → LLM match), then a
//                               LinkedIn scrape for a photo + confirmed profile
// The verified resolver is fed the owner's already-verified colleagues at the
// same email domain as few-shot ground truth, so it self-reinforces.
//
// Owner-gated spend: one Apollo credit per call. The client only calls this
// when the owner opens a record, so spend tracks how many they work through.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { apolloProvider } from '@/lib/enrichment/apollo'
import { resolveIdentityViaGoogle, type VerifiedExample } from '@/lib/enrichment/google-resolver'
import { scrapeLinkedInProfile } from '@/lib/enrichment/linkedin-scrape'
import { normalizeCountry } from '@/lib/normalize'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FREE_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'aol.com', 'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'qq.com', '163.com'])

interface Candidate {
  source: 'apollo' | 'verified'
  found: boolean
  linkedinUrl?: string | null
  companyName?: string | null
  jobTitle?: string | null
  country?: string | null
  seniority?: string | null
  industry?: string | null
  photoUrl?: string | null
  confidence?: number | null
  reasoning?: string | null
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id || !UUID_RE.test(body.id)) return NextResponse.json({ error: 'valid id required' }, { status: 400 })

  const c = sb()
  const { data: row, error } = await c.from('submissions')
    .select('id, name, email, country, job_level, work_area')
    .eq('id', body.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'record not found' }, { status: 404 })

  const email = (row.email || '').trim().toLowerCase()
  const name = row.name || undefined
  const domain = email.includes('@') ? email.split('@')[1] : ''

  // Weekly-tuned accept threshold (falls back to the resolver default on any miss).
  let acceptThreshold: number | undefined
  try {
    const { data: cfg } = await c.from('resolver_config').select('accept_threshold').eq('id', 1).maybeSingle()
    const t = cfg?.accept_threshold != null ? Number(cfg.accept_threshold) : NaN
    if (t > 0 && t < 1) acceptThreshold = t
  } catch { /* default stands */ }

  // Fetch owner-verified colleagues at the same WORK domain as few-shot.
  let verifiedExamples: VerifiedExample[] = []
  if (domain && !FREE_DOMAINS.has(domain)) {
    const { data: ex } = await c.from('verified_identities')
      .select('name, email, linkedin_url, company_name, job_title')
      .eq('email_domain', domain).neq('submission_id', body.id).limit(6)
    verifiedExamples = (ex || []).map(e => ({
      name: e.name || undefined, email: e.email || undefined, linkedinUrl: e.linkedin_url || undefined,
      companyName: e.company_name || undefined, jobTitle: e.job_title || undefined,
    }))
  }

  // Run both enrichers concurrently. Each is independently fail-open.
  const [apollo, verified] = await Promise.all([
    // Enricher 1 · Apollo (1 credit)
    (async (): Promise<Candidate> => {
      try {
        const p = await apolloProvider.lookup({ email, name })
        if (!p) return { source: 'apollo', found: false }
        return {
          source: 'apollo', found: !!(p.linkedinUrl || p.companyName || p.jobTitle),
          linkedinUrl: p.linkedinUrl, companyName: p.companyName, jobTitle: p.jobTitle,
          country: normalizeCountry(p.country || '') || p.country || null,
          seniority: p.seniority, industry: p.industry, photoUrl: p.photoUrl,
        }
      } catch (e) { return { source: 'apollo', found: false, reasoning: String(e).slice(0, 160) } }
    })(),
    // Enricher 2 · Google + Apify verified resolver, then scrape for photo/profile
    (async (): Promise<Candidate> => {
      try {
        const r = await resolveIdentityViaGoogle({
          name, email, country: row.country || undefined,
          jobLevel: row.job_level || undefined, workArea: row.work_area || undefined,
          verifiedExamples, acceptThreshold,
        })
        const cand: Candidate = {
          source: 'verified', found: !!r.linkedinUrl,
          linkedinUrl: r.linkedinUrl, companyName: r.companyName, jobTitle: r.jobTitle,
          country: normalizeCountry(r.country || '') || r.country || null,
          confidence: r.confidence ?? null, reasoning: r.reasoning || r.outcome || null,
        }
        if (r.linkedinUrl) {
          try {
            const s = await scrapeLinkedInProfile(r.linkedinUrl)
            if (s) {
              cand.companyName = cand.companyName || s.companyName
              cand.jobTitle = cand.jobTitle || s.jobTitle
              cand.seniority = s.seniority
              cand.industry = s.industry
              cand.photoUrl = s.photoUrl
              cand.country = cand.country || normalizeCountry(s.country || '') || s.country || null
            }
          } catch { /* scrape is best-effort; the resolver result already stands */ }
        }
        return cand
      } catch (e) { return { source: 'verified', found: false, reasoning: String(e).slice(0, 160) } }
    })(),
  ])

  return NextResponse.json({ apollo, verified })
}
