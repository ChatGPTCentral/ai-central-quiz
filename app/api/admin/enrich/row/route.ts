import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { runRowEnrichment } from '@/lib/enrichment/row-waterfall'

export const maxDuration = 120

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
 * POST /api/admin/enrich/row
 * Body: { id: string }
 *
 * Reads whatever signals are already on the row (email, name, linkedin_url,
 * company_name) and runs the row-level "sudoku" waterfall — Apify Profile,
 * Wiza, Apollo. Writes the merged result back to the row.
 *
 * Goal: replace placeholder image with real face + fill all fields possible.
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
    .select('id, email, name, linkedin_url, company_name, enrichment_status')
    .eq('id', body.id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    return NextResponse.json({ status: 'skipped_invalid_email' })
  }

  try {
    const enr = await runRowEnrichment({
      email: row.email,
      name: row.name || undefined,
      linkedinUrl: row.linkedin_url || undefined,
      companyName: row.company_name || undefined,
    })

    await c.from('submissions').update({
      // Always prefer fresh enrichment data (this is a manual admin trigger)
      linkedin_url: enr.merged.linkedinUrl || row.linkedin_url || null,
      photo_url: enr.merged.photoUrl || null,
      job_title: enr.merged.jobTitle || null,
      seniority: enr.merged.seniority || null,
      job_function: enr.merged.function || null,
      department: enr.merged.department || null,
      company_name: enr.merged.companyName || row.company_name || null,
      company_domain: enr.merged.companyDomain || null,
      company_size: enr.merged.companySize || null,
      company_industry: enr.merged.industry || null,
      company_sub_industry: enr.merged.subIndustry || null,
      country: enr.merged.country || null,
      region: enr.merged.region || null,
      city: enr.merged.city || null,
      // Promote the discovered name into the row's name column if we didn't already have one
      name: row.name || enr.merged.fullName || null,
      enrichment: enr.merged,
      enrichment_raw: enr.raw,
      enrichment_status: enr.status,
    }).eq('id', row.id)

    return NextResponse.json({
      id: row.id,
      email: row.email,
      status: enr.status,
      strategy: enr.strategy,
      providersTried: enr.providersTried,
      linkedinUrl: enr.merged.linkedinUrl,
      photoUrl: enr.merged.photoUrl,
      jobTitle: enr.merged.jobTitle,
      companyName: enr.merged.companyName,
    })
  } catch (err) {
    console.error('row enrichment failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
