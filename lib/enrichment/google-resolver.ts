// Verified Google → identity resolver (shadow of google-linkedin-search).
//
// The live findLinkedInViaGoogle grabs the FIRST linkedin.com/in URL it sees,
// with no check that it's the right person — which is how a Gmail "John Smith"
// gets attached to some unrelated John Smith (the Kafein contamination class of
// bug). This resolver mimics manual research instead:
//
//   1. Run the owner's query combos: "{first} {last} {title}",
//      "{first} {last} linkedin", "{first} {last} linkedin {country}",
//      plus company/email variants.
//   2. Collect the organic results WITH their snippets.
//   3. Ask an LLM to READ the snippets and decide which result (if any) is
//      THIS EXACT person, corroborated by title/company/country. It returns a
//      confidence; below the threshold we accept NOTHING (unresolved beats
//      wrong).
//
// Nothing here touches the live pipeline unless runV2 is called with
// { verifiedResolver: true }.

const ACTOR_ID = 'apify~google-search-scraper'
const APIFY_API = 'https://api.apify.com/v2'
const SYNC_TIMEOUT_MS = 120_000
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'
const ACCEPT_THRESHOLD = 0.7

// Same profile-URL matcher as the live finder: rejects /pub/dir/ disambiguation
// listings, which are NOT profiles.
const LINKEDIN_PROFILE_RE = /https?:\/\/(?:[a-z]{2,3}\.)?(?:www\.|m\.)?linkedin\.com\/(?:(?:in|profile\/view)\/[^\s?&#"<>'`)]+|pub\/(?!dir\/)[^\s?&#"<>'`)]+)/i

export interface ResolverInput {
  name?: string
  email?: string
  companyName?: string
  jobTitle?: string
  country?: string
}

export interface SerpCandidate {
  url: string
  title?: string
  snippet?: string
  query?: string
  isLinkedin: boolean
}

export interface ResolverResult {
  linkedinUrl?: string
  companyName?: string
  jobTitle?: string
  country?: string
  confidence: number
  reasoning: string
  matchedQuery?: string
  triedQueries: string[]
  candidates: SerpCandidate[]
  /** 'matched' | 'rejected' (found candidates but none confident) | 'no_results' | 'unconfigured' | 'error' */
  outcome: 'matched' | 'rejected' | 'no_results' | 'unconfigured' | 'error'
}

function splitName(name?: string): { first?: string; last?: string } {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { first: parts[0] }
  return { first: parts[0], last: parts[parts.length - 1] }
}

/** The owner's manual-research combos, most-specific first, deduped, capped. */
export function buildResolverQueries(input: ResolverInput): string[] {
  const { first, last } = splitName(input.name)
  const full = [first, last].filter(Boolean).join(' ')
  const title = input.jobTitle?.trim()
  const company = input.companyName?.trim()
  const country = input.country?.trim()
  const out: string[] = []
  const push = (q?: string) => {
    const t = (q || '').trim().replace(/\s+/g, ' ')
    if (t && full && !out.includes(t)) out.push(t)
  }

  push(company && `${full} ${company} linkedin`)
  push(title && `${full} ${title}`)
  push(title && `${full} ${title} linkedin`)
  push(country && `${full} linkedin ${country}`)
  push(`${full} linkedin`)
  push(company && `${full} ${company}`)
  return out.slice(0, 6)
}

interface OrganicResult { url?: string; link?: string; href?: string; title?: string; description?: string; snippet?: string; displayedUrl?: string }
interface ApifyGoogleResult { searchQuery?: { term?: string }; organicResults?: OrganicResult[] }

async function fetchSerp(queries: string[]): Promise<SerpCandidate[]> {
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY
  if (!token) throw new Error('APIFY token not configured')
  const url = `${APIFY_API}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${SYNC_TIMEOUT_MS / 1000}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queries: queries.join('\n'),
      resultsPerPage: 10,
      maxPagesPerQuery: 1,
      languageCode: 'en',
      mobileResults: false,
      saveHtml: false,
      includeUnfilteredResults: false,
    }),
    signal: AbortSignal.timeout(SYNC_TIMEOUT_MS + 5_000),
  })
  if (!res.ok) throw new Error(`Apify google search ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const items: ApifyGoogleResult[] = await res.json()
  const out: SerpCandidate[] = []
  for (const block of items) {
    const term = block.searchQuery?.term
    for (const r of (block.organicResults || []).slice(0, 6)) {
      const u = r.url || r.link || r.href || r.displayedUrl || ''
      if (!u) continue
      out.push({ url: u, title: r.title, snippet: r.description || r.snippet, query: term, isLinkedin: LINKEDIN_PROFILE_RE.test(u) })
    }
  }
  return out
}

interface LlmVerdict { matchIndex: number | null; linkedinUrl: string | null; company: string | null; title: string | null; country: string | null; confidence: number; reasoning: string }

async function verifyMatch(input: ResolverInput, candidates: SerpCandidate[]): Promise<LlmVerdict | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  // Only show the LLM candidates that carry some signal; number them for reference.
  const list = candidates
    .map((c, i) => `[${i}] query="${c.query || ''}"\n  title: ${c.title || '(none)'}\n  url: ${c.url}\n  snippet: ${c.snippet || '(none)'}`)
    .join('\n')
  const known = [
    input.name && `name: ${input.name}`,
    input.jobTitle && `title (from quiz/enrichment): ${input.jobTitle}`,
    input.companyName && `company: ${input.companyName}`,
    input.country && `country: ${input.country}`,
    input.email && `email domain: ${(input.email.split('@')[1] || '')}`,
  ].filter(Boolean).join('\n')

  const prompt = `You are verifying a person's identity from Google search results, the way a careful researcher does: only accept a result if you are confident it is the SAME person, corroborated by matching name AND at least one of title / company / country / email-domain. When results are ambiguous or could be a different person with the same name, DO NOT guess.

KNOWN about the person:
${known || '(only a name)'}

SEARCH RESULTS:
${list}

Return ONLY a JSON object, no markdown:
{"matchIndex": <index of the single best matching result, or null if none is a confident match>,
 "linkedinUrl": <the linkedin.com/in profile URL of the match, or null>,
 "company": <employer inferred from the matched result, or null>,
 "title": <job title inferred from the matched result, or null>,
 "country": <country inferred from the matched result, or null>,
 "confidence": <0.0-1.0, your probability this is the correct person>,
 "reasoning": "<one sentence: what corroborated or what made it ambiguous>"}`

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) { console.error('resolver LLM error', res.status); return null }
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    const jsonStr = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const start = jsonStr.indexOf('{'); const end = jsonStr.lastIndexOf('}')
    if (start < 0 || end < 0) return null
    const parsed = JSON.parse(jsonStr.slice(start, end + 1)) as LlmVerdict
    return parsed
  } catch (err) {
    console.error('resolver LLM threw', err)
    return null
  }
}

