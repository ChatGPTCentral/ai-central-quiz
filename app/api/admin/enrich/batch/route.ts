import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { runV2 } from '@/lib/enrichment/pipeline-v2'

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
    .select('id, email, name, linkedin_url, company_name, job_title, country')
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
      // Force-run v2 pipeline for every batch row (bypasses cache so we get fresh data)
      const enr = await runV2({
        email: row.email,
        name: row.name || undefined,
        linkedinUrl: row.linkedin_url || undefined,
        companyName: row.company_name || undefined,
        jobTitle: row.job_title || undefined,
        country: row.country || undefined,
      }, { useCache: false })

      const update: Record<string, unknown> = {
        enrichment: enr.merged,
        enrichment_status: enr.status,
      }
      if (enr.merged.linkedinUrl)        update.linkedin_url         = enr.merged.linkedinUrl
      if (enr.merged.photoUrl)           update.photo_url            = enr.merged.photoUrl
      if (enr.merged.jobTitle)           update.job_title            = enr.merged.jobTitle
      if (enr.standardized?.seniority)   update.seniority            = enr.standardized.seniority
      else if (enr.merged.seniority)     update.seniority            = enr.merged.seniority
      if (enr.merged.function)           update.job_function         = enr.merged.function
      if (enr.merged.department)         update.department           = enr.merged.department
      if (enr.merged.companyName)        update.company_name         = enr.merged.companyName
      if (enr.merged.companyDomain)      update.company_domain       = enr.merged.companyDomain
      if (enr.merged.companyLinkedinUrl) update.company_linkedin_url = enr.merged.companyLinkedinUrl
      if (enr.merged.companyWebsite)     update.company_website      = enr.merged.companyWebsite
      if (enr.merged.companySize)        update.company_size         = enr.merged.companySize
      if (enr.merged.industry)           update.company_industry     = enr.merged.industry
      if (enr.merged.subIndustry)        update.company_sub_industry = enr.merged.subIndustry
      if (enr.merged.country)            update.country              = enr.merged.country
      if (enr.merged.region)             update.region               = enr.merged.region
      if (enr.merged.city)               update.city                 = enr.merged.city
      if (enr.aiDemographics?.ageBracket && enr.aiDemographics.ageBracket !== 'uncertain') update.age_ai_estimate = enr.aiDemographics.ageBracket
      if (enr.aiDemographics?.sexPresentation && enr.aiDemographics.sexPresentation !== 'uncertain') update.sex_ai_estimate = enr.aiDemographics.sexPresentation
      if (enr.aiDemographics?.confidence) update.ai_estimate_confidence = enr.aiDemographics.confidence

      await c.from('submissions').update(update).eq('id', row.id)

      results.push({
        email: row.email,
        status: enr.status,
        linkedinUrl: enr.merged.linkedinUrl,
        providersTried: enr.providersTried,
        fromCache: enr.fromCache || false,
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
