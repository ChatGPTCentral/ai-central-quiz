import type { Provider, NormalizedPerson, MergedEnrichment, EnrichmentSource } from './types'
import { apolloProvider } from './apollo'
import { wizaProvider } from './wiza'
import { apifyProvider } from './apify'
import { mergeEnrichment, isEnrichmentComplete } from './merge'
import { getCached, setCached } from './cache'

const PROVIDERS_ORDERED: Provider[] = [
  apolloProvider,   // email-based, already paid for
  wizaProvider,     // email-based, reverse lookup
  apifyProvider,    // SEARCH-based fallback — uses name+company from earlier providers
]

export interface EnrichmentResult {
  merged: MergedEnrichment
  raw: Record<string, NormalizedPerson['raw']>
  status: 'complete' | 'partial' | 'failed'
  providersTried: EnrichmentSource[]
  fromCache: boolean
}

export interface RunOptions {
  /** Include slow providers (Apify search scraper). Off by default — only on for admin batch/row. */
  includeSlow?: boolean
}

const FAILED_RESULT = (tried: EnrichmentSource[]): EnrichmentResult => ({
  merged: { sources: {}, providersTried: tried },
  raw: {},
  status: 'failed',
  providersTried: tried,
  fromCache: false,
})

/**
 * Run the enrichment waterfall for a single email.
 * Sequential — stops as soon as we have linkedin_url + (title || seniority).
 * Cached for 60 days.
 */
export async function runEnrichment(emailRaw: string, opts: RunOptions = {}): Promise<EnrichmentResult> {
  const email = emailRaw.trim().toLowerCase()

  // 1. Cache hit?
  const cached = await getCached(email)
  if (cached) {
    return {
      merged: cached.data,
      raw: cached.raw,
      status: cached.status,
      providersTried: cached.providersTried,
      fromCache: true,
    }
  }

  const results: NormalizedPerson[] = []
  const raw: Record<string, NormalizedPerson['raw']> = {}
  const tried: EnrichmentSource[] = []

  // 2. Run providers sequentially, stopping when we have enough.
  for (const provider of PROVIDERS_ORDERED) {
    if (provider.slow && !opts.includeSlow) continue

    try {
      tried.push(provider.name)
      // Pass the partial enrichment so far — Apify uses it to build a search query.
      const partial = results.length ? mergeEnrichment(results, [...tried]) : undefined
      const result = await provider.lookup({ email, partial })
      if (result) {
        results.push(result)
        raw[provider.name] = result.raw
        const interim = mergeEnrichment(results, [...tried])
        if (isEnrichmentComplete(interim)) break  // Early stop
      }
    } catch (err) {
      console.error(`${provider.name} provider threw:`, err)
    }
  }

  const merged = mergeEnrichment(results, tried)
  const status: EnrichmentResult['status'] = isEnrichmentComplete(merged)
    ? 'complete'
    : (results.length > 0 ? 'partial' : 'failed')

  // 3. Write to cache (fire-and-forget — never block the user).
  setCached(email, { data: merged, raw, status, providersTried: tried }).catch(() => {})

  if (results.length === 0) return FAILED_RESULT(tried)

  return { merged, raw, status, providersTried: tried, fromCache: false }
}
