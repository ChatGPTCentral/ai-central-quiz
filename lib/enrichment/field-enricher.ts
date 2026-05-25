// Pure helper for surgical field-level enrichment, factored out of the
// /api/admin/enrich/v2/field route so the batch endpoint can reuse it.
// (Next.js route files can only export GET/POST/etc, so helpers must live
// outside the app/ directory.)

import { scrapeLinkedInProfile } from './linkedin-scrape'
import { apolloProvider } from './apollo'
import { wizaProvider } from './wiza'
import { estimateDemographicsFromPhoto } from './photo-demographics'
import { findBeehiivSubscriberByEmail } from './beehiiv-lookup'
import { findStripeCustomerByEmail } from './stripe-lookup'
import { cleanPhoto, isPlaceholderPhoto } from './photo-filter'
import { normalizeCountry, titleCase } from '../normalize'
import { standardizeSeniority, standardizeTitle, bracketCompanySize } from './standardize'
import type { NormalizedPerson } from './types'

export type FieldName = 'photo' | 'demographics' | 'beehiiv' | 'stripe' | 'apify' | 'apollo' | 'wiza'

export interface FieldEnrichResult {
  rowId: string
  updated: string[]
  skipped: { field: string; reason: string }[]
  cost: { apify: number; apollo: number; claude: number; beehiiv: number; stripe: number }
}

export const ZERO_COST = { apify: 0, apollo: 0, claude: 0, beehiiv: 0, stripe: 0 }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enrichRowFields(c: any, id: string, fields: FieldName[]): Promise<FieldEnrichResult> {
  const { data: row, error } = await c
    .from('submissions')
    .select('id, email, name, country, linkedin_url, photo_url, age_ai_estimate, sex_ai_estimate, subscription_tier, stripe_customer_id')
    .eq('id', id)
    .maybeSingle()

  if (error) return { rowId: id, updated: [], skipped: [{ field: 'row', reason: error.message }], cost: { ...ZERO_COST } }
  if (!row) return { rowId: id, updated: [], skipped: [{ field: 'row', reason: 'not found' }], cost: { ...ZERO_COST } }

  const update: Record<string, unknown> = {}
  const updated: string[] = []
  const skipped: { field: string; reason: string }[] = []
  const cost = { ...ZERO_COST }
  let currentPhotoUrl: string | null = row.photo_url

  // ── PHOTO ────────────────────────────────────────────────────────
  if (fields.includes('photo')) {
    const hasReal = currentPhotoUrl && !isPlaceholderPhoto(currentPhotoUrl)
    if (hasReal) {
      skipped.push({ field: 'photo', reason: 'already has a real photo' })
    } else if (row.linkedin_url) {
      try {
        cost.apify++
        const profile = await scrapeLinkedInProfile(row.linkedin_url)
        const fresh = cleanPhoto(profile?.photoUrl)
        if (fresh) {
          update.photo_url = fresh; updated.push('photo'); currentPhotoUrl = fresh
        } else {
          cost.apollo++
          const a = await apolloProvider.lookup({ email: row.email, linkedinUrl: row.linkedin_url, name: row.name })
          const fresh2 = cleanPhoto(a?.photoUrl)
          if (fresh2) { update.photo_url = fresh2; updated.push('photo'); currentPhotoUrl = fresh2 }
          else skipped.push({ field: 'photo', reason: 'Apify + Apollo returned no real photo' })
        }
      } catch (err) {
        skipped.push({ field: 'photo', reason: String(err) })
      }
    } else {
      try {
        cost.apollo++
        const a = await apolloProvider.lookup({ email: row.email, name: row.name })
        const fresh = cleanPhoto(a?.photoUrl)
        if (fresh) { update.photo_url = fresh; updated.push('photo'); currentPhotoUrl = fresh }
        else skipped.push({ field: 'photo', reason: 'no linkedin_url and Apollo returned no photo' })
      } catch (err) {
        skipped.push({ field: 'photo', reason: String(err) })
      }
    }
  }

  // ── DEMOGRAPHICS ────────────────────────────────────────────────
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
          if (d.ageBracket && d.ageBracket !== 'uncertain') { update.age_ai_estimate = d.ageBracket; updated.push('age') }
          else skipped.push({ field: 'age', reason: 'Claude returned uncertain' })
          if (d.sexPresentation && d.sexPresentation !== 'uncertain') { update.sex_ai_estimate = d.sexPresentation; updated.push('sex') }
          else skipped.push({ field: 'sex', reason: 'Claude returned uncertain' })
          if (d.confidence) update.ai_estimate_confidence = d.confidence
        }
      } catch (err) {
        skipped.push({ field: 'demographics', reason: String(err) })
      }
    }
  }

  // ── BEEHIIV (free) ──────────────────────────────────────────────
  if (fields.includes('beehiiv')) {
    try {
      cost.beehiiv++
      const b = await findBeehiivSubscriberByEmail(row.email)
      if (!b) {
        skipped.push({ field: 'beehiiv', reason: 'not a Beehiiv subscriber' })
      } else {
        const fullName = [b.firstName, b.lastName].filter(Boolean).join(' ').trim()
        if (fullName && !row.name)    { update.name = fullName; updated.push('name') }
        const country = normalizeCountry(b.country)
        if (country && !row.country)  { update.country = country; updated.push('country') }
        if (b.utmSource)              { update.utm_source_beehiiv = b.utmSource; updated.push('utm_source_beehiiv') }
        if (b.subscriptionTier)       { update.subscription_tier  = b.subscriptionTier; updated.push('subscription_tier') }
        if (b.status)                 { update.beehiiv_status     = b.status; updated.push('beehiiv_status') }
      }
    } catch (err) {
      skipped.push({ field: 'beehiiv', reason: String(err) })
    }
  }

  // ── STRIPE (free) ───────────────────────────────────────────────
  if (fields.includes('stripe')) {
    try {
      cost.stripe++
      const s = await findStripeCustomerByEmail(row.email)
      if (!s) {
        skipped.push({ field: 'stripe', reason: 'no Stripe customer for this email' })
      } else {
        update.stripe_customer_id = s.customerId; updated.push('stripe_customer_id')
        update.lifetime_value_usd = s.lifetimeValueUsd; updated.push('lifetime_value_usd')
      }
    } catch (err) {
      skipped.push({ field: 'stripe', reason: String(err) })
    }
  }

  // ── APIFY (re-scrape LinkedIn, overwrite all derived fields) ───
  if (fields.includes('apify')) {
    if (!row.linkedin_url) {
      skipped.push({ field: 'apify', reason: 'no linkedin_url to scrape' })
    } else {
      try {
        cost.apify++
        const p = await scrapeLinkedInProfile(row.linkedin_url)
        if (!p) skipped.push({ field: 'apify', reason: 'actor returned no usable data' })
        else applyNormalizedPerson(update, updated, p)
      } catch (err) {
        skipped.push({ field: 'apify', reason: String(err) })
      }
    }
  }

  // ── APOLLO (re-run match, overwrite derived fields) ─────────────
  if (fields.includes('apollo')) {
    try {
      cost.apollo++
      const a = await apolloProvider.lookup({ email: row.email, linkedinUrl: row.linkedin_url, name: row.name })
      if (!a) skipped.push({ field: 'apollo', reason: 'Apollo returned no match' })
      else applyNormalizedPerson(update, updated, a)
    } catch (err) {
      skipped.push({ field: 'apollo', reason: String(err) })
    }
  }

  // ── WIZA (re-run email lookup) ──────────────────────────────────
  if (fields.includes('wiza')) {
    try {
      const w = await wizaProvider.lookup({ email: row.email })
      if (!w) skipped.push({ field: 'wiza', reason: 'Wiza returned no match' })
      else applyNormalizedPerson(update, updated, w)
    } catch (err) {
      skipped.push({ field: 'wiza', reason: String(err) })
    }
  }

  if (Object.keys(update).length > 0) {
    const { error: upErr } = await c.from('submissions').update(update).eq('id', id)
    if (upErr) return { rowId: id, updated: [], skipped: [{ field: 'save', reason: upErr.message }], cost }
  }

  return { rowId: id, updated, skipped, cost }
}

