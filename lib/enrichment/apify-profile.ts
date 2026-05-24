import type { Provider, NormalizedPerson } from './types'

// LinkedIn profile scraping via Apify.
//
// Actor list is configurable via APIFY_LINKEDIN_ACTOR (comma-separated slugs).
// Default chain is proven LinkedIn profile scrapers (no cookies required).
//
// All URLs normalised to https:// — most actors reject http://.

const APIFY_API = 'https://api.apify.com/v2'
const SYNC_TIMEOUT_MS = 120_000

function getActorList(): string[] {
  const env = process.env.APIFY_LINKEDIN_ACTOR
  if (env && env.trim()) {
    return env.split(',').map(s => s.trim()).filter(Boolean)
  }
  // Default chain — CP1SVZfEwWflrmWCX is your pinned actor and works once we
  // pass the required `profileScraperMode`. dev_fusion is a fallback that
  // requires one-time permission approval per the Apify console.
  return [
    'CP1SVZfEwWflrmWCX',                     // your pinned — primary
    'dev_fusion~Linkedin-Profile-Scraper',   // backup (requires console approval)
  ]
}

interface ApifyProfileItem {
  // Defensive union — actors vary in output shape
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
  profilePic?: string
  profileImage?: string
  location?: string
  addressWithCountry?: string
  locationName?: string
  country?: string
  city?: string
  geo?: { country?: string; city?: string; state?: string }
  jobTitle?: string
  occupation?: string
  currentPosition?: string | { title?: string; companyName?: string; company?: { name?: string; linkedinUrl?: string; logoUrl?: string; industry?: string } }
  currentCompany?: string | { name?: string; companyName?: string; linkedinUrl?: string; logoUrl?: string; industry?: string }
  companyName?: string
  company?: string | { name?: string; linkedinUrl?: string; logoUrl?: string; industry?: string }
  companyLinkedinUrl?: string
  industry?: string
  experiences?: Array<{ company?: string; companyName?: string; title?: string; subtitle?: string; companyLink1?: string }>
  experience?: Array<{ companyName?: string; company?: { name?: string; linkedinUrl?: string }; title?: string; positionTitle?: string }>
  positions?: Array<{ title?: string; companyName?: string; companyUrl?: string }>
}

