import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { scrapeLinkedInProfile } from '@/lib/enrichment/linkedin-scrape'
import { apolloProvider } from '@/lib/enrichment/apollo'
import { estimateDemographicsFromPhoto } from '@/lib/enrichment/photo-demographics'
import { cleanPhoto, isPlaceholderPhoto } from '@/lib/enrichment/photo-filter'

export const maxDuration = 180

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/admin/enrich/v2/field
 *
 * Surgical field-level enrichment — runs ONLY the minimum API calls needed
 * for the requested fields, instead of the whole pipeline. Use this when you
 * just need to fill in a missing photo or demographic estimate without
 * paying for the full Google + Apify + Apollo + Wiza chain.
 *
 * Body: { id: string, fields: ('photo' | 'demographics')[] }
 *
 * Cost map:
 *   'photo'        → 1× Apify profile scrape (≈ $0.004) OR 1× Apollo match
 *   'demographics' → 1× Claude Sonnet vision call (≈ $0.005) — fills BOTH
 *                    age_ai_estimate AND sex_ai_estimate in one shot
 *
 * Returns: { updated: string[], skipped: { field, reason }[] }
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string; fields?: ('photo' | 'demographics')[] }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!body.fields?.length) return NextResponse.json({ error: 'fields required' }, { status: 400 })

  const c = client()
  const result = await enrichRowFields(c, body.id, body.fields)
  return NextResponse.json(result)
}

export interface FieldEnrichResult {
  rowId: string
  updated: string[]
  skipped: { field: string; reason: string }[]
  cost: { apify: number; apollo: number; claude: number }
}

/**
 * Pure helper — used by both the single-row endpoint AND the batch endpoint
 * so the logic stays identical.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enrichRowFields(c: any, id: string, fields: ('photo' | 'demographics')[]): Promise<FieldEnrichResult> {
  const { data: row, error } = await c
    .from('submissions')
    .select('id, email, name, linkedin_url, photo_url, age_ai_estimate, sex_ai_estimate')
    .eq('id', id)
    .maybeSingle()

  if (error) return { rowId: id, updated: [], skipped: [{ field: 'row', reason: error.message }], cost: { apify: 0, apollo: 0, claude: 0 } }
  if (!row) return { rowId: id, updated: [], skipped: [{ field: 'row', reason: 'not found' }], cost: { apify: 0, apollo: 0, claude: 0 } }

  const update: Record<string, unknown> = {}
  const updated: string[] = []
  const skipped: { field: string; reason: string }[] = []
  const cost = { apify: 0, apollo: 0, claude: 0 }
  let currentPhotoUrl: string | null = row.photo_url

  // ── PHOTO ────────────────────────────────────────────────────────
  // Skip if a real (non-placeholder) photo already exists.
  if (fields.includes('photo')) {
    const hasReal = currentPhotoUrl && !isPlaceholderPhoto(currentPhotoUrl)
    if (hasReal) {
      skipped.push({ field: 'photo', reason: 'already has a real photo' })
    } else if (row.linkedin_url) {
      // Cheapest path: Apify profile scrape (one call)
      try {
        cost.apify++
        const profile = await scrapeLinkedInProfile(row.linkedin_url)
        const fresh = cleanPhoto(profile?.photoUrl)
        if (fresh) {
          update.photo_url = fresh
          updated.push('photo')
          currentPhotoUrl = fresh
        } else {
          // Apify miss — fall back to Apollo
          cost.apollo++
          const a = await apolloProvider.lookup({ email: row.email, linkedinUrl: row.linkedin_url, name: row.name })
          const fresh2 = cleanPhoto(a?.photoUrl)
          if (fresh2) {
            update.photo_url = fresh2
            updated.push('photo')
            currentPhotoUrl = fresh2
          } else {
            skipped.push({ field: 'photo', reason: 'Apify + Apollo returned no real photo' })
          }
        }
      } catch (err) {
        skipped.push({ field: 'photo', reason: String(err) })
      }
    } else {
      // No linkedin URL — try Apollo by email only
      try {
        cost.apollo++
        const a = await apolloProvider.lookup({ email: row.email, name: row.name })
        const fresh = cleanPhoto(a?.photoUrl)
        if (fresh) {
          update.photo_url = fresh
          updated.push('photo')
          currentPhotoUrl = fresh
        } else {
          skipped.push({ field: 'photo', reason: 'no linkedin_url and Apollo returned no photo' })
        }
      } catch (err) {
        skipped.push({ field: 'photo', reason: String(err) })
      }
    }
  }

  // ── DEMOGRAPHICS (age + sex via Claude vision, one call → two values) ──
  if (fields.includes('demographics')) {
    if (!currentPhotoUrl || isPlaceholderPhoto(currentPhotoUrl)) {
      skipped.push({ field: 'demographics', reason: 'no real photo available — enrich photo first' })
    } else if (!process.env.ANTHROPIC_API_KEY) {
      skipped.push({ field: 'demographics', reason: 'ANTHROPIC_API_KEY not set' })
    } else {
      try {
        cost.claude++
        const d = await estimateDemographicsFromPhoto(currentPhotoUrl)
        if (d.error) {
          skipped.push({ field: 'demographics', reason: d.error })
        } else {
          if (d.ageBracket && d.ageBracket !== 'uncertain') {
            update.age_ai_estimate = d.ageBracket
            updated.push('age')
          } else {
            skipped.push({ field: 'age', reason: 'Claude returned uncertain' })
          }
          if (d.sexPresentation && d.sexPresentation !== 'uncertain') {
            update.sex_ai_estimate = d.sexPresentation
            updated.push('sex')
          } else {
            skipped.push({ field: 'sex', reason: 'Claude returned uncertain' })
          }
          if (d.confidence) update.ai_estimate_confidence = d.confidence
        }
      } catch (err) {
        skipped.push({ field: 'demographics', reason: String(err) })
      }
    }
  }

  if (Object.keys(update).length > 0) {
    const { error: upErr } = await c.from('submissions').update(update).eq('id', id)
    if (upErr) return { rowId: id, updated: [], skipped: [{ field: 'save', reason: upErr.message }], cost }
  }

  return { rowId: id, updated, skipped, cost }
}
