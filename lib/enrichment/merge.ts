import type { NormalizedPerson, MergedEnrichment, EnrichmentSource } from './types'

// Fields we merge across providers. Order doesn't matter — first non-empty wins.
const FIELDS: (keyof Omit<MergedEnrichment, 'sources' | 'providersTried'>)[] = [
  'firstName', 'lastName', 'fullName',
  'linkedinUrl', 'jobTitle', 'seniority', 'function', 'department',
  'companyName', 'companyDomain', 'companyWebsite', 'companySize', 'companyLinkedinUrl', 'companyLogoUrl',
  'industry', 'subIndustry',
  'country', 'region', 'city',
  'photoUrl', 'headline',
]

/**
 * Merge an ordered list of NormalizedPerson results into a single MergedEnrichment.
 * Earlier providers win — pass providers in priority order (Apollo first).
 */
export function mergeEnrichment(
  results: (NormalizedPerson | null)[],
  providersTried: EnrichmentSource[],
): MergedEnrichment {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged: any = { sources: {}, providersTried }
  for (const r of results) {
    if (!r) continue
    for (const f of FIELDS) {
      if (merged[f]) continue
      const v = (r as unknown as Record<string, unknown>)[f as string]
      if (typeof v === 'string' && v.trim()) {
        merged[f] = v
        merged.sources[f] = r.source
      }
    }
  }
  return merged as MergedEnrichment
}

/** Did we find enough to consider enrichment "complete"? */
export function isEnrichmentComplete(m: MergedEnrichment): boolean {
  return !!m.linkedinUrl && (!!m.jobTitle || !!m.seniority)
}

/** Did we find anything at all? */
export function isEnrichmentPartial(m: MergedEnrichment): boolean {
  return !!m.linkedinUrl || !!m.jobTitle || !!m.companyName || !!m.industry
}
