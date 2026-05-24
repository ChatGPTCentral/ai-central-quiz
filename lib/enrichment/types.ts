export type EnrichmentSource = 'apollo' | 'databar' | 'wiza' | 'apify' | 'apify_profile'

export interface NormalizedPerson {
  source: EnrichmentSource
  firstName?: string
  lastName?: string
  fullName?: string
  linkedinUrl?: string
  jobTitle?: string
  seniority?: string
  function?: string
  department?: string
  companyName?: string
  companyDomain?: string
  companySize?: string
  companyLinkedinUrl?: string
  companyLogoUrl?: string
  industry?: string
  subIndustry?: string
  country?: string
  region?: string
  city?: string
  photoUrl?: string
  headline?: string
  raw: unknown
}

// The merged enrichment payload stored in the submission row
export interface MergedEnrichment {
  // Same shape as NormalizedPerson but `source` is replaced with a per-field map
  firstName?: string
  lastName?: string
  fullName?: string
  linkedinUrl?: string
  jobTitle?: string
  seniority?: string
  function?: string
  department?: string
  companyName?: string
  companyDomain?: string
  companySize?: string
  companyLinkedinUrl?: string
  companyLogoUrl?: string
  industry?: string
  subIndustry?: string
  country?: string
  region?: string
  city?: string
  photoUrl?: string
  headline?: string
  /** Which provider provided each field */
  sources: Partial<Record<keyof Omit<MergedEnrichment, 'sources'>, EnrichmentSource>>
  /** Providers we attempted, in order */
  providersTried: EnrichmentSource[]
}

export interface LookupContext {
  email: string
  /** Known full name from the row (or derived from earlier providers). */
  name?: string
  /** Known LinkedIn profile URL from the row. */
  linkedinUrl?: string
  /** Known company name (used by search-based actors). */
  companyName?: string
  /** Partial merge built up from earlier providers — used by Apify search. */
  partial?: MergedEnrichment
}

export interface Provider {
  name: EnrichmentSource
  /** True if this provider is slow / paid-per-call — skipped in live submit-quiz path. */
  slow?: boolean
  lookup(ctx: LookupContext): Promise<NormalizedPerson | null>
}
