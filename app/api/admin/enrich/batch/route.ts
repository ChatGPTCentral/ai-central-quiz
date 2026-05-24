import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { runEnrichment } from '@/lib/enrichment/waterfall'

export const maxDuration = 300 // Vercel — give us 5 min

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

interface BatchResult {
  email: string
  status: string
  linkedinUrl?: string
  providersTried: string[]
  fromCache: boolean
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let limit = 25
  try {
    const body = await req.json()
    if (typeof body.limit === 'number') limit = Math.max(1, Math.min(100, body.limit))
  } catch { /* default */ }

  const c = client()
  const { data, error } = await c
    .from('submissions')
    .select('id, email, enrichment_status')
    .is('linkedin_url', null)
    .neq('enrichment_status', 'failed')
    .order('ts', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: BatchResult[] = []
  for (const row of (data || [])) {
    if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      results.push({ email: row.email || '(none)', status: 'skipped_invalid_email', providersTried: [], fromCache: false })
      continue
    }
    try {
      const enr = await runEnrichment(row.email, { includeSlow: true })
      // Update the submission row
      await c.from('submissions').update({
        linkedin_url: enr.merged.linkedinUrl || null,
        photo_url: enr.merged.photoUrl || null,
        job_title: enr.merged.jobTitle || null,
        seniority: enr.merged.seniority || null,
        job_function: enr.merged.function || null,
        department: enr.merged.department || null,
        company_name: enr.merged.companyName || null,
        company_domain: enr.merged.companyDomain || null,
        company_size: enr.merged.companySize || null,
        company_industry: enr.merged.industry || null,
        company_sub_industry: enr.merged.subIndustry || null,
        country: enr.merged.country || null,
        region: enr.merged.region || null,
        city: enr.merged.city || null,
        enrichment: enr.merged,
        enrichment_raw: enr.raw,
        enrichment_status: enr.status,
      }).eq('id', row.id)
      results.push({
        email: row.email,
        status: enr.status,
        linkedinUrl: enr.merged.linkedinUrl,
        providersTried: enr.providersTried,
        fromCache: enr.fromCache,
      })
      // Small pause to respect provider rate limits
      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      results.push({ email: row.email, status: 'error', providersTried: [], fromCache: false })
      console.error('enrich row failed:', err)
    }
  }

  const summary = {
    processed: results.length,
    succeeded: results.filter(r => r.status === 'complete').length,
    partial: results.filter(r => r.status === 'partial').length,
    failed: results.filter(r => r.status === 'failed' || r.status === 'error').length,
    cached: results.filter(r => r.fromCache).length,
  }
  return NextResponse.json({ summary, results })
}
