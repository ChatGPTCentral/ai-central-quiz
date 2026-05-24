import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { runV2 } from '@/lib/enrichment/pipeline-v2'

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
 * POST /api/admin/enrich/v2/row
 *
 * Body: { id?: string, email?: string, save?: boolean }
 *
 * Runs the v2 pipeline. If `id` is provided, reads existing signals from
 * the row first. If `save: true`, writes the merged result back to the row.
 *
 * Returns the full V2Result so the UI can render stage-by-stage diagnostics.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string; email?: string; save?: boolean }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  if (!body.id && !body.email) {
    return NextResponse.json({ error: 'id or email required' }, { status: 400 })
  }

  const c = client()

  // If id provided, hydrate from the row
  let rowId: string | null = null
  let input = { email: body.email || '', name: undefined as string | undefined, linkedinUrl: undefined as string | undefined, companyName: undefined as string | undefined, jobTitle: undefined as string | undefined, country: undefined as string | undefined }
  if (body.id) {
    const { data: row, error } = await c
      .from('submissions')
      .select('id, email, name, linkedin_url, company_name, job_title, country')
      .eq('id', body.id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    rowId = row.id
    input = {
      email: row.email,
      name: row.name || undefined,
      linkedinUrl: row.linkedin_url || undefined,
      companyName: row.company_name || undefined,
      jobTitle: row.job_title || undefined,
      country: row.country || undefined,
    }
  } else if (body.email) {
    // Try to find an existing row by email for context (helpful in Lab page)
    const { data: row } = await c
      .from('submissions')
      .select('id, email, name, linkedin_url, company_name, job_title, country')
      .ilike('email', body.email.trim().toLowerCase())
      .order('ts', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (row) {
      rowId = row.id
      input = {
        email: row.email,
        name: row.name || undefined,
        linkedinUrl: row.linkedin_url || undefined,
        companyName: row.company_name || undefined,
        jobTitle: row.job_title || undefined,
        country: row.country || undefined,
      }
    } else {
      input.email = body.email.trim().toLowerCase()
    }
  }

  if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const v2 = await runV2(input)

  // Save back if requested AND we have a row id
  let saved = false
  let saveError: string | null = null
  const fieldsUpdated: string[] = []
  if (body.save && rowId) {
    const update: Record<string, unknown> = {}
    // For row enrichment we WANT to overwrite empty fields aggressively — that
    // was the user's complaint ("nothing got written"). Rule: overwrite when
    // the incoming value is non-empty AND the existing value is empty/missing.
    const setIfNew = (col: string, current: string | undefined | null, fresh: string | undefined) => {
      if (!fresh || !fresh.trim()) return
      if (current && current.trim()) return
      update[col] = fresh.trim()
    }
    setIfNew('name',            input.name,         v2.merged.fullName)
    setIfNew('linkedin_url',    input.linkedinUrl,  v2.merged.linkedinUrl)
    setIfNew('company_name',    input.companyName,  v2.merged.companyName)
    setIfNew('job_title',       input.jobTitle,     v2.merged.jobTitle)
    setIfNew('country',         input.country,      v2.merged.country)
    // Photo URL always overwrites — the whole point of v2 is replacing placeholders.
    if (v2.merged.photoUrl)        update.photo_url           = v2.merged.photoUrl
    if (v2.merged.seniority)       update.seniority           = v2.merged.seniority
    if (v2.merged.region)          update.region              = v2.merged.region
    if (v2.merged.city)            update.city                = v2.merged.city
    if (v2.merged.companyDomain)   update.company_domain      = v2.merged.companyDomain
    if (v2.merged.companySize)     update.company_size        = v2.merged.companySize
    if (v2.merged.industry)        update.company_industry    = v2.merged.industry
    if (v2.merged.subIndustry)     update.company_sub_industry = v2.merged.subIndustry
    if (v2.merged.function)        update.job_function        = v2.merged.function
    if (v2.merged.department)      update.department          = v2.merged.department

    // Audit trail — jsonb merge of v2 raw under the 'v2' key
    try {
      const { data } = await c.from('submissions').select('enrichment_raw').eq('id', rowId).maybeSingle()
      const existingRaw = (data?.enrichment_raw as Record<string, unknown>) || {}
      update.enrichment_raw = { ...existingRaw, v2: v2.raw }
    } catch { /* non-fatal */ }

    if (Object.keys(update).length > 0) {
      const { error } = await c.from('submissions').update(update).eq('id', rowId)
      if (error) {
        saveError = error.message
        console.error('v2 save failed for row', rowId, error)
      } else {
        saved = true
        fieldsUpdated.push(...Object.keys(update))
      }
    }
  }

  return NextResponse.json({ ...v2, rowId, saved, saveError, fieldsUpdated })
}
