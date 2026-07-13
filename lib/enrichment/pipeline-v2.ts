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
import { resolveIdentityViaGoogle, type ResolverResult } from './google-resolver'
import { scrapeLinkedInProfile } from './linkedin-scrape'
import { inferNameFromEmail, type InferredName } from './name-from-email'
import { estimateDemographicsFromPhoto, type PhotoDemographics } from './photo-demographics'
import { findBeehiivSubscriberByEmail, type BeehiivLookupResult } from './beehiiv-lookup'
import { findStripeCustomerByEmail, type StripeLookupResult } from './stripe-lookup'
import { mergeEnrichment } from './merge'
import { standardizeIndustry } from './standardize'
import { resolveSeniority, resolveTitle } from '../classification-overrides'
import { standardizeTitleWithLLM } from './standardize-title-llm'
import { getCached, setCached } from './cache'
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
  name: 'name_from_email' | 'google_search' | 'apollo' | 'wiza' | 'linkedin_scrape' | 'photo_ai_demographics' | 'beehiiv_lookup' | 'stripe_lookup'
  status: 'skipped' | 'ok' | 'miss' | 'error'
  /** What this stage consumed (the ctx it saw) — surfaced by the inspector. */
  input?: Record<string, unknown>
  result?: NormalizedPerson | InferredName | PhotoDemographics | BeehiivLookupResult | StripeLookupResult | { linkedinUrl?: string; triedQueries?: string[]; organicSample?: { url: string; title?: string; query?: string }[] }
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
  /** Email-keyed lookups outside the linkedin merge — saved directly to columns. */
  extras?: {
    beehiiv?: BeehiivLookupResult
    stripe?: StripeLookupResult
  }
  fromCache?: boolean
  /** Standardized values derived from raw — written to the seniority + ti columns. */
  standardized?: {
    seniority?: string
    jobTitleCanonical?: string
    industry?: string
  }
  /** Present only when opts.verifiedResolver was used — the verified Google
   *  match (confidence + reasoning + candidates) for the compare harness. */
  resolver?: ResolverResult
}

