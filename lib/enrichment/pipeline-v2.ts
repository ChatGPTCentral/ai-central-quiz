// Enrichment v2 — Google-first pipeline.
//
// Order (per user's spec, Morgane Marlow flow):
//   1. Infer name from email (if missing).
//   2. Google search: top 5 organic results, find first linkedin.com/in/*.
//   3. Once we have a LinkedIn URL → push to Apollo (richer match via URL).
//   4. If Apollo didn't return a face → Wiza.
//   5. If still no face → Apify profile scraper (last resort, paid actor).
//   6. Merge; photo always overwrites.

import { apolloProvider } from './apollo'
import { wizaProvider } from './wiza'
import { findLinkedInViaGoogle } from './google-linkedin-search'
import { scrapeLinkedInProfile } from './linkedin-scrape'
import { inferNameFromEmail, type InferredName } from './name-from-email'
import { mergeEnrichment } from './merge'
import type { NormalizedPerson, MergedEnrichment, EnrichmentSource } from './types'

export interface V2Input {
  email: string
  name?: string
  linkedinUrl?: string
  companyName?: string
  jobTitle?: string
  country?: string
}

export interface V2Stage {
  name: 'name_from_email' | 'google_search' | 'apollo' | 'wiza' | 'linkedin_scrape'
  status: 'skipped' | 'ok' | 'miss' | 'error'
  result?: NormalizedPerson | InferredName | { linkedinUrl?: string; triedQueries?: string[]; organicSample?: { url: string; title?: string; query?: string }[] }
  reason?: string
}

export interface V2Result {
  email: string
  stages: V2Stage[]
  merged: MergedEnrichment
  raw: Record<string, NormalizedPerson['raw']>
  providersTried: EnrichmentSource[]
  status: 'complete' | 'partial' | 'failed'
}

function hasPhoto(results: NormalizedPerson[]): boolean {
  return results.some(r => !!r.photoUrl)
}

export async function runV2(input: V2Input): Promise<V2Result> {
  const email = input.email.trim().toLowerCase()
  const stages: V2Stage[] = []
  const results: NormalizedPerson[] = []
  const raw: Record<string, NormalizedPerson['raw']> = {}
  const tried: EnrichmentSource[] = []

  const ctx = {
    email,
    name: input.name?.trim() || undefined,
    linkedinUrl: input.linkedinUrl?.trim() || undefined,
    companyName: input.companyName?.trim() || undefined,
    jobTitle: input.jobTitle?.trim() || undefined,
    country: input.country?.trim() || undefined,
  }

  // ── Stage 1: name from email ────────────────────────────────────
  if (!ctx.name) {
    const inferred = inferNameFromEmail(email)
    if (inferred) {
      ctx.name = inferred.fullName || [inferred.firstName, inferred.lastName].filter(Boolean).join(' ').trim()
      stages.push({ name: 'name_from_email', status: 'ok', result: inferred })
    } else {
      stages.push({ name: 'name_from_email', status: 'miss', reason: 'generic mailbox or unparseable local-part' })
    }
  } else {
    stages.push({ name: 'name_from_email', status: 'skipped', reason: 'row already has a name' })
  }

  // ── Stage 2: Google → LinkedIn URL (if missing) ─────────────────
  if (!ctx.linkedinUrl) {
    try {
      const search = await findLinkedInViaGoogle({
        name: ctx.name, email: ctx.email,
        companyName: ctx.companyName, jobTitle: ctx.jobTitle, country: ctx.country,
      })
      if (search.linkedinUrl) {
        ctx.linkedinUrl = search.linkedinUrl
        stages.push({ name: 'google_search', status: 'ok', result: { linkedinUrl: search.linkedinUrl, triedQueries: search.triedQueries, organicSample: search.organicSample } })
      } else {
        stages.push({ name: 'google_search', status: 'miss', result: { triedQueries: search.triedQueries, organicSample: search.organicSample } })
      }
    } catch (err) {
      stages.push({ name: 'google_search', status: 'error', reason: String(err) })
    }
  } else {
    stages.push({ name: 'google_search', status: 'skipped', reason: 'linkedin_url already known' })
  }

  // ── Stage 3: Apollo (now armed with the LinkedIn URL) ───────────
  try {
    tried.push('apollo')
    const apolloResult = await apolloProvider.lookup(ctx)
    if (apolloResult) {
      results.push(apolloResult)
      raw['apollo'] = apolloResult.raw
      // Promote findings into ctx in case downstream providers can use them
      if (!ctx.linkedinUrl && apolloResult.linkedinUrl) ctx.linkedinUrl = apolloResult.linkedinUrl
      if (!ctx.companyName && apolloResult.companyName) ctx.companyName = apolloResult.companyName
      if (!ctx.jobTitle && apolloResult.jobTitle)       ctx.jobTitle = apolloResult.jobTitle
      stages.push({ name: 'apollo', status: 'ok', result: apolloResult })
    } else {
      stages.push({ name: 'apollo', status: 'miss' })
    }
  } catch (err) {
    stages.push({ name: 'apollo', status: 'error', reason: String(err) })
  }

  // ── Stage 4: Wiza (only if Apollo didn't return a photo) ────────
  if (!hasPhoto(results)) {
    try {
      tried.push('wiza')
      const wizaResult = await wizaProvider.lookup(ctx)
      if (wizaResult) {
        results.push(wizaResult)
        raw['wiza'] = wizaResult.raw
        stages.push({ name: 'wiza', status: 'ok', result: wizaResult })
      } else {
        stages.push({ name: 'wiza', status: 'miss' })
      }
    } catch (err) {
      stages.push({ name: 'wiza', status: 'error', reason: String(err) })
    }
  } else {
    stages.push({ name: 'wiza', status: 'skipped', reason: 'photo already obtained from Apollo' })
  }

  // ── Stage 5: Apify profile scraper (only if still no photo) ─────
  if (!hasPhoto(results) && ctx.linkedinUrl) {
    try {
      tried.push('apify_profile')
      const profile = await scrapeLinkedInProfile(ctx.linkedinUrl)
      if (profile) {
        results.push(profile)
        raw['linkedin_scrape'] = profile.raw
        stages.push({ name: 'linkedin_scrape', status: 'ok', result: profile })
      } else {
        stages.push({ name: 'linkedin_scrape', status: 'miss' })
      }
    } catch (err) {
      stages.push({ name: 'linkedin_scrape', status: 'error', reason: String(err) })
    }
  } else {
    stages.push({
      name: 'linkedin_scrape',
      status: 'skipped',
      reason: !ctx.linkedinUrl ? 'no linkedin_url to scrape' : 'photo already obtained earlier',
    })
  }

  const merged = mergeEnrichment(results, tried)
  const status: V2Result['status'] =
    merged.linkedinUrl && merged.photoUrl ? 'complete' :
    results.length > 0 || merged.linkedinUrl ? 'partial' : 'failed'
  return { email, stages, merged, raw, providersTried: tried, status }
}
