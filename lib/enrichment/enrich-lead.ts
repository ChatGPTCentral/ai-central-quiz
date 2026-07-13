// Background lead enrichment + admin notification.
//
// Runs the SAME v2 pipeline the admin "Run agent" button uses (runV2 —
// Apollo, Wiza, Apify LinkedIn scraper, standardization, photo AI
// demographics, Beehiiv + Stripe extras), writes the results back onto the
// submission row, re-classifies stage/persona, then sends the new-lead
// notification email from the freshly enriched row.
//
// Called from the submit route via waitUntil() so the quiz taker is never
// blocked on the (30-90s) Apify actor, and from the admin resend route.
//
// Column mapping mirrors app/api/admin/enrich/v2/row/route.ts so the email
// and the admin agent stay in lock-step.

import { createClient } from '@supabase/supabase-js'
import { runV2 } from './pipeline-v2'
import { isPlaceholderPhoto } from './photo-filter'
import { bracketCompanySize } from './standardize'
import { titleCase, normalizeCountry } from '../normalize'
import { assignSegmentationV2 } from '../segmentation-v2'
import { fromRow, type DbRow } from '../kv'
import { sendSubmitNotification, type SubmissionRow } from '../email'

// Enrichment scope for automatic (on-submit) runs. Flip to true to skip the
// pricier Wiza reverse-lookup credits per lead; false = full parity with the
// admin agent.
export const AUTO_ENRICH_SKIP_WIZA = false

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export interface EnrichLeadOptions {
  /** Re-run the enrichment pipeline before sending (default true). When
   *  false, just re-read the row and re-send the notification as-is. */
  reEnrich?: boolean
  /** Overwrite existing enriched values (default false — only fill gaps). */
  force?: boolean
  /** Skip the Wiza reverse-lookup stage (defaults to AUTO_ENRICH_SKIP_WIZA). */
  skipWiza?: boolean
  /** Sender base URL for the result/admin links in the email. */
  siteUrl?: string
}

/**
 * Enrich a submission row and send (or resend) the new-lead notification.
 * Best-effort: any enrichment failure still results in the email being sent
 * with whatever data the row already has.
 */
