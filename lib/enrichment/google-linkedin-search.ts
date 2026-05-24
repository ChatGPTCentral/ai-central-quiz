// Google → LinkedIn finder via Apify's google-search-scraper.
// https://apify.com/apify/google-search-scraper
//
// Sends ALL candidate queries in a single actor run (newline-separated) so
// Apify only spins up once. Asks for 50 results per query so we see deep
// into the SERP. Then scans every organic result across every query for the
// first linkedin.com profile URL.

const ACTOR_ID = 'apify~google-search-scraper'
const APIFY_API = 'https://api.apify.com/v2'
const SYNC_TIMEOUT_MS = 120_000

// Matches every common LinkedIn profile URL shape, including country
// subdomains, mobile sub-paths, and legacy `/pub/` URLs.
const LINKEDIN_PROFILE_RE = /https?:\/\/(?:[a-z]{2,3}\.)?(?:www\.|m\.)?linkedin\.com\/(?:in|pub|profile\/view)\/[^\s?&#"<>'`)]+/i

interface OrganicResult {
  url?: string
  link?: string
  href?: string
  title?: string
  description?: string
  snippet?: string
  displayedUrl?: string
}

interface ApifyGoogleResult {
  searchQuery?: { term?: string; url?: string }
  url?: string
  organicResults?: OrganicResult[]
}

export interface GoogleSearchInput {
  name?: string
  email?: string
  companyName?: string
  jobTitle?: string
  country?: string
}

export interface GoogleSearchResult {
  linkedinUrl?: string
  query?: string
  title?: string
  description?: string
  triedQueries: string[]
  organicSample?: { url: string; title?: string; query?: string }[]
}

function buildQueries(input: GoogleSearchInput): string[] {
  const name = input.name?.trim()
  const email = input.email?.trim()
  const company = input.companyName?.trim()
  const title = input.jobTitle?.trim()
  const country = input.country?.trim()
  const out: string[] = []
  const push = (q: string) => { const t = q.trim().replace(/\s+/g, ' '); if (t && !out.includes(t)) out.push(t) }

  // Order: most-specific → least-specific. Plain, human-style queries —
  // the kind that surface LinkedIn at the top of Google's natural ranking.
  if (name && company)        push(`${name} ${company} linkedin`)
  if (name && title)          push(`${name} ${title} linkedin`)
  if (name && country)        push(`${name} ${country} linkedin`)
  if (name && email)          push(`${name} ${email}`)
  if (name && company)        push(`${name} ${company}`)
  if (email)                  push(email)
  if (name)                   push(`${name} linkedin`)
  if (name)                   push(name)
  return out.slice(0, 8) // cap to 8 queries per row
}

function resultUrl(r: OrganicResult): string {
  return r.url || r.link || r.href || r.displayedUrl || ''
}

export async function findLinkedInViaGoogle(input: GoogleSearchInput): Promise<GoogleSearchResult> {
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN
  if (!token) return { triedQueries: [] }

  const queries = buildQueries(input)
  if (queries.length === 0) return { triedQueries: [] }

  // SINGLE actor call, newline-separated queries — the actor runs them in
  // batch and returns one dataset item per query.
  try {
    const url = `${APIFY_API}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${SYNC_TIMEOUT_MS / 1000}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: queries.join('\n'),
        resultsPerPage: 50,
        maxPagesPerQuery: 1,
        languageCode: 'en',
        mobileResults: false,
        saveHtml: false,
      }),
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS + 5_000),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('Apify google search error:', res.status, errText.slice(0, 500))
      return { triedQueries: queries }
    }
    const items: ApifyGoogleResult[] = await res.json()

    // Flatten all organic results across all queries, tagging each with its source query.
    const allOrganic: { url: string; title?: string; query?: string }[] = []
    for (const block of items) {
      const term = block.searchQuery?.term
      for (const r of block.organicResults || []) {
        const u = resultUrl(r)
        if (u) allOrganic.push({ url: u, title: r.title, query: term })
      }
    }

    // First LinkedIn profile URL wins.
    for (const o of allOrganic) {
      const m = o.url.match(LINKEDIN_PROFILE_RE)
      if (m) {
        // Strip query string for cleanliness
        const clean = m[0].split('?')[0].split('#')[0]
        return {
          linkedinUrl: clean,
          query: o.query,
          title: o.title,
          triedQueries: queries,
          organicSample: allOrganic.slice(0, 8),
        }
      }
    }

    return { triedQueries: queries, organicSample: allOrganic.slice(0, 8) }
  } catch (err) {
    console.error('Apify google search threw:', err)
    return { triedQueries: queries }
  }
}
