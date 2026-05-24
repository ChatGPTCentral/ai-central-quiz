import type { Provider, NormalizedPerson } from './types'

// LinkedIn profile scraping via Apify.
//
// We try TWO actors in sequence — the user-specified CP1SVZfEwWflrmWCX first,
// and harvestapi's well-known LinkedIn Profile Scraper as a fallback. Different
// actors expect slightly different input field names, so we send a defensive
// payload that covers the common variants (`profileUrls`, `urls`, `queries`).
//
// All LinkedIn URLs are normalised to https:// since most actors reject http://.

const ACTORS = [
  'CP1SVZfEwWflrmWCX',                       // user-specified actor
  'harvestapi~linkedin-profile-scraper',     // robust backup (no cookies)
  '2SyF0bVxmgGr8IVCZ',                       // another harvestapi actor id
]

const APIFY_API = 'https://api.apify.com/v2'
const SYNC_TIMEOUT_MS = 120_000

interface ApifyProfileItem {
  // Output shape varies between actors; we read every field name we recognise.
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
  occupation?: string
  currentPosition?: string | { title?: string; companyName?: string; company?: { name?: string; linkedinUrl?: string; logoUrl?: string; industry?: string } }
  currentCompany?: string | { name?: string; companyName?: string; linkedinUrl?: string; logoUrl?: string; industry?: string }
  companyName?: string
  companyLinkedinUrl?: string
  industry?: string
  experience?: Array<{ companyName?: string; company?: { name?: string; linkedinUrl?: string }; title?: string; positionTitle?: string }>
  positions?: Array<{ title?: string; companyName?: string; companyUrl?: string }>
  email?: string
}

function normaliseLinkedInUrl(u?: string): string | undefined {
  if (!u) return undefined
  let url = u.trim()
  if (!url) return undefined
  if (url.startsWith('http://')) url = url.replace(/^http:\/\//, 'https://')
  if (!/^https?:\/\//.test(url)) url = 'https://' + url
  // Normalise country subdomains (uk.linkedin.com → www.linkedin.com) for actor acceptance
  url = url.replace(/^https:\/\/[a-z]{2,3}\.linkedin\.com/, 'https://www.linkedin.com')
  return url.split('?')[0].split('#')[0]
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

function extractCurrentCompany(p: ApifyProfileItem): { name?: string; linkedinUrl?: string; logoUrl?: string; industry?: string } {
  // Try the structured currentPosition.company
  if (typeof p.currentPosition === 'object' && p.currentPosition?.company) {
    const c = p.currentPosition.company
    return {
      name: c.name,
      linkedinUrl: c.linkedinUrl,
      logoUrl: c.logoUrl,
      industry: c.industry,
    }
  }
  if (typeof p.currentCompany === 'object' && p.currentCompany) {
    return {
      name: p.currentCompany.name || p.currentCompany.companyName,
      linkedinUrl: p.currentCompany.linkedinUrl,
      logoUrl: p.currentCompany.logoUrl,
      industry: p.currentCompany.industry,
    }
  }
  // Fall back to flat fields
  const name = (typeof p.currentCompany === 'string' ? p.currentCompany : undefined)
    || p.companyName
    // First experience entry as last resort
    || p.experience?.[0]?.companyName
    || p.experience?.[0]?.company?.name
    || p.positions?.[0]?.companyName
  return { name, linkedinUrl: p.companyLinkedinUrl || p.experience?.[0]?.company?.linkedinUrl }
}

function extractCurrentTitle(p: ApifyProfileItem): string | undefined {
  if (p.jobTitle) return p.jobTitle
  if (typeof p.currentPosition === 'string') return p.currentPosition
  if (typeof p.currentPosition === 'object' && p.currentPosition?.title) return p.currentPosition.title
  return p.occupation
    || p.experience?.[0]?.title
    || p.experience?.[0]?.positionTitle
    || p.positions?.[0]?.title
}

async function tryActor(actorId: string, payload: Record<string, unknown>, token: string): Promise<ApifyProfileItem[] | null> {
  try {
    const url = `${APIFY_API}/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${SYNC_TIMEOUT_MS / 1000}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS + 5_000),
    })
    const body = await res.text()
    if (!res.ok) {
      console.error(`[apify-profile] actor ${actorId} → HTTP ${res.status}:`, body.slice(0, 300))
      return null
    }
    try {
      const items = JSON.parse(body) as ApifyProfileItem[]
      console.log(`[apify-profile] actor ${actorId} returned ${items?.length || 0} items`)
      return Array.isArray(items) ? items : null
    } catch {
      console.error(`[apify-profile] actor ${actorId} returned non-JSON:`, body.slice(0, 300))
      return null
    }
  } catch (err) {
    console.error(`[apify-profile] actor ${actorId} threw:`, err)
    return null
  }
}

export const apifyProfileProvider: Provider = {
  name: 'apify_profile',
  slow: true,
  async lookup({ email, name, linkedinUrl, partial }): Promise<NormalizedPerson | null> {
    const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY
    if (!token) {
      console.warn('[apify-profile] no APIFY_API_KEY / APIFY_TOKEN set — skipping')
      return null
    }

    const cleanUrl = normaliseLinkedInUrl(linkedinUrl || partial?.linkedinUrl)
    const fullName = name || partial?.fullName
    if (!cleanUrl && !fullName && !email) {
      console.log('[apify-profile] no signal to look up — skipping')
      return null
    }

    // Defensive payload: include every common field-name variant. Each actor
    // ignores fields it doesn't recognise.
    const payload: Record<string, unknown> = { maxItems: 1 }
    if (cleanUrl) {
      payload.profileUrls = [cleanUrl]
      payload.urls = [cleanUrl]
      payload.linkedinUrls = [cleanUrl]
      payload.profileScraperMode = 'Short ($4 per 1k)'
    }
    if (email) payload.emails = [email]
    if (fullName) {
      payload.names = [fullName]
      payload.searchQueries = [fullName]
      payload.queries = [fullName]
    }

    console.log(`[apify-profile] looking up url=${cleanUrl || '(none)'} name=${fullName || '(none)'}`)

    // Try actors in sequence; return the first one that produces a result.
    for (const actorId of ACTORS) {
      const items = await tryActor(actorId, payload, token)
      if (!items?.length) continue
      const p = items[0]
      const company = extractCurrentCompany(p)
      const title = extractCurrentTitle(p)
      const photoUrl = extractPhoto(p)
      const foundLinkedin = extractLinkedinUrl(p) || cleanUrl

      // If the item has literally no useful fields, treat as miss
      if (!photoUrl && !title && !company.name && !p.fullName) {
        console.log(`[apify-profile] actor ${actorId} returned item but no useful fields`)
        continue
      }

      const loc = p.location || p.locationName || ''
      return {
        source: 'apify_profile',
        firstName: p.firstName,
        lastName: p.lastName,
        fullName: p.fullName,
        linkedinUrl: foundLinkedin,
        jobTitle: title,
        companyName: company.name,
        companyLinkedinUrl: company.linkedinUrl,
        companyLogoUrl: company.logoUrl,
        industry: p.industry || company.industry,
        country: p.geo?.country || p.country || loc.split(',').pop()?.trim(),
        region: p.geo?.state,
        city: p.geo?.city || p.city || loc.split(',')[0]?.trim(),
        photoUrl,
        headline: p.headline || p.about || p.summary,
        raw: { actor: actorId, item: p },
      }
    }

    console.log('[apify-profile] all actors exhausted, no profile data extracted')
    return null
  },
}
