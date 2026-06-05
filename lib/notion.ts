// Notion-backed "AI Central document database" reader.
//
// Powers the result-page doc search + suggestions. Uses the Notion API v5
// data-sources model: a database id resolves to one or more data sources;
// we query the first data source.
//
// Display + search field model (matches the AI Central docs DB):
//   Display title  ← `cover title`
//   Searchable     ← `cover title`, `netline - abstract`, `tools mentioned`,
//                    `netline content title`, `netline tagline`
//
// All field names are overridable via env vars below so the integration
// survives any future Notion column rename without a code change.

import { Client } from '@notionhq/client'

export interface NotionDoc {
  id: string
  title: string
  summary: string
  /** External URL property if present, else the Notion page URL. */
  url: string
  tags: string[]
}

// ── Configurable property names ──────────────────────────────────────
// Defaults match the live AI Central docs database; override via env if
// you ever rename a Notion column.
const PROP_DISPLAY_TITLE = process.env.NOTION_PROP_COVER_TITLE || 'cover title'
const PROP_SUMMARY = process.env.NOTION_PROP_SUMMARY || 'netline - abstract'
const PROP_URL = process.env.NOTION_PROP_URL || 'URL'
const PROP_TAGS = process.env.NOTION_PROP_TAGS || 'tools mentioned'

// All properties the search bar should look across. Comma-separated env
// override if you want to add/remove fields without a deploy.
const SEARCH_PROPS = (process.env.NOTION_SEARCH_PROPS
  || 'cover title,netline - abstract,tools mentioned,netline content title,netline tagline'
).split(',').map(s => s.trim()).filter(Boolean)

let _client: Client | null = null
function client(): Client | null {
  const auth = process.env.NOTION_API_KEY
  if (!auth) return null
  if (!_client) _client = new Client({ auth })
  return _client
}

export function notionConfigured(): boolean {
  return Boolean(process.env.NOTION_API_KEY && process.env.NOTION_DOCS_DATABASE_ID)
}

// Resolve the database id → data source id + the property-type map. Cached
// for the process lifetime (the schema is stable).
interface ResolvedSource {
  dataSourceId: string
  titleProp: string
  /** Notion property type for every column, keyed by property name. */
  propTypes: Record<string, string>
  /** Lowercase-trimmed property name → actual property name. Lets us look
   *  up "cover title" / "Cover Title" / " cover title " all the same way. */
  byLower: Record<string, string>
}
let _resolved: ResolvedSource | null = null

/** Case + whitespace insensitive property lookup. Returns the actual property
 *  key as it exists in the schema, or undefined if no match. */
function actualProp(resolved: ResolvedSource, name: string): string | undefined {
  if (resolved.propTypes[name]) return name
  return resolved.byLower[name.trim().toLowerCase()]
}

async function resolveSource(c: Client): Promise<ResolvedSource | null> {
  if (_resolved) return _resolved
  const dbId = process.env.NOTION_DOCS_DATABASE_ID!
  try {
    let dataSourceId = dbId
    try {
      const db = await c.databases.retrieve({ database_id: dbId }) as unknown as { data_sources?: { id: string }[] }
      if (db.data_sources && db.data_sources.length > 0) dataSourceId = db.data_sources[0].id
    } catch {
      // dbId might already be a data source id — fall through and use it directly.
    }
    const ds = await c.dataSources.retrieve({ data_source_id: dataSourceId }) as unknown as {
      properties: Record<string, { type: string }>
    }
    const titleProp = Object.entries(ds.properties).find(([, v]) => v.type === 'title')?.[0] || 'Name'
    const propTypes: Record<string, string> = {}
    const byLower: Record<string, string> = {}
    for (const [name, def] of Object.entries(ds.properties)) {
      propTypes[name] = def.type
      byLower[name.trim().toLowerCase()] = name
    }
    _resolved = { dataSourceId, titleProp, propTypes, byLower }
    return _resolved
  } catch (err) {
    console.error('[notion] resolveSource failed:', err)
    return null
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function plainText(prop: any): string {
  if (!prop) return ''
  if (prop.type === 'title') return (prop.title || []).map((t: any) => t.plain_text).join('')
  if (prop.type === 'rich_text') return (prop.rich_text || []).map((t: any) => t.plain_text).join('')
  if (prop.type === 'url') return prop.url || ''
  if (prop.type === 'select') return prop.select?.name || ''
  if (prop.type === 'multi_select') return (prop.multi_select || []).map((s: any) => s.name).join(', ')
  return ''
}

function tagsOf(prop: any): string[] {
  if (!prop) return []
  if (prop.type === 'multi_select') return (prop.multi_select || []).map((s: any) => s.name)
  if (prop.type === 'select') return prop.select ? [prop.select.name] : []
  // For free-text tag fields (e.g. "tools mentioned" stored as rich_text),
  // split on commas/semicolons so we still render chips.
  if (prop.type === 'rich_text' || prop.type === 'title') {
    const raw = plainText(prop)
    return raw ? raw.split(/[,;]/).map(t => t.trim()).filter(Boolean) : []
  }
  return []
}

// Lowercase connectives that should stay lower-case in Title Case output
// unless they're the first or last word.
const TITLE_CASE_SMALL = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'nor',
  'of', 'on', 'or', 'per', 'so', 'the', 'to', 'vs', 'via', 'with', 'yet',
])

