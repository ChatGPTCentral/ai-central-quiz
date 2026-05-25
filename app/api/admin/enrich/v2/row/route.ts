import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { runV2 } from '@/lib/enrichment/pipeline-v2'
import { isPlaceholderPhoto } from '@/lib/enrichment/photo-filter'
import { titleCase, normalizeCountry } from '@/lib/normalize'

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
  let currentPhotoUrl: string | null = null
  let input = { email: body.email || '', name: undefined as string | undefined, linkedinUrl: undefined as string | undefined, companyName: undefined as string | undefined, jobTitle: undefined as string | undefined, country: undefined as string | undefined }
  if (body.id) {
    const { data: row, error } = await c
      .from('submissions')
      .select('id, email, name, linkedin_url, company_name, job_title, country, photo_url')
      .eq('id', body.id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    rowId = row.id
    currentPhotoUrl = row.photo_url
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
      .select('id, email, name, linkedin_url, company_name, job_title, country, photo_url')
      .ilike('email', body.email.trim().toLowerCase())
      .order('ts', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (row) {
      rowId = row.id
      currentPhotoUrl = row.photo_url
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

  // body.force === true bypasses the 60-day enrichment_cache so the user can
  // explicitly re-run all the paid actors on a row.
  const force = (body as { force?: boolean }).force === true
  const v2 = await runV2(input, { useCache: !force })

  // Save back if requested AND we have a row id.
  // SPLIT the save into two passes so audit-trail jsonb bloat can NEVER block
  // the user-facing data update.
  let saved = false
  let saveError: string | null = null
  let auditError: string | null = null
  const fieldsUpdated: string[] = []

  if (body.save && rowId) {
    // ── Pass 1: scalar/user-facing fields ───────────────────────────
    const update: Record<string, unknown> = {}
    // `force` runs OVERWRITE existing values — the user explicitly asked for a fresh enrichment.
    const setIfNew = (col: string, current: string | undefined | null, fresh: string | undefined) => {
      if (!fresh || !fresh.trim()) return
      if (!force && current && current.trim()) return
      update[col] = fresh.trim()
    }
    setIfNew('name',            input.name,         v2.merged.fullName)
    setIfNew('linkedin_url',    input.linkedinUrl,  v2.merged.linkedinUrl)
    setIfNew('company_name',    input.companyName,  v2.merged.companyName)
    setIfNew('job_title',       input.jobTitle,     v2.merged.jobTitle)
    setIfNew('country',         input.country,      normalizeCountry(v2.merged.country))
    // Photo handling — placeholder LinkedIn avatars never win.
    // 1) If pipeline returned a real photo → save it (always overwrites)
    // 2) Else if the current DB photo is a placeholder → null it out so the UI
    //    falls back to the initial-letter avatar instead of showing a ghost
    if (v2.merged.photoUrl) {
      update.photo_url = v2.merged.photoUrl
    } else if (currentPhotoUrl && isPlaceholderPhoto(currentPhotoUrl)) {
      update.photo_url = null
    }
    if (v2.merged.region)          update.region               = v2.merged.region
    if (v2.merged.city)            update.city                 = v2.merged.city
    if (v2.merged.companyDomain)       update.company_domain       = v2.merged.companyDomain
    if (v2.merged.companyLinkedinUrl)  update.company_linkedin_url = v2.merged.companyLinkedinUrl
    if (v2.merged.companyWebsite)      update.company_website      = v2.merged.companyWebsite
    if (v2.merged.companySize) {
      // Bracket into canonical employee-count buckets before persisting
      const { bracketCompanySize } = await import('@/lib/enrichment/standardize')
      const bracket = bracketCompanySize(v2.merged.companySize)
      update.company_size = bracket || v2.merged.companySize
    }
    if (v2.merged.industry)            update.company_industry     = titleCase(v2.merged.industry)
    if (v2.merged.subIndustry)         update.company_sub_industry = titleCase(v2.merged.subIndustry)
    if (v2.merged.function)        update.job_function         = v2.merged.function
    if (v2.merged.department)      update.department           = v2.merged.department

    // Standardized seniority — maps to the survey enum so dashboards segment cleanly.
    // Prefer the bucketed value over the raw one (e.g. "vp" or "Vice President" → "VP/Director").
    if (v2.standardized?.seniority) {
      update.seniority = v2.standardized.seniority
    } else if (v2.merged.seniority) {
      update.seniority = v2.merged.seniority
    }
    // Standardized job title (canonical form from gpriday/job-titles classifier)
    if (v2.standardized?.jobTitleCanonical) {
      update.job_title_standardized = v2.standardized.jobTitleCanonical
    }

    // Stage 6 AI vision results — write only when Claude returned a non-uncertain estimate
    if (v2.aiDemographics?.ageBracket && v2.aiDemographics.ageBracket !== 'uncertain') {
      update.age_ai_estimate = v2.aiDemographics.ageBracket
    }
    if (v2.aiDemographics?.sexPresentation && v2.aiDemographics.sexPresentation !== 'uncertain') {
      update.sex_ai_estimate = v2.aiDemographics.sexPresentation
    }
    if (v2.aiDemographics?.confidence) {
      update.ai_estimate_confidence = v2.aiDemographics.confidence
    }

    // Stamp the enrichment status + timestamp so the UI can tell at a glance
    // which rows have already been processed (avoid wasteful re-runs).
    update.enrichment_status = v2.status
    update.enriched_at = new Date().toISOString()

    console.log(`[v2 save] row=${rowId} updating columns:`, Object.keys(update))

    if (Object.keys(update).length > 0) {
      const { error, data } = await c.from('submissions').update(update).eq('id', rowId).select('id')
      if (error) {
        saveError = error.message
        console.error(`[v2 save] row=${rowId} ERROR:`, error)
      } else if (!data || data.length === 0) {
        saveError = 'Update affected 0 rows — row id may not exist or RLS blocked it'
        console.error(`[v2 save] row=${rowId} affected 0 rows`)
      } else {
        saved = true
        fieldsUpdated.push(...Object.keys(update))
        console.log(`[v2 save] row=${rowId} OK, ${fieldsUpdated.length} columns written`)
      }
    } else {
      console.log(`[v2 save] row=${rowId} NOTHING to update — all fields already populated or v2 returned empty`)
    }

    // ── Pass 2: audit trail (separate, won't block the main save) ───
    try {
      const { data } = await c.from('submissions').select('enrichment_raw').eq('id', rowId).maybeSingle()
      const existingRaw = (data?.enrichment_raw as Record<string, unknown>) || {}
      const newRaw = { ...existingRaw, v2: v2.raw }
      const { error: auditErr } = await c.from('submissions').update({ enrichment_raw: newRaw }).eq('id', rowId)
      if (auditErr) auditError = auditErr.message
    } catch (err) {
      auditError = String(err)
    }
  }

  // Verify what's actually persisted in the DB after the save — surfaces any
  // case where we returned saved=true but the DB still shows old values.
  let persisted: Record<string, unknown> | null = null
  if (rowId && saved) {
    const { data: verified } = await c
      .from('submissions')
      .select('linkedin_url, photo_url, job_title, seniority, company_name, company_linkedin_url, company_website, company_industry, company_size, country, city, region')
      .eq('id', rowId)
      .maybeSingle()
    persisted = verified
  }

  return NextResponse.json({ ...v2, rowId, saved, saveError, auditError, fieldsUpdated, persisted })
}
