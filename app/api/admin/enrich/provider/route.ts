import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { apolloProvider } from '@/lib/enrichment/apollo'
import { wizaProvider } from '@/lib/enrichment/wiza'
import { apifyProfileProvider } from '@/lib/enrichment/apify-profile'
import { findLinkedInViaGoogle } from '@/lib/enrichment/google-linkedin-search'
import type { NormalizedPerson } from '@/lib/enrichment/types'

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

type ProviderName = 'apollo' | 'wiza' | 'apify_profile' | 'google'

/**
 * POST /api/admin/enrich/provider
 * Body: { id: string, provider: 'apollo'|'wiza'|'apify_profile'|'google' }
 *
 * Calls ONE provider only — no waterfall — and writes back any new data.
 * The goal of every provider here is the same: find a LinkedIn URL + the
 * profile photo. Everything else is bonus.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string; provider?: ProviderName }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  if (!body.id || !body.provider) return NextResponse.json({ error: 'id + provider required' }, { status: 400 })

  const c = client()
  const { data: row, error: fetchErr } = await c
    .from('submissions')
    .select('id, email, name, linkedin_url, company_name, job_title, country')
    .eq('id', body.id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    return NextResponse.json({ provider: body.provider, status: 'skipped_invalid_email' })
  }

  const ctx = {
    email: row.email,
    name: row.name || undefined,
    linkedinUrl: row.linkedin_url || undefined,
    companyName: row.company_name || undefined,
  }

  let result: NormalizedPerson | null = null
  let diag: Record<string, unknown> = {}

  try {
    switch (body.provider) {
      case 'apollo':        result = await apolloProvider.lookup(ctx); break
      case 'wiza':          result = await wizaProvider.lookup(ctx); break
      case 'apify_profile': result = await apifyProfileProvider.lookup(ctx); break
      case 'google': {
        // Google is special — finds a LinkedIn URL via SERP, not a full profile.
        const search = await findLinkedInViaGoogle({
          name: row.name || undefined,
          email: row.email,
          companyName: row.company_name || undefined,
          jobTitle: row.job_title || undefined,
          country: row.country || undefined,
        })
        diag = { triedQueries: search.triedQueries, organicSample: search.organicSample }
        if (search.linkedinUrl) {
          result = {
            source: 'apify',
            linkedinUrl: search.linkedinUrl,
            headline: search.title,
            raw: { google: search },
          }
        }
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ provider: body.provider, status: 'error', error: String(err) }, { status: 500 })
  }

  if (!result) {
    return NextResponse.json({ provider: body.provider, status: 'not_found', ...diag })
  }

  // Write ONLY non-empty fields, never blank an existing value.
  const update: Record<string, string | null> = {}
  const setIfNew = (col: string, current: string | null | undefined, fresh: string | undefined) => {
    if (fresh && fresh.trim() && !current) update[col] = fresh.trim()
  }
  setIfNew('linkedin_url',   row.linkedin_url, result.linkedinUrl)
  setIfNew('name',           row.name,         result.fullName || [result.firstName, result.lastName].filter(Boolean).join(' '))
  setIfNew('company_name',   row.company_name, result.companyName)
  // These columns don't have current values in `row`; always overwrite if fresh data
  if (result.photoUrl)         update.photo_url         = result.photoUrl
  if (result.jobTitle)         update.job_title         = result.jobTitle
  if (result.seniority)        update.seniority         = result.seniority
  if (result.function)         update.job_function      = result.function
  if (result.department)       update.department        = result.department
  if (result.companyDomain)    update.company_domain    = result.companyDomain
  if (result.companySize)      update.company_size      = result.companySize
  if (result.industry)         update.company_industry  = result.industry
  if (result.subIndustry)      update.company_sub_industry = result.subIndustry
  if (result.country)          update.country           = result.country
  if (result.region)           update.region            = result.region
  if (result.city)             update.city              = result.city

  if (Object.keys(update).length > 0) {
    await c.from('submissions').update(update).eq('id', row.id)
  }

  // Append the raw provider response into enrichment_raw jsonb (audit trail).
  try {
    const { data } = await c.from('submissions').select('enrichment_raw').eq('id', row.id).maybeSingle()
    const raw = ((data?.enrichment_raw as Record<string, unknown>) || {})
    raw[body.provider as string] = result.raw
    await c.from('submissions').update({ enrichment_raw: raw }).eq('id', row.id)
  } catch {
    // non-fatal — main update already succeeded
  }

  return NextResponse.json({
    provider: body.provider,
    status: result.linkedinUrl ? 'complete' : 'partial',
    linkedinUrl: result.linkedinUrl,
    photoUrl: result.photoUrl,
    name: result.fullName || [result.firstName, result.lastName].filter(Boolean).join(' '),
    jobTitle: result.jobTitle,
    companyName: result.companyName,
    fieldsUpdated: Object.keys(update),
    ...diag,
  })
}