export async function enrichLeadAndNotify(
  rowId: string,
  opts: EnrichLeadOptions = {},
): Promise<{ enriched: boolean; status?: string; fieldsUpdated: string[]; emailed: boolean }> {
  const reEnrich = opts.reEnrich !== false
  const force = opts.force === true
  const skipWiza = opts.skipWiza ?? AUTO_ENRICH_SKIP_WIZA
  const siteUrl = opts.siteUrl ?? process.env.NEXT_PUBLIC_SITE_URL

  const c = sb()
  const fieldsUpdated: string[] = []
  let enriched = false
  let status: string | undefined

  // Hydrate whatever context we already have.
  const { data: row } = await c
    .from('submissions')
    .select('id, email, name, linkedin_url, company_name, job_title, country, photo_url, job_level, work_area')
    .eq('id', rowId)
    .maybeSingle()

  if (!row?.email) {
    // Nothing to enrich or notify on.
    return { enriched: false, fieldsUpdated, emailed: false }
  }

  if (reEnrich) {
    try {
      const input = {
        email: row.email as string,
        name: (row.name as string) || undefined,
        linkedinUrl: (row.linkedin_url as string) || undefined,
        companyName: (row.company_name as string) || undefined,
        jobTitle: (row.job_title as string) || undefined,
        country: (row.country as string) || undefined,
        jobLevel: (row.job_level as string) || undefined,
        workArea: (row.work_area as string) || undefined,
      }
      const v2 = await runV2(input, { useCache: !force, skipWiza })
      status = v2.status

      // ── Build the column update (mirrors the admin v2/row save) ──────
      const update: Record<string, unknown> = {}
      const setIfNew = (col: string, current: string | undefined | null, fresh: string | undefined) => {
        if (!fresh || !fresh.trim()) return
        if (!force && current && String(current).trim()) return
        update[col] = fresh.trim()
      }
      setIfNew('name', row.name as string, v2.merged.fullName)
      setIfNew('linkedin_url', row.linkedin_url as string, v2.merged.linkedinUrl)
      setIfNew('company_name', row.company_name as string, v2.merged.companyName)
      setIfNew('job_title', row.job_title as string, v2.merged.jobTitle)
      setIfNew('country', row.country as string, normalizeCountry(v2.merged.country))

      if (v2.merged.photoUrl) update.photo_url = v2.merged.photoUrl
      else if (row.photo_url && isPlaceholderPhoto(row.photo_url as string)) update.photo_url = null

      if (v2.merged.region) update.region = v2.merged.region
      if (v2.merged.city) update.city = v2.merged.city
      if (v2.merged.companyDomain) update.company_domain = v2.merged.companyDomain
      if (v2.merged.companyLinkedinUrl) update.company_linkedin_url = v2.merged.companyLinkedinUrl
      if (v2.merged.companyWebsite) update.company_website = v2.merged.companyWebsite
      if (v2.merged.companySize) update.company_size = bracketCompanySize(v2.merged.companySize) || v2.merged.companySize
      if (v2.merged.industry) update.company_industry = titleCase(v2.merged.industry)
      if (v2.merged.subIndustry) update.company_sub_industry = titleCase(v2.merged.subIndustry)
      if (v2.merged.function) update.job_function = v2.merged.function
      if (v2.merged.department) update.department = v2.merged.department

      if (v2.standardized?.seniority) update.seniority = v2.standardized.seniority
      else if (v2.merged.seniority) update.seniority = v2.merged.seniority
      if (v2.standardized?.jobTitleCanonical) update.job_title_standardized = v2.standardized.jobTitleCanonical

      if (v2.aiDemographics?.ageBracket && v2.aiDemographics.ageBracket !== 'uncertain') update.age_ai_estimate = v2.aiDemographics.ageBracket
      if (v2.aiDemographics?.sexPresentation && v2.aiDemographics.sexPresentation !== 'uncertain') update.sex_ai_estimate = v2.aiDemographics.sexPresentation
      if (v2.aiDemographics?.confidence) update.ai_estimate_confidence = v2.aiDemographics.confidence

      // Beehiiv extras (name + country win from the newsletter signup).
      if (v2.extras?.beehiiv) {
        const b = v2.extras.beehiiv
        const fullName = [b.firstName, b.lastName].filter(Boolean).join(' ').trim()
        if (fullName) update.name = fullName
        const country = normalizeCountry(b.country)
        if (country) update.country = country
        if (b.utmSource) update.utm_source_beehiiv = b.utmSource
        if (b.subscriptionTier) update.subscription_tier = b.subscriptionTier
        if (b.status) update.beehiiv_status = b.status
      }

      // Stripe extras — only raise LTV, never lower it (multi-customer guard).
      if (v2.extras?.stripe) {
        update.stripe_customer_id = v2.extras.stripe.customerId
        if (v2.extras.stripe.lifetimeValueUsd > 0) update.lifetime_value_usd = v2.extras.stripe.lifetimeValueUsd
      }

      update.enrichment_status = v2.status
      update.enriched_at = new Date().toISOString()

      // Re-classify with the merged signal set.
      try {
        const { data: existingRow } = await c.from('submissions').select('*').eq('id', rowId).maybeSingle()
        if (existingRow) {
          const merged = { ...(existingRow as unknown as DbRow), ...(update as Partial<DbRow>) }
          const seg = assignSegmentationV2(fromRow(merged))
          update.stage = seg.stage
          update.stage_score = seg.stageScore
          update.stage_reason = seg.stageReason
          update.persona = seg.persona
          update.persona_reason = seg.personaReason
          update.staged_at = new Date().toISOString()
        }
      } catch { /* segmentation best-effort */ }

      if (Object.keys(update).length > 0) {
        const { error, data } = await c.from('submissions').update(update).eq('id', rowId).select('id')
        if (error) console.error(`[enrich-lead] row=${rowId} save error:`, error.message)
        else if (data && data.length > 0) {
          enriched = true
          fieldsUpdated.push(...Object.keys(update))
        }
      }

      // Audit trail (separate, never blocks).
      try {
        const { data: prev } = await c.from('submissions').select('enrichment_raw').eq('id', rowId).maybeSingle()
        const existingRaw = (prev?.enrichment_raw as Record<string, unknown>) || {}
        await c.from('submissions').update({ enrichment_raw: { ...existingRaw, v2: v2.raw } }).eq('id', rowId)
      } catch { /* non-fatal */ }
    } catch (err) {
      console.error(`[enrich-lead] enrichment failed for row=${rowId}:`, err)
    }
  }

  // Re-read the fresh row and send the notification.
  const { data: finalRow } = await c.from('submissions').select('*').eq('id', rowId).maybeSingle()
  let emailed = false
  try {
    await sendSubmitNotification((finalRow ?? { id: rowId, email: row.email }) as SubmissionRow, siteUrl)
    emailed = true
  } catch (err) {
    console.error(`[enrich-lead] notification failed for row=${rowId}:`, err)
  }

  return { enriched, status, fieldsUpdated, emailed }
}