/** "your first chatgpt prompt" → "Your First ChatGPT Prompt"
 *  Preserves ALL-CAPS / mixed-case tokens (ChatGPT, GPT-4, API), so we
 *  don't lowercase brand acronyms by accident. */
function toTitleCase(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ')
  if (!s) return s
  const tokens = s.split(' ')
  return tokens
    .map((tok, i) => {
      // Keep tokens that already contain internal uppercase as-is (e.g.
      // ChatGPT, OpenAI, GPT-4, n8n) — those are intentional casings.
      if (/[A-Z]/.test(tok.slice(1))) return tok
      const lower = tok.toLowerCase()
      const isEdge = i === 0 || i === tokens.length - 1
      if (!isEdge && TITLE_CASE_SMALL.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

function mapPage(page: any, resolved: ResolvedSource): NotionDoc {
  const props = page.properties || {}
  // Display title comes from `cover title` (user-curated, title-cased so
  // every entry reads cleanly). Lookup is case + whitespace insensitive,
  // so 'cover title' / 'Cover Title' / ' cover title ' all resolve.
  const coverKey = actualProp(resolved, PROP_DISPLAY_TITLE)
  const displayRaw = coverKey ? plainText(props[coverKey]).trim() : ''
  const summaryKey = actualProp(resolved, PROP_SUMMARY)
  const urlKey = actualProp(resolved, PROP_URL)
  const tagsKey = actualProp(resolved, PROP_TAGS)
  return {
    id: page.id,
    title: displayRaw ? toTitleCase(displayRaw) : '',
    summary: summaryKey ? plainText(props[summaryKey]) : '',
    url: (urlKey ? plainText(props[urlKey]) : '') || page.url || '',
    tags: tagsKey ? tagsOf(props[tagsKey]) : [],
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Build a Notion filter clause for one property, switching shape on type.
 *  Returns null if the property isn't searchable (or doesn't exist). */
function filterForProp(name: string, propType: string | undefined, q: string): object | null {
  if (!propType) return null
  switch (propType) {
    case 'title':
      return { property: name, title: { contains: q } }
    case 'rich_text':
      return { property: name, rich_text: { contains: q } }
    case 'multi_select':
      return { property: name, multi_select: { contains: q } }
    case 'select':
      return { property: name, select: { equals: q } }
    case 'url':
      return { property: name, url: { contains: q } }
    default:
      return null
  }
}

/** Free-text search across the configured set of properties (OR-combined).
 *  Empty query returns the latest entries (no filter). */
export async function searchDocs(query: string, limit = 8): Promise<NotionDoc[]> {
  const c = client()
  if (!c || !notionConfigured()) return []
  const resolved = await resolveSource(c)
  if (!resolved) return []
  const q = query.trim()
  try {
    const filters = q
      ? SEARCH_PROPS
          .map(p => {
            const actual = actualProp(resolved, p)
            return actual ? filterForProp(actual, resolved.propTypes[actual], q) : null
          })
          .filter((f): f is object => f !== null)
      : []
    const res = await c.dataSources.query({
      data_source_id: resolved.dataSourceId,
      page_size: limit,
      ...(filters.length > 0
        ? { filter: (filters.length === 1 ? filters[0] : { or: filters }) as never }
        : {}),
    })
    // Drop rows where `cover title` is empty — the user explicitly wants
    // the cover title shown (not the numeric/internal title fallback).
    return (res.results as unknown[]).map(p => mapPage(p, resolved)).filter(d => d.title)
  } catch (err) {
    console.error('[notion] searchDocs failed:', err)
    return []
  }
}

/** Archetype/stage-biased suggestions. Pulls a pool and ranks client-side by
 *  keyword overlap, so we don't depend on a specific tag taxonomy existing. */
export async function suggestedDocs(keywords: string[], limit = 4): Promise<NotionDoc[]> {
  const c = client()
  if (!c || !notionConfigured()) return []
  const resolved = await resolveSource(c)
  if (!resolved) return []
  try {
    const res = await c.dataSources.query({
      data_source_id: resolved.dataSourceId,
      page_size: 40,
    })
    const docs = (res.results as unknown[]).map(p => mapPage(p, resolved)).filter(d => d.title)
    const kw = keywords.map(k => k.toLowerCase())
    const scored = docs.map(d => {
      const hay = `${d.title} ${d.summary} ${d.tags.join(' ')}`.toLowerCase()
      const score = kw.reduce((acc, k) => acc + (hay.includes(k) ? 1 : 0), 0)
      return { d, score }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map(s => s.d)
  } catch (err) {
    console.error('[notion] suggestedDocs failed:', err)
    return []
  }
}
