import type { Provider, NormalizedPerson } from './types'

// Apify actor: CP1SVZfEwWflrmWCX
// https://console.apify.com/actors/CP1SVZfEwWflrmWCX/input
//
// Used by the row-level enrichment "sudoku" — feeds whatever signal we have
// (name + email + linkedin URL) and tries to land the canonical LinkedIn
// profile, including the real face photo.

const ACTOR_ID = 'CP1SVZfEwWflrmWCX'
const APIFY_API = 'https://api.apify.com/v2'
const SYNC_TIMEOUT_MS = 120_000

// Defensive shape — the actor's output varies between versions; read every
// field we might recognize.
interface ApifyProfileItem {
  fullName?: string
  firstName?: string
  lastName?: string
  publicIdentifier?: string
  linkedinUrl?: string
  url?: string
  profileUrl?: string
  headline?: string
  about?: string
  summary?: string
  photoUrl?: string
  profilePicture?: string
  profilePictureUrl?: string
  pictureUrl?: string
  imageUrl?: string
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
  email?: string
}

function extractLinkedinUrl(p: ApifyProfileItem): string | undefined {
  return p.linkedinUrl
    || p.url
    || p.profileUrl
    || (p.publicIdentifier ? `https://www.linkedin.com/in/${p.publicIdentifier}` : undefined)
}

function extractPhoto(p: ApifyProfileItem): string | undefined {
  return p.photoUrl || p.profilePicture || p.profilePictureUrl || p.pictureUrl || p.imageUrl
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

export const apifyProfileProvider: Provider = {
  name: 'apify_profile',
  slow: true,
  async lookup({ email, name, linkedinUrl, partial }): Promise<NormalizedPerson | null> {
    const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY
    if (!token) return null

    // Build the strongest possible input. The actor accepts several optional
    // fields — we provide everything we have and let it pick.
    const fullName = name || partial?.fullName
    const profileUrl = linkedinUrl || partial?.linkedinUrl

    // Need at least one signal to look up — bail otherwise.
    if (!fullName && !email && !profileUrl) return null

    const input: Record<string, unknown> = {
      maxItems: 1,
    }
    if (profileUrl) input.profileUrls = [profileUrl]
    if (email) input.emails = [email]
    if (fullName) {
      input.searchQueries = [fullName]
      input.names = [fullName]
    }

    try {
      const url = `${APIFY_API}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${SYNC_TIMEOUT_MS / 1000}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(SYNC_TIMEOUT_MS + 5_000),
      })
      if (!res.ok) {
        console.error('Apify profile actor error:', res.status, await res.text().catch(() => ''))
        return null
      }
      const items: ApifyProfileItem[] = await res.json()
      if (!items?.length) return null
      const p = items[0]
      const company = extractCompany(p)
      const loc = p.location || p.locationName || ''

      return {
        source: 'apify_profile',
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: p.fullName,
        linkedinUrl: extractLinkedinUrl(p),
        jobTitle: p.jobTitle || p.currentPosition,
        companyName: company.name,
        companyLinkedinUrl: company.linkedinUrl,
        companyLogoUrl: company.logoUrl,
        industry: p.industry,
        country: p.geo?.country || p.country || loc.split(',').pop()?.trim(),
        region: p.geo?.state,
        city: p.geo?.city || p.city || loc.split(',')[0]?.trim(),
        photoUrl: extractPhoto(p),
        headline: p.headline || p.about || p.summary,
        raw: p,
      }
    } catch (err) {
      console.error('Apify profile enrichment failed:', err)
      return null
    }
  },
}