/** Resolve a person's identity via verified Google search. Fail-open: any
 *  error returns an unresolved result, never throws into the pipeline. */
export async function resolveIdentityViaGoogle(input: ResolverInput): Promise<ResolverResult> {
  const queries = buildResolverQueries(input)
  const base: ResolverResult = { confidence: 0, reasoning: '', triedQueries: queries, candidates: [], outcome: 'no_results' }
  if (queries.length === 0) return { ...base, outcome: 'unconfigured', reasoning: 'no name to search on' }

  let candidates: SerpCandidate[]
  try {
    candidates = await fetchSerp(queries)
  } catch (err) {
    return { ...base, outcome: 'error', reasoning: String(err).slice(0, 160) }
  }
  if (candidates.length === 0) return base

  const verdict = await verifyMatch(input, candidates)
  if (!verdict) {
    // LLM unavailable → conservative fallback: accept a LinkedIn URL ONLY when
    // exactly one distinct profile appears across all queries (weak signal).
    const profiles = Array.from(new Set(candidates.filter(c => c.isLinkedin).map(c => c.url.split('?')[0].split('#')[0])))
    if (profiles.length === 1) {
      return { ...base, linkedinUrl: profiles[0], confidence: 0.5, reasoning: 'LLM unavailable; single distinct LinkedIn profile across all queries', outcome: 'matched', candidates }
    }
    return { ...base, reasoning: `LLM unavailable; ${profiles.length} distinct profiles, not resolving`, outcome: 'rejected', candidates }
  }

  const conf = Math.max(0, Math.min(1, Number(verdict.confidence) || 0))
  if (conf < ACCEPT_THRESHOLD || verdict.matchIndex == null) {
    return { ...base, confidence: conf, reasoning: verdict.reasoning || 'below confidence threshold', outcome: 'rejected', candidates }
  }
  const matched = candidates[verdict.matchIndex]
  const linkedinUrl = (verdict.linkedinUrl && LINKEDIN_PROFILE_RE.test(verdict.linkedinUrl))
    ? verdict.linkedinUrl.split('?')[0].split('#')[0]
    : (matched?.isLinkedin ? matched.url.split('?')[0].split('#')[0] : undefined)

  return {
    linkedinUrl,
    companyName: verdict.company || undefined,
    jobTitle: verdict.title || undefined,
    country: verdict.country || undefined,
    confidence: conf,
    reasoning: verdict.reasoning || '',
    matchedQuery: matched?.query,
    triedQueries: queries,
    candidates,
    outcome: 'matched',
  }
}
