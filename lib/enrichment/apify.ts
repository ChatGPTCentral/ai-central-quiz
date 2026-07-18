import type { Provider, NormalizedPerson } from './types'

// Apify actor: M2FMdjRVeF1HPGFcc — "LinkedIn Profile Search Scraper No Cookies"
// https://console.apify.com/actors/M2FMdjRVeF1HPGFcc/input
//
// Use case: when earlier providers (Apollo) gave us a name + company
// but no LinkedIn URL, search LinkedIn by "<name> <company>" and grab the top hit.
// Skipped entirely if neither name nor company are available.

const ACTOR_ID = 'M2FMdjRVeF1HPGFcc'
const APIFY_API = 'https://api.apify.com/v2'
const SYNC_TIMEOUT_MS = 90_000 // 90s — actor can take 30-60s

interface ApifyProfileItem {
  // The actor's output shape varies between versions; we read defensively.
  fullName?: string
  firstName?: string
  lastName?: string
  publicIdentifier?: string
  linkedinUrl?: string
  url?: string
  profileUrl?: string
  headline?: string
  about?: string
  photoUrl?: string
  profilePicture?: string
  pictureUrl?: string
  location?: string
  locationName?: string
  country?: string
  city?: string
  geo?: { country?: string; city?: string; state?: string }
  jobTitle?: string
  currentPosition?: string
  currentCompany?: string | { name?: string; companyName?: string; linkedinUrl?: string; logoUrl?: string }
  companyName?: string
  companyLinkedinUrl?: string
  industry?: string
}

function buildQuery(name?: string, company?: string): string | undefined {
  const n = (name || '').trim()
  const c = (company || '').trim()
  if (n && c) return `${n} ${c}`
  if (n) return n
  if (c) return c
  return undefined
}

function extractLinkedinUrl(p: ApifyProfileItem): string | undefined {
  return p.linkedinUrl
    || p.url
    || p.profileUrl
    || (p.publicIdentifier ? `https://www.linkedin.com/in/${p.publicIdentifier}` : undefined)
}

function extractCompany(p: ApifyProfileItem): { name?: string; linkedinUrl?: string; logoUrl?: string } {
  if (typeof p.currentCompany === 'object' && p.currentCompany) {
    return {
      name: p.currentCompany.name || p.currentCompany.companyName,
      linkedinUrl: p.currentCompany.linkedinUrl,
      logoUrl: p.currentCompany.logoUrl,
    }
  }
  return {
    name: (typeof p.currentCompany === 'string' ? p.currentCompany : undefined) || p.companyName,
    linkedinUrl: p.companyLinkedinUrl,
  }
}

export const apifyProvider: Provider = {
  name: 'apify',
  slow: true,
  async lookup({ partial }): Promise<NormalizedPerson | null> {
    const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY
    if (!token) return null

    const query = buildQuery(partial?.fullName, partial?.companyName)
    if (!query) return null  // Need at least a name or company to search

    try {
      const url = `${APIFY_API}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${SYNC_TIMEOUT_MS / 1000}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueries: [query],
          maxItems: 1,
          profileScraperMode: 'Short ($4 per 1k)',
        }),
        // Long-running — give the actor up to its timeout
        signal: AbortSignal.timeout(SYNC_TIMEOUT_MS + 5_000),
      })
      if (!res.ok) {
        console.error('Apify error:', res.status, await res.text().catch(() => ''))
        return null
      }
      const items: ApifyProfileItem[] = await res.json()
      if (!items?.length) return null
      const p = items[0]

      const company = extractCompany(p)
      const linkedinUrl = extractLinkedinUrl(p)

      // Parse location string fallback if no structured geo
      const loc = p.location || p.locationName || ''
      const geoCountry = p.geo?.country || p.country || (loc.split(',').pop()?.trim() || undefined)
      const geoCity = p.geo?.city || p.city || (loc.split(',')[0]?.trim() || undefined)
      const geoRegion = p.geo?.state

      return {
        source: 'apify',
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: p.fullName,
        linkedinUrl,
        jobTitle: p.jobTitle || p.currentPosition,
        companyName: company.name,
        companyLinkedinUrl: company.linkedinUrl,
        companyLogoUrl: company.logoUrl,
        industry: p.industry,
        country: geoCountry,
        region: geoRegion,
        city: geoCity,
        photoUrl: p.photoUrl || p.profilePicture || p.pictureUrl,
        headline: p.headline || p.about,
        raw: p,
      }
    } catch (err) {
      console.error('Apify enrichment failed:', err)
      return null
    }
  },
}