function normaliseLinkedInUrl(u?: string): string | undefined {
  if (!u) return undefined
  let url = u.trim()
  if (!url) return undefined
  if (url.startsWith('http://')) url = url.replace(/^http:\/\//, 'https://')
  if (!/^https?:\/\//.test(url)) url = 'https://' + url
  url = url.replace(/^https:\/\/[a-z]{2,3}\.linkedin\.com/, 'https://www.linkedin.com')
  return url.split('?')[0].split('#')[0]
}

function extractLinkedinUrl(p: ApifyProfileItem): string | undefined {
  return p.linkedinUrl || p.url || p.profileUrl
    || (p.publicIdentifier ? `https://www.linkedin.com/in/${p.publicIdentifier}` : undefined)
}

function extractPhoto(p: ApifyProfileItem): string | undefined {
  return p.photoUrl || p.profilePicture || p.profilePictureUrl || p.pictureUrl
    || p.imageUrl || p.profilePic || p.profileImage
}

function extractCurrentCompany(p: ApifyProfileItem): { name?: string; linkedinUrl?: string; logoUrl?: string; industry?: string } {
  if (typeof p.currentPosition === 'object' && p.currentPosition?.company) {
    const c = p.currentPosition.company
    return { name: c.name, linkedinUrl: c.linkedinUrl, logoUrl: c.logoUrl, industry: c.industry }
  }
  if (typeof p.currentCompany === 'object' && p.currentCompany) {
    return { name: p.currentCompany.name || p.currentCompany.companyName, linkedinUrl: p.currentCompany.linkedinUrl, logoUrl: p.currentCompany.logoUrl, industry: p.currentCompany.industry }
  }
  if (typeof p.company === 'object' && p.company) {
    return { name: p.company.name, linkedinUrl: p.company.linkedinUrl, logoUrl: p.company.logoUrl, industry: p.company.industry }
  }
  const name = (typeof p.currentCompany === 'string' ? p.currentCompany : undefined)
    || (typeof p.company === 'string' ? p.company : undefined)
    || p.companyName
    || p.experiences?.[0]?.company || p.experiences?.[0]?.companyName
    || p.experience?.[0]?.companyName || p.experience?.[0]?.company?.name
    || p.positions?.[0]?.companyName
  return { name, linkedinUrl: p.companyLinkedinUrl || p.experiences?.[0]?.companyLink1 || p.experience?.[0]?.company?.linkedinUrl }
}

function extractCurrentTitle(p: ApifyProfileItem): string | undefined {
  if (p.jobTitle) return p.jobTitle
  if (typeof p.currentPosition === 'string') return p.currentPosition
  if (typeof p.currentPosition === 'object' && p.currentPosition?.title) return p.currentPosition.title
  return p.occupation
    || p.experiences?.[0]?.title || p.experiences?.[0]?.subtitle
    || p.experience?.[0]?.title || p.experience?.[0]?.positionTitle
    || p.positions?.[0]?.title
}

interface ActorAttempt {
  actor: string
  httpStatus?: number
  itemCount?: number
  rawSnippet?: string
  error?: string
}

async function tryActor(actorId: string, payload: Record<string, unknown>, token: string): Promise<{ items: ApifyProfileItem[]; attempt: ActorAttempt }> {
  const attempt: ActorAttempt = { actor: actorId }
  try {
    const url = `${APIFY_API}/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${SYNC_TIMEOUT_MS / 1000}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS + 5_000),
    })
    attempt.httpStatus = res.status
    const body = await res.text()
    attempt.rawSnippet = body.slice(0, 400)
    if (!res.ok) {
      console.error(`[apify-profile] ${actorId} HTTP ${res.status}:`, body.slice(0, 300))
      return { items: [], attempt }
    }
    let items: ApifyProfileItem[] = []
    try { items = JSON.parse(body) } catch { /* leave empty */ }
    attempt.itemCount = items.length
    console.log(`[apify-profile] ${actorId} returned ${items.length} items`)
    return { items: Array.isArray(items) ? items : [], attempt }
  } catch (err) {
    attempt.error = String(err)
    console.error(`[apify-profile] ${actorId} threw:`, err)
    return { items: [], attempt }
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
    if (!cleanUrl && !fullName && !email) return null

    // Defensive payload: include every common field-name variant AND the
    // profileScraperMode that CP1SVZfEwWflrmWCX requires.
    const payload: Record<string, unknown> = {
      maxItems: 1,
      maxRequestRetries: 2,
      profileScraperMode: 'Short ($4 per 1k)',   // required by CP1SVZfEwWflrmWCX
    }
    if (cleanUrl) {
      payload.profileUrls = [cleanUrl]
      payload.urls = [cleanUrl]
      payload.linkedinUrls = [cleanUrl]
      payload.startUrls = [{ url: cleanUrl }]
    }
    if (email) payload.emails = [email]
    if (fullName) {
      payload.names = [fullName]
      payload.searchQueries = [fullName]
      payload.queries = [fullName]
    }

    console.log(`[apify-profile] looking up url=${cleanUrl} name=${fullName}`)

    const actors = getActorList()
    const attempts: ActorAttempt[] = []

    for (const actorId of actors) {
      const { items, attempt } = await tryActor(actorId, payload, token)
      attempts.push(attempt)
      if (!items.length) continue
      const p = items[0]
      const company = extractCurrentCompany(p)
      const title = extractCurrentTitle(p)
      const photoUrl = extractPhoto(p)
      const foundLinkedin = extractLinkedinUrl(p) || cleanUrl

      if (!photoUrl && !title && !company.name && !p.fullName) {
        console.log(`[apify-profile] ${actorId} item had no useful fields, trying next`)
        continue
      }

      const loc = p.location || p.addressWithCountry || p.locationName || ''
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
        raw: { actor: actorId, item: p, attempts },
      }
    }

    // All actors exhausted — log diagnostics + return null so the merge stays clean.
    // Stash the attempts on globalThis so the pipeline can surface them in the stage result.
    console.log('[apify-profile] all actors exhausted, attempts:', JSON.stringify(attempts))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__lastApifyProfileAttempts = attempts
    return null
  },
}
