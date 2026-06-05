// Notion-backed "AI Central document database" reader.
//
// Powers the result-page doc search + suggestions. Uses the Notion API v5
// data-sources model: a database id resolves to one or more data sources;
// we query the first data source.
//
// Configuration (all optional — missing config degrades to []):
//   NOTION_API_KEY            — integration secret (ntn_… / secret_…)
//   NOTION_DOCS_DATABASE_ID   — the docs database id (or a data source id)
//   NOTION_PROP_SUMMARY       — summary/description property name (default 'Summary')
//   NOTION_PROP_URL           — external URL property name (default 'URL')
//   NOTION_PROP_TAGS          — multi-select tags property name (default 'Tags')
//
// The title property is auto-detected from the schema (the property whose
// type is 'title'), so it works regardless of what it's named.

import { Client } from '@notionhq/client'

export interface NotionDoc {
  id: string
  title: string
  summary: string
  /** External URL property if present, else the Notion page URL. */
  url: string
  tags: string[]
}

const PROP_SUMMARY = process.env.NOTION_PROP_SUMMARY || 'Summary'
const PROP_URL = process.env.NOTION_PROP_URL || 'URL'
const PROP_TAGS = process.env.NOTION_PROP_TAGS || 'Tags'

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

// Resolve the database id → data source id + title property name. Cached for
// the process lifetime (the schema is stable).
interface ResolvedSource { dataSourceId: string; titleProp: string }
let _resolved: ResolvedSource | null = null

async function resolveSource(c: Client): Promise<ResolvedSource | null> {
  if (_resolved) return _resolved
  const dbId = process.env.NOTION_DOCS_DATABASE_ID!
  try {
    // First assume dbId is a database id and read its data sources.
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
    _resolved = { dataSourceId, titleProp }
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
  return ''
}

function tagsOf(prop: any): string[] {
  if (!prop) return []
  if (prop.type === 'multi_select') return (prop.multi_select || []).map((s: any) => s.name)
  if (prop.type === 'select') return prop.select ? [prop.select.name] : []
  return []
}

function mapPage(page: any, titleProp: string): NotionDoc {
  const props = page.properties || {}
  const title = plainText(props[titleProp]) || 'Untitled'
  const summary = plainText(props[PROP_SUMMARY])
  const externalUrl = plainText(props[PROP_URL])
  return {
    id: page.id,
    title,
    summary,
    url: externalUrl || page.url || '',
    tags: tagsOf(props[PROP_TAGS]),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Free-text search across doc titles. Returns up to `limit` matches. */
export async function searchDocs(query: string, limit = 8): Promise<NotionDoc[]> {
  const c = client()
  if (!c || !notionConfigured()) return []
  const resolved = await resolveSource(c)
  if (!resolved) return []
  const q = query.trim()
  try {
    const res = await c.dataSources.query({
      data_source_id: resolved.dataSourceId,
      page_size: limit,
      ...(q
        ? { filter: { property: resolved.titleProp, title: { contains: q } } as never }
        : {}),
    })
    return (res.results as unknown[]).map(p => mapPage(p, resolved.titleProp))
  } catch (err) {
    console.error('[notion] searchDocs failed:', err)
    return []
  }
}

/** Suggested docs for a given archetype/stage. Tries to bias by tag match
 *  against the provided keywords; falls back to the newest docs. */
export async function suggestedDocs(keywords: string[], limit = 4): Promise<NotionDoc[]> {
  const c = client()
  if (!c || !notionConfigured()) return []
  const resolved = await resolveSource(c)
  if (!resolved) return []
  try {
    // Pull a pool, then rank client-side by tag/title keyword overlap so we
    // don't depend on the exact tag taxonomy existing.
    const res = await c.dataSources.query({
      data_source_id: resolved.dataSourceId,
      page_size: 40,
    })
    const docs = (res.results as unknown[]).map(p => mapPage(p, resolved.titleProp))
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
