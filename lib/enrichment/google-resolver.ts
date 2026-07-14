// Verified Google → identity resolver (shadow of google-linkedin-search).
//
// Tuned from the owner's labeling game (rounds 1-2, 322 labels). It mimics how
// the owner actually researches a person from thin data:
//   - Corporate email? the domain IS the employer → site:{domain} {name} and
//     a "{name} {company-from-domain}" query, and the domain corroborates.
//   - Free email + common name? the email HANDLE often carries the missing
//     surname ("atruebayanes" → Trueba Yanes) or a keyword ("…freelance"),
//     and the quiz's job level / work area corroborate ("student" → a
//     university profile).
//   - Trust Google's top-ranked LinkedIn result when the name (incl. the
//     vanity URL), country and role are consistent — only refuse when several
//     distinct same-name people fit equally and nothing disambiguates.
//
// Round-2 precision guards, from the owner's own red flags on the 20 false
// positives (14 of them high-confidence):
//   - A vanity slug that only matches the email HANDLE (not the name) is NOT
//     proof — handles are reused and point to the wrong person.
//   - A work email whose company is nowhere near the chosen profile means the
//     wrong same-name person → dock confidence toward abstain.
//   - A domain that is the person's own name is a personal/brand site, not an
//     employer (mikehooper.com), so it never corroborates.
//   - Handle tokens disambiguate: a Jr/Sr suffix (richwhitneyjr), a middle
//     initial or a birth year (davidwiverson1960) must fit the chosen profile.
//   - Only return a profile that actually appeared in the results (no invented
//     vanity URLs); plenty of people simply have no LinkedIn — abstain.
//
// Below the confidence threshold it still accepts NOTHING (unresolved beats
// the wrong person). Nothing here runs unless runV2 gets { verifiedResolver }.

const ACTOR_ID = 'apify~google-search-scraper'
const APIFY_API = 'https://api.apify.com/v2'
const SYNC_TIMEOUT_MS = 120_000
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'
const ACCEPT_THRESHOLD = 0.55

const FREE_EMAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'aol.com', 'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'qq.com', '163.com'])

