// Enrichment v2 — Google-first pipeline.
//
// Two clear paths:
//
//   IF we don't have a LinkedIn URL yet:
//     1. name_from_email      (only if name missing)
//     2. google_search        (find linkedin.com/in/...)
//     3. apollo (by email)    ← fallback work-profile lookup if URL not found
//     4. wiza (by email)      ← also fallback (Wiza only takes email)
//
//   IF we now have a LinkedIn URL (either pre-existing or just found):
//     5. apify_profile        ← THE source for work-profile from a URL
//     6. apollo (by URL)      ← backup, fills anything Apify missed
//
//   ALWAYS once a photo is known:
//     7. photo_ai_demographics  (Claude vision → age + sex)
//
// No early-exit on "got a photo" — every stage that can ADD a field gets to run,
// so the merge step has the maximum set of signals to combine.

import { apolloProvider } from './apollo'
import { wizaProvider } from './wiza'
import { findLinkedInViaGoogle } from './google-linkedin-search'
import { scrapeLinkedInProfile } from './linkedin-scrape'
import { inferNameFromEmail, type InferredName } from './name-from-email'
import { estimateDemographicsFromPhoto, type PhotoDemographics } from './photo-demographics'
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
  name: 'name_from_email' | 'google_search' | 'apollo' | 'wiza' | 'linkedin_scrape' | 'photo_ai_demographics'
  status: 'skipped' | 'ok' | 'miss' | 'error'
  result?: NormalizedPerson | InferredName | PhotoDemographics | { linkedinUrl?: string; triedQueries?: string[]; organicSample?: { url: string; title?: string; query?: string }[] }
  reason?: string
}

export interface V2Result {
  email: string
  stages: V2Stage[]
  merged: MergedEnrichment
  raw: Record<string, unknown>
  providersTried: EnrichmentSource[]
  status: 'complete' | 'partial' | 'failed'
  aiDemographics?: PhotoDemographics
}

export async function runV2(input: V2Input): Promise<V2Result> {
  const email = input.email.trim().toLowerCase()
  const stages: V2Stage[] = []
  const results: NormalizedPerson[] = []
  const raw: Record<string, unknown> = {}
  const tried: EnrichmentSource[] = []

  const ctx = {
    email,
    name: input.name?.trim() || undefined,
    linkedinUrl: input.linkedinUrl?.trim() || undefined,
    companyName: input.companyName?.trim() || undefined,
    jobTitle: input.jobTitle?.trim() || undefined,
    country: input.country?.trim() || undefined,
  }

  function record(provider: EnrichmentSource, r: NormalizedPerson | null) {
    if (!r) return
    results.push(r)
    raw[provider] = r.raw
    // Promote any newly-discovered signals so later providers can use them
    if (!ctx.linkedinUrl && r.linkedinUrl) ctx.linkedinUrl = r.linkedinUrl
    if (!ctx.name && r.fullName)           ctx.name = r.fullName
    if (!ctx.companyName && r.companyName) ctx.companyName = r.companyName
    if (!ctx.jobTitle && r.jobTitle)       ctx.jobTitle = r.jobTitle
    if (!ctx.country && r.country)         ctx.country = r.country
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

  // ── Stage 2: Google → LinkedIn URL (only if missing) ────────────
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

  // ── Stage 3: Apify profile scrape — PRIMARY work-profile source ──
  if (ctx.linkedinUrl) {
    try {
      tried.push('apify_profile')
      const profile = await scrapeLinkedInProfile(ctx.linkedinUrl)
      if (profile) {
        record('apify_profile', profile)
        stages.push({ name: 'linkedin_scrape', status: 'ok', result: profile })
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attempts = (globalThis as any).__lastApifyProfileAttempts || []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(globalThis as any).__lastApifyProfileAttempts = undefined
        stages.push({
          name: 'linkedin_scrape',
          status: 'miss',
          // Surface what each actor returned so the user can diagnose in the Lab page
          result: { linkedinUrl: ctx.linkedinUrl, attempts } as never,
          reason: `Tried ${attempts.length} actor(s) — all returned no usable data`,
        })
      }
    } catch (err) {
      stages.push({ name: 'linkedin_scrape', status: 'error', reason: String(err) })
    }
  } else {
    stages.push({ name: 'linkedin_scrape', status: 'skipped', reason: 'no linkedin_url to scrape' })
  }

  // ── Stage 4: Apollo — backup work-profile source (now that ctx has LinkedIn URL) ──
  try {
    tried.push('apollo')
    const apolloResult = await apolloProvider.lookup(ctx)
    if (apolloResult) {
      record('apollo', apolloResult)
      stages.push({ name: 'apollo', status: 'ok', result: apolloResult })
    } else {
      stages.push({ name: 'apollo', status: 'miss' })
    }
  } catch (err) {
    stages.push({ name: 'apollo', status: 'error', reason: String(err) })
  }

  // ── Stage 5: Wiza — email-only fallback (no LinkedIn-URL endpoint) ──
  // We still run it for any extra fields it might surface (phone, etc.) but
  // it's strictly additive at this point.
  try {
    tried.push('wiza')
    const wizaResult = await wizaProvider.lookup(ctx)
    if (wizaResult) {
      record('wiza', wizaResult)
      stages.push({ name: 'wiza', status: 'ok', result: wizaResult })
    } else {
      stages.push({ name: 'wiza', status: 'miss' })
    }
  } catch (err) {
    stages.push({ name: 'wiza', status: 'error', reason: String(err) })
  }

  const merged = mergeEnrichment(results, tried)

  // ── Stage 6: Claude vision — age + sex from photo ───────────────
  let aiDemographics: PhotoDemographics | undefined
  if (merged.photoUrl && process.env.ANTHROPIC_API_KEY) {
    const d = await estimateDemographicsFromPhoto(merged.photoUrl)
    if (d.error) {
      stages.push({ name: 'photo_ai_demographics', status: 'error', reason: d.error })
    } else if (d.ageBracket || d.sexPresentation) {
      stages.push({ name: 'photo_ai_demographics', status: 'ok', result: d })
      aiDemographics = d
      raw.claude_vision = d.raw
    } else {
      stages.push({ name: 'photo_ai_demographics', status: 'miss' })
    }
  } else {
    stages.push({
      name: 'photo_ai_demographics',
      status: 'skipped',
      reason: !merged.photoUrl ? 'no photo to analyze' : 'ANTHROPIC_API_KEY not set',
    })
  }

  const status: V2Result['status'] =
    merged.linkedinUrl && merged.photoUrl ? 'complete' :
    results.length > 0 || merged.linkedinUrl ? 'partial' : 'failed'
  return { email, stages, merged, raw, providersTried: tried, status, aiDemographics }
}
