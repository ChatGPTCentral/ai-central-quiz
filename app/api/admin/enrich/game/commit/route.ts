// Supervised write-back: turn the owner's game verdicts into authoritative
// records. For each labeled round, take the FINAL SAY and write it onto the
// real submission, marking it human-verified:
//   - truth given (a correction): re-enrich from the corrected LinkedIn to
//     pull a full, correct profile, then overwrite.
//   - "new"/"both": the new pipeline's result is right → write it.
//   - "current": already correct in the DB → just stamp it verified.
//   - "neither" with no truth: leave the data, stamp it unresolved-supervised.
//
// Owner-initiated, batched (re-enriching corrections costs a little API).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { runV2 } from '@/lib/enrichment/pipeline-v2'
import { normalizeCountry, titleCase } from '@/lib/normalize'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const LINKEDIN_IN = /linkedin\.com\/in\//i
const val = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

interface Round {
  id: string; submission_id: string | null
  known: Record<string, string | null>
  current: Record<string, string | null>
  proposed: Record<string, string | null>
  truth: Record<string, string | null> | null
  choice: string | null
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { limit?: number }
  try { body = await req.json() } catch { body = {} }
  const limit = Math.min(8, Math.max(1, Number(body.limit) || 5))
  const c = sb()

  try {
    const { data: rows } = await c.from('enrich_game')
      .select('id, submission_id, known, current, proposed, truth, choice')
      .not('labeled_at', 'is', null).is('committed_at', null)
      .neq('choice', 'skip')
      .limit(limit)
    const todo = (rows || []) as Round[]
    const { count: remaining } = await c.from('enrich_game').select('*', { count: 'exact', head: true })
      .not('labeled_at', 'is', null).is('committed_at', null).neq('choice', 'skip')
    if (todo.length === 0) return NextResponse.json({ committed: 0, remaining: 0, finished: true })

    let committed = 0, verified = 0, unresolved = 0
    for (const r of todo) {
      const now = new Date().toISOString()
      const update: Record<string, unknown> = { enrichment_verified_at: now }
      const truth = r.truth || {}
      const truthLinkedin = val(truth.linkedinUrl)
      const hasTruthLinkedin = truthLinkedin && truthLinkedin.toUpperCase() !== 'N/A' && LINKEDIN_IN.test(truthLinkedin)

      const set = (col: string, v?: string) => { if (v) update[col] = v }

      if (hasTruthLinkedin) {
        // A correction with a LinkedIn → re-enrich from it for a full profile.
        try {
          const email = val(r.known?.email) || ''
          const v2 = await runV2({ email, name: val(r.known?.name), linkedinUrl: truthLinkedin, country: val(r.known?.country) }, { useCache: false })
          set('linkedin_url', truthLinkedin)
          set('company_name', val(truth.companyName) || val(v2.merged.companyName))
          set('job_title', val(truth.jobTitle) || val(v2.merged.jobTitle))
          set('country', normalizeCountry(v2.merged.country || r.known?.country || '') || undefined)
          set('seniority', v2.standardized?.seniority || val(v2.merged.seniority))
          if (v2.standardized?.jobTitleCanonical) set('job_title_standardized', v2.standardized.jobTitleCanonical)
          if (v2.merged.photoUrl) set('photo_url', v2.merged.photoUrl)
          if (v2.merged.industry) set('company_industry', titleCase(v2.merged.industry))
        } catch {
          set('linkedin_url', truthLinkedin); set('company_name', val(truth.companyName)); set('job_title', val(truth.jobTitle))
        }
        verified++
      } else if (val(truth.companyName) || val(truth.jobTitle)) {
        // Correction without a LinkedIn (e.g. found via a PDF / company page).
        set('company_name', val(truth.companyName)); set('job_title', val(truth.jobTitle))
        verified++
      } else if (r.choice === 'new' || r.choice === 'both') {
        const p = r.proposed || {}
        set('linkedin_url', val(p.linkedinUrl)); set('company_name', val(p.companyName)); set('job_title', val(p.jobTitle))
        set('country', normalizeCountry(val(p.country) || '') || undefined); set('seniority', val(p.seniority)); set('photo_url', val(p.photoUrl))
        verified++
      } else if (r.choice === 'current') {
        // Already correct in the DB — just stamp it verified.
        verified++
      } else {
        // neither, no truth → known-bad but unknown-correct. Flag, don't guess.
        update.enrichment_status = 'unresolved'
        unresolved++
      }

      if (r.submission_id) {
        if (Object.keys(update).length > 1 || r.choice === 'current') update.enriched_at = now
        if (update.linkedin_url || update.company_name || update.job_title) update.enrichment_status = 'verified'
        await c.from('submissions').update(update).eq('id', r.submission_id)
      }
      await c.from('enrich_game').update({ committed_at: now }).eq('id', r.id)
      committed++
    }

    return NextResponse.json({ committed, verified, unresolved, remaining: Math.max(0, (remaining || 0) - committed), finished: (remaining || 0) - committed <= 0 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