// Matches LinkedIn profile URLs; rejects /pub/dir/ disambiguation listings.
const LINKEDIN_PROFILE_RE = /https?:\/\/(?:[a-z]{2,3}\.)?(?:www\.|m\.)?linkedin\.com\/(?:(?:in|profile\/view)\/[^\s?&#"<>'`)]+|pub\/(?!dir\/)[^\s?&#"<>'`)]+)/i

export interface ResolverInput {
  name?: string
  email?: string
  companyName?: string
  jobTitle?: string
  country?: string
  jobLevel?: string
  workArea?: string
}

export interface SerpCandidate {
  url: string
  title?: string
  snippet?: string
  query?: string
  rank?: number
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
  outcome: 'matched' | 'rejected' | 'no_results' | 'unconfigured' | 'error'
}

function splitName(name?: string): { first?: string; last?: string } {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { first: parts[0] }
  return { first: parts[0], last: parts[parts.length - 1] }
}

interface EmailParts {
  domain?: string
  isFree: boolean
  isPersonalDomain?: boolean
  companyGuess?: string
  expandedName?: string
  keyword?: string
  suffix?: string        // jr / sr / iii carried in the handle (richwhitneyjr)
  middleInitial?: string // lone initial between first and last (davidWiverson)
  birthYear?: number     // a 4-digit run that reads as a birth year (…1960)
}

// Longest-first so "iii" wins over "ii" when we peel a glued suffix.
const NAME_SUFFIXES = ['iii', 'jnr', 'snr', 'jr', 'sr', 'ii', 'iv']

/** Pull the research signals the owner reads out of an email address. */
export function parseEmail(email: string | undefined, name: string | undefined): EmailParts {
  const e = (email || '').trim().toLowerCase()
  const at = e.indexOf('@')
  if (at < 0) return { isFree: false }
  const local = e.slice(0, at)
  const domain = e.slice(at + 1)
  const isFree = FREE_EMAIL.has(domain)
  const { first, last } = splitName(name)
  const firstLc = (first || '').toLowerCase(), lastLc = (last || '').toLowerCase()
  const alpha = local.replace(/[^a-z]/g, '')

  // Is the domain the person's OWN name (a personal/brand site like
  // mikehooper.com) rather than a real employer? Then it never corroborates.
  const root = domain ? domain.split('.')[0] : ''
  const isPersonalDomain = !isFree && !!root && (
    (lastLc.length >= 4 && root.includes(lastLc)) ||
    (firstLc.length >= 3 && lastLc.length >= 3 && root.includes(firstLc) && root.includes(lastLc))
  )

  // Non-free, non-personal domain → employer. "gpa-innovates.com" → "gpa innovates".
  let companyGuess: string | undefined
  if (!isFree && !isPersonalDomain && root && root.length >= 3) {
    companyGuess = root.replace(/[-_]+/g, ' ')
  }

  // Handle tokens → an expanded name (missing surname) and/or a keyword.
  let expandedName: string | undefined
  if (last) {
    const li = alpha.indexOf(lastLc)
    if (li >= 0) {
      const after = alpha.slice(li + last.length)
      // Extra alpha after the surname is likely a second surname (Trueba
      // Yanes). Skip when it's just the first name repeated (last.first emails).
      if (after.length >= 3 && /^[a-z]+$/.test(after) && after !== firstLc) {
        expandedName = [first, last, after].filter(Boolean).join(' ')
      }
    }
  }
  let keyword: string | undefined
  const tokens = local.split(/[._\-+]+/).filter(t => /^[a-z]{4,}$/.test(t))
  const nameLc = `${first || ''}${last || ''}`.toLowerCase()
  for (const t of tokens) {
    if (t === 'freelance') { keyword = t; break }
    if (!nameLc.includes(t) && !t.includes(lastLc)) { keyword = t; break }
  }

  // Disambiguation tokens the owner uses by hand.
  let suffix: string | undefined
  const rawTokens = local.split(/[._\-+0-9]+/).filter(Boolean)
  const lastTok = rawTokens[rawTokens.length - 1]
  if (lastTok && NAME_SUFFIXES.includes(lastTok)) suffix = lastTok
  else if (lastLc) {
    // Glued suffix (richwhitneyjr): only if the stem still holds the surname.
    for (const suf of NAME_SUFFIXES) {
      if (alpha.length > suf.length + 2 && alpha.endsWith(suf) && alpha.slice(0, -suf.length).includes(lastLc)) { suffix = suf; break }
    }
  }
  if (suffix === 'jnr') suffix = 'jr'; else if (suffix === 'snr') suffix = 'sr'

  let middleInitial: string | undefined
  if (firstLc && lastLc && alpha.startsWith(firstLc) && alpha.endsWith(lastLc) && alpha.length === firstLc.length + lastLc.length + 1) {
    middleInitial = alpha.slice(firstLc.length, firstLc.length + 1)
  }

  let birthYear: number | undefined
  const ym = local.match(/(?:19[3-9]\d|20[01]\d)/)
  if (ym) birthYear = parseInt(ym[0], 10)

  return { domain, isFree, isPersonalDomain, companyGuess, expandedName, keyword, suffix, middleInitial, birthYear }
}

/** Query combos, most-specific first, deduped, capped. Encodes the owner's
 *  manual-research order: domain/site first, then name+role, then handle. */
export function buildResolverQueries(input: ResolverInput): string[] {
  const { first, last } = splitName(input.name)
  const full = [first, last].filter(Boolean).join(' ')
  const title = input.jobTitle?.trim()
  const company = input.companyName?.trim()
  const country = input.country?.trim()
  const { domain, isFree, companyGuess, expandedName, keyword, suffix, middleInitial } = parseEmail(input.email, input.name)
  const workAreaTerm = (input.workArea || '').split(/[,/]/)[0]?.trim()
  const out: string[] = []
  const push = (q?: string | false) => {
    const t = (q || '').trim().replace(/\s+/g, ' ')
    if (t && full && !out.includes(t)) out.push(t)
  }

  if (!isFree && domain) {
    push(`site:${domain} ${full}`)
    push(companyGuess && `${full} ${companyGuess} linkedin`)
  }
  // Handle-derived disambiguators first — this is what surfaces the RIGHT one
  // of several same-name profiles ("richard whitney jr", "david w iverson").
  if (suffix) push(`${full} ${suffix} linkedin`)
  if (middleInitial && first && last) push(`${first} ${middleInitial} ${last} linkedin`)
  if (company) push(`${full} ${company} linkedin`)
  if (title) push(`${full} ${title} linkedin`)
  if (expandedName && expandedName.toLowerCase() !== full.toLowerCase()) push(`${expandedName} linkedin${country ? ' ' + country : ''}`)
  if (keyword) push(`${full} ${keyword} linkedin`)
  if (country) push(`${full} linkedin ${country}`)
  if (workAreaTerm) push(`${full} ${workAreaTerm} linkedin`)
  push(`${full} linkedin`)
  return out.slice(0, 7)
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
    body: JSON.stringify({ queries: queries.join('\n'), resultsPerPage: 10, maxPagesPerQuery: 1, languageCode: 'en', mobileResults: false, saveHtml: false, includeUnfilteredResults: false }),
    signal: AbortSignal.timeout(SYNC_TIMEOUT_MS + 5_000),
  })
  if (!res.ok) throw new Error(`Apify google search ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const items: ApifyGoogleResult[] = await res.json()
  const out: SerpCandidate[] = []
  for (const block of items) {
    const term = block.searchQuery?.term
    ;(block.organicResults || []).slice(0, 6).forEach((r, i) => {
      const u = r.url || r.link || r.href || r.displayedUrl || ''
      if (!u) return
      out.push({ url: u, title: r.title, snippet: r.description || r.snippet, query: term, rank: i + 1, isLinkedin: LINKEDIN_PROFILE_RE.test(u) })
    })
  }
  return out
}

interface LlmVerdict { matchIndex: number | null; linkedinUrl: string | null; company: string | null; title: string | null; country: string | null; confidence: number; reasoning: string }

async function verifyMatch(input: ResolverInput, candidates: SerpCandidate[], parts: EmailParts): Promise<LlmVerdict | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const list = candidates
    .map((c, i) => `[${i}] rank ${c.rank} · query "${c.query || ''}"\n  title: ${c.title || '(none)'}\n  url: ${c.url}\n  snippet: ${c.snippet || '(none)'}`)
    .join('\n')
  const known = [
    input.name && `name (as typed, may be partial): ${input.name}`,
    parts.expandedName && `possible fuller name from email handle: ${parts.expandedName}`,
    parts.suffix && `name suffix in the email handle — the RIGHT profile must carry it: ${parts.suffix.toUpperCase()}`,
    parts.middleInitial && `middle initial in the email handle — the right profile likely shows it: ${parts.middleInitial.toUpperCase()}`,
    parts.birthYear && `birth year hinted by the email handle: ${parts.birthYear} (reject a profile whose career length or age clearly contradicts this)`,
    input.jobTitle && `title: ${input.jobTitle}`,
    !parts.isFree && !parts.isPersonalDomain && parts.companyGuess && `EMPLOYER inferred from their work email domain (${parts.domain}): ${parts.companyGuess}`,
    parts.isPersonalDomain && `NOTE: ${parts.domain} looks like the person's OWN personal/brand site, not a corporate employer — do not treat it as an employer.`,
    input.companyName && `company: ${input.companyName}`,
    input.country && `country: ${input.country}`,
    input.jobLevel && `job level (from quiz): ${input.jobLevel}`,
    input.workArea && `work area (from quiz): ${input.workArea}`,
    input.email && `email: ${input.email}`,
  ].filter(Boolean).join('\n')

  const prompt = `You verify a person's identity from Google results, like a careful researcher. Results are listed in Google's ranked order (rank 1 = top).

KNOWN about the person:
${known || '(only a name)'}

SEARCH RESULTS:
${list}

How to decide (this mirrors how a human resolves thin data):
- The LinkedIn profile at or near rank 1 for a precise name query is usually the right person. ACCEPT it when the profile's NAME (including the vanity URL slug, e.g. /in/lfferreira for "Luis F Ferreira") is consistent with the person AND nothing contradicts the country/role.
- Corroboration that RAISES confidence: the inferred employer domain appears; the vanity slug or title encodes the name; the role fits the job level / work area (e.g. "student" → a university profile; "sales" → a sales role); the country matches; a handle suffix / middle initial / birth year fits.
- RED FLAGS that should make you REJECT (return null) — these are how a careful human avoids the wrong same-name person:
  - A vanity slug that matches only the email HANDLE, not the person's NAME, is NOT proof. Handles are reused; the profile's displayed name must still match. (e.g. handle "shravad" → /in/shravad is meaningless unless that profile is actually this person.)
  - For a WORK email, the person almost always works at that domain's company. If the best candidate's employer is unrelated to the email domain, it is probably the WRONG same-name person — reject unless the domain/company is explicitly corroborated.
  - A handle suffix (Jr/Sr/III), middle initial, or birth year that the candidate contradicts.
  - The candidate's name is only a loose abbreviation of a distinctive name (e.g. "M Khan" for "MdSoscho Khan").
  - Several DISTINCT people share the name and nothing (employer domain, role, country, handle-derived surname/suffix/initial) uniquely disambiguates them.
- Plenty of real people have NO LinkedIn at all (creatives, military, tradespeople, personal-brand-site owners). When no candidate is clearly them, returning null is the CORRECT answer — a confident null beats attaching a stranger.
- Never attach a prominent different person just because they share the name (e.g. a public figure) when the corroborating signals point elsewhere.

Return ONLY JSON, no markdown:
{"matchIndex": <index of the best matching result, or null>,
 "linkedinUrl": <the linkedin.com/in profile URL of the match, or null>,
 "company": <employer from the match, else the inferred email-domain employer, else null>,
 "title": <job title from the match, or null>,
 "country": <country from the match, or null>,
 "confidence": <0.0-1.0>,
 "reasoning": "<one sentence: what corroborated, or why it stays ambiguous>"}`

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
    return JSON.parse(jsonStr.slice(start, end + 1)) as LlmVerdict
  } catch (err) {
    console.error('resolver LLM threw', err)
    return null
  }
}

