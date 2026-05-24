// Enrichment v2 — one cohesive pipeline.
//
// Input: a row's known signals (email + whatever is already there).
// Output: stage-by-stage results + a merged NormalizedPerson + status.
//
// Stages:
//   1. Name inference from email local-part (if name is missing).
//   2. Apollo direct match by email (+ any other signals).
//   3. Google → first linkedin.com/in/* in SERP (if we don't already have one).
//   4. Apify-profile scrape by LinkedIn URL (if we now have one).
//   5. Merge — first-non-empty-wins; photo always overwrites.

import { apolloProvider } from './apollo'
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
  name: 'name_from_email' | 'apollo' | 'google_search' | 'linkedin_scrape'
  status: 'skipped' | 'ok' | 'miss' | 'error'
  result?: NormalizedPerson | InferredName | { linkedinUrl?: string; triedQueries?: string[]; organicSample?: { url: string; title?: string }[] }
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

function isComplete(m: MergedEnrichment): boolean {
  // For v2, "complete" means we have a LinkedIn URL AND a photo. That's the user's stated goal.
  return !!m.linkedinUrl && !!m.photoUrl
}

export async function runV2(input: V2Input): Promise<V2Result> {
  const email = input.email.trim().toLowerCase()
  const stages: V2Stage[] = []
  const results: NormalizedPerson[] = []
  const raw: Record<string, NormalizedPerson['raw']> = {}
  const tried: EnrichmentSource[] = []

  // Working context — grows as stages discover more signals
  const ctx = {
    email,
    name: input.name?.trim() || undefined,
    linkedinUrl: input.linkedinUrl?.trim() || undefined,
    companyName: input.companyName?.trim() || undefined,
    jobTitle: input.jobTitle?.trim() || undefined,
    country: input.country?.trim() || undefined,
  }

  // ── Stage 1: infer name from email if missing ───────────────────
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

  // ── Stage 2: Apollo direct ──────────────────────────────────────
  try {
    tried.push('apollo')
    const apolloResult = await apolloProvider.lookup(ctx)
    if (apolloResult) {
      results.push(apolloResult)
      raw['apollo'] = apolloResult.raw
      // Promote Apollo's findings into the working context so later stages benefit
      if (!ctx.linkedinUrl && apolloResult.linkedinUrl) ctx.linkedinUrl = apolloResult.linkedinUrl
      if (!ctx.companyName && apolloResult.companyName) ctx.companyName = apolloResult.companyName
      if (!ctx.jobTitle && apolloResult.jobTitle)       ctx.jobTitle = apolloResult.jobTitle
      if (!ctx.country && apolloResult.country)         ctx.country = apolloResult.country
      if (!ctx.name && apolloResult.fullName)           ctx.name = apolloResult.fullName
      stages.push({ name: 'apollo', status: 'ok', result: apolloResult })
    } else {
      stages.push({ name: 'apollo', status: 'miss' })
    }
  } catch (err) {
    stages.push({ name: 'apollo', status: 'error', reason: String(err) })
  }

  // Early-exit check after Apollo
  const interimAfterApollo = mergeEnrichment(results, [...tried])
  if (isComplete(interimAfterApollo)) {
    stages.push({ name: 'google_search',  status: 'skipped', reason: 'already complete' })
    stages.push({ name: 'linkedin_scrape', status: 'skipped', reason: 'already complete' })
    return finish(email, stages, results, raw, tried, interimAfterApollo)
  }

  // ── Stage 3: Google → LinkedIn URL (only if missing) ────────────
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

  // ── Stage 4: scrape the LinkedIn profile (if we have a URL) ─────
  if (ctx.linkedinUrl) {
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
    stages.push({ name: 'linkedin_scrape', status: 'skipped', reason: 'no linkedin_url to scrape' })
  }

  const merged = mergeEnrichment(results, tried)
  return finish(email, stages, results, raw, tried, merged)
}

function finish(
  email: string,
  stages: V2Stage[],
  results: NormalizedPerson[],
  raw: Record<string, NormalizedPerson['raw']>,
  tried: EnrichmentSource[],
  merged: MergedEnrichment,
): V2Result {
  const status: V2Result['status'] =
    merged.linkedinUrl && merged.photoUrl ? 'complete' :
    results.length > 0 ? 'partial' : 'failed'
  return { email, stages, merged, raw, providersTried: tried, status }
}