/**
 * Apply a NormalizedPerson (from any LinkedIn-style provider) onto the
 * update payload. Overwrites — surgical re-runs are explicit requests to
 * refresh data, not gap-fillers.
 */
function applyNormalizedPerson(update: Record<string, unknown>, updated: string[], p: NormalizedPerson) {
  const set = (col: string, val: string | undefined | null) => {
    const trimmed = typeof val === 'string' ? val.trim() : val
    if (!trimmed) return
    update[col] = trimmed
    updated.push(col)
  }
  const cleanedPhoto = cleanPhoto(p.photoUrl)
  if (cleanedPhoto) { update.photo_url = cleanedPhoto; updated.push('photo_url') }
  const fullName = p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
  set('name', fullName)
  set('linkedin_url', p.linkedinUrl)
  set('job_title', p.jobTitle)
  set('company_name', p.companyName)
  set('company_linkedin_url', p.companyLinkedinUrl)
  set('company_website', p.companyWebsite)
  set('company_domain', p.companyDomain)
  set('job_function', p.function)
  set('department', p.department)
  set('country', normalizeCountry(p.country))
  set('region', p.region)
  set('city', p.city)
  if (p.industry)     set('company_industry', titleCase(p.industry))
  if (p.subIndustry)  set('company_sub_industry', titleCase(p.subIndustry))
  if (p.companySize) {
    const bracketed = bracketCompanySize(p.companySize) || p.companySize
    update.company_size = bracketed
    updated.push('company_size')
  }
  // Derived: bucketed seniority + canonical title
  const seniority = standardizeSeniority(p.jobTitle, p.seniority)
  if (seniority) { update.seniority = seniority; updated.push('seniority') }
  const titleCanonical = standardizeTitle(p.jobTitle)
  if (titleCanonical) { update.job_title_standardized = titleCanonical; updated.push('job_title_standardized') }
}
