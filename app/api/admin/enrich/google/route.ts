import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { findLinkedInViaGoogle } from '@/lib/enrichment/google-linkedin-search'
import { runRowEnrichment } from '@/lib/enrichment/row-waterfall'

export const maxDuration = 180

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/admin/enrich/google
 * Body: { id: string }
 *
 * 1. Read what's known about the row (name, email, company).
 * 2. Run Google search via Apify, extract first linkedin.com/in/<slug>.
 * 3. If found, write linkedin_url to the row.
 * 4. Run the full row enrichment with the newly-known LinkedIn URL —
 *    Apify-profile + Wiza + Apollo in parallel — to fill name, photo, etc.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const c = client()
  const { data: row, error: fetchErr } = await c
    .from('submissions')
    .select('id, email, name, linkedin_url, company_name')
    .eq('id', body.id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (row.linkedin_url) {
    // Already has one — go straight to the multi-provider row enrichment.
    const enr = await runRowEnrichment({
      email: row.email, name: row.name || undefined,
      linkedinUrl: row.linkedin_url, companyName: row.company_name || undefined,
    })
    await applyEnrichmentToRow(c, row.id, row.linkedin_url, enr)
    return NextResponse.json({
      id: row.id,
      step: 'enrichment_only',
      message: 'Row already had a LinkedIn URL — ran enrichment to refresh fields.',
      linkedinUrl: row.linkedin_url,
      photoUrl: enr.merged.photoUrl,
      status: enr.status,
      providersTried: enr.providersTried,
    })
  }

  // 1. Google search
  const search = await findLinkedInViaGoogle({
    name: row.name || undefined,
    email: row.email,
    companyName: row.company_name || undefined,
  })

  if (!search.linkedinUrl) {
    return NextResponse.json({
      id: row.id,
      step: 'google',
      status: 'no_linkedin_found',
      triedQueries: search.triedQueries,
      organicSample: search.organicSample,
    })
  }

  // 2. Save the LinkedIn URL right away (in case the next step fails)
  await c.from('submissions').update({ linkedin_url: search.linkedinUrl }).eq('id', row.id)

  // 3. Run row enrichment with the newly-discovered LinkedIn URL
  const enr = await runRowEnrichment({
    email: row.email,
    name: row.name || undefined,
    linkedinUrl: search.linkedinUrl,
    companyName: row.company_name || undefined,
  })
  await applyEnrichmentToRow(c, row.id, search.linkedinUrl, enr)

  return NextResponse.json({
    id: row.id,
    step: 'google_then_enrichment',
    foundQuery: search.query,
    linkedinUrl: search.linkedinUrl,
    photoUrl: enr.merged.photoUrl,
    jobTitle: enr.merged.jobTitle,
    companyName: enr.merged.companyName,
    status: enr.status,
    providersTried: enr.providersTried,
    triedQueries: search.triedQueries,
  })
}

async function applyEnrichmentToRow(
  c: ReturnType<typeof client>,
  id: string,
  fallbackLinkedinUrl: string,
  enr: Awaited<ReturnType<typeof runRowEnrichment>>,
) {
  await c.from('submissions').update({
    linkedin_url: enr.merged.linkedinUrl || fallbackLinkedinUrl || null,
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
    name: enr.merged.fullName || null,
    enrichment: enr.merged,
    enrichment_raw: enr.raw,
    enrichment_status: enr.status,
  }).eq('id', id)
}