export async function runV2(input: V2Input, opts: { useCache?: boolean; skipWiza?: boolean; verifiedResolver?: boolean } = {}): Promise<V2Result> {
  const email = input.email.trim().toLowerCase()

  // ── Cache check — protects API budget on re-runs (60-day TTL) ───
  if (opts.useCache !== false) {
    const cached = await getCached(email)
    if (cached) {
      return {
        email,
        stages: [{ name: 'name_from_email', status: 'skipped', reason: 'cached result returned' }],
        merged: cached.data,
        raw: cached.raw,
        providersTried: cached.providersTried,
        status: cached.status,
        fromCache: true,
      }
    }
  }

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
  let resolver: ResolverResult | undefined
  const gInput = { name: ctx.name, companyName: ctx.companyName, jobTitle: ctx.jobTitle, country: ctx.country, emailDomain: ctx.email.split('@')[1] }
  if (!ctx.linkedinUrl) {
    if (opts.verifiedResolver) {
      // Shadow path: verified resolver (combos + LLM match). Accepts nothing
      // on low confidence, and seeds verified hints for the downstream lookups.
      const r = await resolveIdentityViaGoogle({
        name: ctx.name, email: ctx.email,
        companyName: ctx.companyName, jobTitle: ctx.jobTitle, country: ctx.country,
      })
      resolver = r
      // Full candidates (with snippets + the LLM verdict) so the inspector can
      // show exactly what the model saw and why it decided.
      const detail = { triedQueries: r.triedQueries, confidence: r.confidence, reasoning: r.reasoning, matchedQuery: r.matchedQuery, candidates: r.candidates }
      if (r.outcome === 'matched') {
        if (r.linkedinUrl) ctx.linkedinUrl = r.linkedinUrl
        if (!ctx.companyName && r.companyName) ctx.companyName = r.companyName
        if (!ctx.jobTitle && r.jobTitle) ctx.jobTitle = r.jobTitle
        if (!ctx.country && r.country) ctx.country = r.country
        stages.push({ name: 'google_search', status: 'ok', input: gInput, result: { linkedinUrl: r.linkedinUrl, ...detail } as V2Stage['result'] })
      } else {
        stages.push({ name: 'google_search', status: 'miss', input: gInput, reason: `${r.outcome} (conf ${r.confidence.toFixed(2)}): ${r.reasoning}`, result: detail as V2Stage['result'] })
      }
    } else try {
      const search = await findLinkedInViaGoogle({
        name: ctx.name, email: ctx.email,
        companyName: ctx.companyName, jobTitle: ctx.jobTitle, country: ctx.country,
      })
      if (search.linkedinUrl) {
        ctx.linkedinUrl = search.linkedinUrl
        stages.push({ name: 'google_search', status: 'ok', input: gInput, result: { linkedinUrl: search.linkedinUrl, triedQueries: search.triedQueries, organicSample: search.organicSample } })
      } else {
        stages.push({ name: 'google_search', status: 'miss', input: gInput, result: { triedQueries: search.triedQueries, organicSample: search.organicSample } })
      }
    } catch (err) {
      stages.push({ name: 'google_search', status: 'error', input: gInput, reason: String(err) })
    }
  } else {
    stages.push({ name: 'google_search', status: 'skipped', input: gInput, reason: 'linkedin_url already known' })
  }

  // ── Stage 3: Apify profile scrape — PRIMARY work-profile source ──
  const scrapeInput = { linkedinUrl: ctx.linkedinUrl }
  if (ctx.linkedinUrl) {
    try {
      tried.push('apify_profile')
      const profile = await scrapeLinkedInProfile(ctx.linkedinUrl)
      if (profile) {
        record('apify_profile', profile)
        stages.push({ name: 'linkedin_scrape', status: 'ok', input: scrapeInput, result: profile })
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attempts = (globalThis as any).__lastApifyProfileAttempts || []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(globalThis as any).__lastApifyProfileAttempts = undefined
        stages.push({
          name: 'linkedin_scrape',
          status: 'miss',
          input: scrapeInput,
          // Surface what each actor returned so the user can diagnose in the Lab page
          result: { linkedinUrl: ctx.linkedinUrl, attempts } as never,
          reason: `Tried ${attempts.length} actor(s) — all returned no usable data`,
        })
      }
    } catch (err) {
      stages.push({ name: 'linkedin_scrape', status: 'error', input: scrapeInput, reason: String(err) })
    }
  } else {
    stages.push({ name: 'linkedin_scrape', status: 'skipped', input: scrapeInput, reason: 'no linkedin_url to scrape' })
  }

  // ── Stage 4: Apollo — backup work-profile source (now that ctx has LinkedIn URL) ──
  const apolloInput = { email: ctx.email, name: ctx.name, companyName: ctx.companyName, linkedinUrl: ctx.linkedinUrl }
  try {
    tried.push('apollo')
    const apolloResult = await apolloProvider.lookup(ctx)
    if (apolloResult) {
      record('apollo', apolloResult)
      stages.push({ name: 'apollo', status: 'ok', input: apolloInput, result: apolloResult })
    } else {
      stages.push({ name: 'apollo', status: 'miss', input: apolloInput })
    }
  } catch (err) {
    stages.push({ name: 'apollo', status: 'error', input: apolloInput, reason: String(err) })
  }

  // ── Stage 5: Wiza — email-only fallback (no LinkedIn-URL endpoint) ──
  // Strictly additive on top of Apify. Skipped when opts.skipWiza=true to
  // save ~$0.02/row on bulk imports.
  if (opts.skipWiza) {
    stages.push({ name: 'wiza', status: 'skipped', reason: 'skipWiza=true' })
  } else try {
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

  // ── Stage 7: Beehiiv lookup (free, email-keyed) ─────────────────
  const extras: V2Result['extras'] = {}
  try {
    const b = await findBeehiivSubscriberByEmail(email)
    if (b) {
      extras.beehiiv = b
      raw.beehiiv = b.raw
      stages.push({ name: 'beehiiv_lookup', status: 'ok', result: b })
    } else {
      stages.push({ name: 'beehiiv_lookup', status: 'miss', reason: 'not a Beehiiv subscriber' })
    }
  } catch (err) {
    stages.push({ name: 'beehiiv_lookup', status: 'error', reason: String(err) })
  }

  // ── Stage 8: Stripe lookup (free, email-keyed) ──────────────────
  try {
    const s = await findStripeCustomerByEmail(email)
    if (s) {
      extras.stripe = s
      raw.stripe = s.raw
      stages.push({ name: 'stripe_lookup', status: 'ok', result: s })
    } else {
      stages.push({ name: 'stripe_lookup', status: 'miss', reason: 'no Stripe customer for this email' })
    }
  } catch (err) {
    stages.push({ name: 'stripe_lookup', status: 'error', reason: String(err) })
  }

  const status: V2Result['status'] =
    merged.linkedinUrl && merged.photoUrl ? 'complete' :
    results.length > 0 || merged.linkedinUrl || extras.beehiiv || extras.stripe ? 'partial' : 'failed'

  // ── Standardize derived values ──────────────────────────────────
  // Override-aware: classification_overrides table → TITLE_BANK → LLM
  // fallback. Both resolveSeniority/resolveTitle are async because they
  // consult a cached DB layer for user-edited overrides.
  const localCanonical = await resolveTitle(merged.jobTitle)
  const llmCanonical = !localCanonical ? await standardizeTitleWithLLM(merged.jobTitle || '') : undefined
  const standardized = {
    seniority: await resolveSeniority(merged.jobTitle, merged.seniority),
    jobTitleCanonical: localCanonical || llmCanonical,
    industry: standardizeIndustry(merged.industry),
  }

  // ── Cache the pipeline result (TTL 60d) so re-runs don't re-pay ───
  if (results.length > 0 || merged.linkedinUrl) {
    setCached(email, { data: merged, raw: raw as Record<string, NormalizedPerson['raw']>, status, providersTried: tried }).catch(() => {})
  }

  return { email, stages, merged, raw, providersTried: tried, status, aiDemographics, extras, standardized, resolver }
}