/** Resolve identity via verified Google search. Fail-open (never throws). */
export async function resolveIdentityViaGoogle(input: ResolverInput): Promise<ResolverResult> {
  const queries = buildResolverQueries(input)
  const parts = parseEmail(input.email, input.name)
  const base: ResolverResult = { confidence: 0, reasoning: '', triedQueries: queries, candidates: [], outcome: 'no_results' }
  if (queries.length === 0) return { ...base, outcome: 'unconfigured', reasoning: 'no name to search on' }

  let candidates: SerpCandidate[]
  try { candidates = await fetchSerp(queries) }
  catch (err) { return { ...base, outcome: 'error', reasoning: String(err).slice(0, 160) } }
  if (candidates.length === 0) return base

  // Employer fallback: for a work email, the domain IS the company even if no
  // provider returns one.
  const companyFallback = !parts.isFree ? (input.companyName || parts.companyGuess) : input.companyName

  const verdict = await verifyMatch(input, candidates, parts)
  if (!verdict) {
    const profiles = Array.from(new Set(candidates.filter(c => c.isLinkedin).map(c => c.url.split('?')[0].split('#')[0])))
    if (profiles.length === 1) return { ...base, linkedinUrl: profiles[0], companyName: companyFallback, confidence: 0.5, reasoning: 'LLM unavailable; single distinct LinkedIn profile across all queries', outcome: 'matched', candidates }
    return { ...base, reasoning: `LLM unavailable; ${profiles.length} distinct profiles, not resolving`, outcome: 'rejected', candidates }
  }

  let conf = Math.max(0, Math.min(1, Number(verdict.confidence) || 0))

  // Owner red flag (deterministic backstop): a WORK email whose company is
  // nowhere near the chosen profile is the classic wrong-same-name pick.
  if (!parts.isFree && !parts.isPersonalDomain && parts.companyGuess && conf < 0.9 && verdict.matchIndex != null) {
    const m = candidates[verdict.matchIndex]
    const hay = `${verdict.company || ''} ${m?.title || ''} ${m?.snippet || ''} ${m?.query || ''}`.toLowerCase()
    const tok = parts.companyGuess.split(' ')[0]
    if (tok.length >= 4 && !hay.includes(tok)) conf = Math.max(0, conf - 0.2)
  }

  if (conf < ACCEPT_THRESHOLD || verdict.matchIndex == null) {
    return { ...base, confidence: conf, reasoning: verdict.reasoning || 'below confidence threshold', outcome: 'rejected', candidates }
  }
  const matched = candidates[verdict.matchIndex]

  // Anti-hallucination: only ever return a profile that actually appeared in
  // the results (by /in/ slug or exact base URL). If the LLM's URL isn't among
  // them, fall back to the matched candidate; if that isn't a profile, abstain.
  const slugOf = (u: string): string | null => { const mm = u.toLowerCase().match(/\/in\/([^/?#]+)/); return mm ? mm[1].replace(/\/+$/, '') : null }
  const baseOf = (u: string): string => u.split('?')[0].split('#')[0].toLowerCase()
  const candIds = new Set<string>()
  for (const c of candidates) { if (!c.isLinkedin) continue; const s = slugOf(c.url); if (s) candIds.add('s:' + s); candIds.add('u:' + baseOf(c.url)) }
  const inResults = (u: string): boolean => { const s = slugOf(u); return (!!s && candIds.has('s:' + s)) || candIds.has('u:' + baseOf(u)) }

  let linkedinUrl = (verdict.linkedinUrl && LINKEDIN_PROFILE_RE.test(verdict.linkedinUrl))
    ? verdict.linkedinUrl.split('?')[0].split('#')[0]
    : (matched?.isLinkedin ? matched.url.split('?')[0].split('#')[0] : undefined)
  if (linkedinUrl && !inResults(linkedinUrl)) {
    linkedinUrl = matched?.isLinkedin ? matched.url.split('?')[0].split('#')[0] : undefined
  }
  if (!linkedinUrl) {
    return { ...base, confidence: conf, reasoning: `${verdict.reasoning || ''} [no in-result profile to attach]`.trim(), outcome: 'rejected', candidates }
  }

  return {
    linkedinUrl,
    companyName: verdict.company || companyFallback || undefined,
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
