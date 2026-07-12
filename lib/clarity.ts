// Microsoft Clarity Data Export API → durable daily snapshots.
//
// The export API only serves the trailing 1-3 days as project-level
// aggregates (10 calls/project/day), so a daily cron persists each pull
// into public.clarity_daily and every reader (funnel page, digest, Claude)
// works from our own history instead. Rows are stored as the raw
// `information` arrays (jsonb) per metric × dimension-set × day; parsing
// stays tolerant because the payload schema is Microsoft's, not ours.
//
// CLARITY_API_TOKEN comes from Clarity → Settings → Data Export.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const ENDPOINT = 'https://www.clarity.ms/export-data/api/v1/project-live-insights'

// One pull per dimension, 4 of the 10 daily calls: page-level UX, plus
// device/source/country splits for triage.
export const SNAPSHOT_DIMS = ['URL', 'Device', 'Source', 'Country'] as const

export interface ClarityMetric {
  metricName: string
  information: Record<string, unknown>[]
}

export interface SnapshotResult {
  date: string
  pulls: { dims: string; metrics: number }[]
  errors: string[]
}

let _client: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _client
}

export function clarityConfigured(): boolean {
  return !!process.env.CLARITY_API_TOKEN
}

export async function fetchClarityInsights(numOfDays: 1 | 2 | 3, dimensions: string[]): Promise<ClarityMetric[]> {
  const token = process.env.CLARITY_API_TOKEN
  if (!token) throw new Error('CLARITY_API_TOKEN is not set')

  const params = new URLSearchParams({ numOfDays: String(numOfDays) })
  dimensions.slice(0, 3).forEach((d, i) => params.set(`dimension${i + 1}`, d))

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const body = await res.text()
  if (!res.ok) {
    const hint = res.status === 401 ? ' (token invalid/expired)' : res.status === 429 ? ' (daily quota of 10 calls hit)' : ''
    throw new Error(`Clarity API ${res.status}${hint}: ${body.slice(0, 160)}`)
  }
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { throw new Error(`Clarity API returned non-JSON: ${body.slice(0, 160)}`) }
  if (!Array.isArray(parsed)) throw new Error('Clarity API returned an unexpected shape')
  return parsed
    .filter((m): m is { metricName?: unknown; information?: unknown } => !!m && typeof m === 'object')
    .map(m => ({
      metricName: typeof m.metricName === 'string' ? m.metricName : 'Unknown',
      information: Array.isArray(m.information) ? (m.information as Record<string, unknown>[]) : [],
    }))
}

/** Pull the trailing day for each snapshot dimension and upsert into
 *  clarity_daily. Partial failures are collected, not fatal, so one bad
 *  dimension never voids the rest of the day's quota spend. */
export async function snapshotClarity(): Promise<SnapshotResult> {
  const date = new Date().toISOString().slice(0, 10)
  const out: SnapshotResult = { date, pulls: [], errors: [] }
  const c = sb()

  for (const dims of SNAPSHOT_DIMS) {
    try {
      const metrics = await fetchClarityInsights(1, [dims])
      for (const m of metrics) {
        const { error } = await c.from('clarity_daily').upsert(
          { snapshot_date: date, dims, metric: m.metricName, rows: m.information, fetched_at: new Date().toISOString() },
          { onConflict: 'snapshot_date,dims,metric' },
        )
        if (error) out.errors.push(`upsert ${dims}/${m.metricName}: ${error.message}`)
      }
      out.pulls.push({ dims, metrics: metrics.length })
    } catch (e) {
      out.errors.push(`${dims}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return out
}

// ── Readers ────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/** Case-insensitive field lookup on a Clarity information row. */
function field(row: Record<string, unknown>, name: string): unknown {
  const k = Object.keys(row).find(x => x.toLowerCase() === name.toLowerCase())
  return k === undefined ? undefined : row[k]
}

export interface UxPageRow {
  url: string
  sessions: number
  scrollDepth: number | null
  rage: number
  dead: number
  quickback: number
  scriptErrors: number
  days: number
}

/** Per-page UX summary over the last `days` snapshots (dims='URL').
 *  Counts are summed; scroll depth is a session-weighted average. */
export async function clarityUxByPage(days = 7): Promise<{ rows: UxPageRow[]; snapshotDays: number; lastFetched: string | null }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await sb()
    .from('clarity_daily')
    .select('snapshot_date, metric, rows, fetched_at')
    .eq('dims', 'URL')
    .gte('snapshot_date', since)
  if (error) throw new Error(error.message)

  const byUrl = new Map<string, UxPageRow & { scrollWeight: number; scrollSum: number; dayset: Set<string> }>()
  const dayset = new Set<string>()
  let lastFetched: string | null = null

  for (const rec of data ?? []) {
    dayset.add(rec.snapshot_date as string)
    if (!lastFetched || String(rec.fetched_at) > lastFetched) lastFetched = String(rec.fetched_at)
    const rows = Array.isArray(rec.rows) ? (rec.rows as Record<string, unknown>[]) : []
    for (const r of rows) {
      const url = String(field(r, 'URL') ?? '').trim()
      if (!url) continue
      const e = byUrl.get(url) || { url, sessions: 0, scrollDepth: null, rage: 0, dead: 0, quickback: 0, scriptErrors: 0, days: 0, scrollWeight: 0, scrollSum: 0, dayset: new Set<string>() }
      e.dayset.add(rec.snapshot_date as string)
      const metric = String(rec.metric)
      if (metric === 'Traffic') {
        const s = num(field(r, 'totalSessionCount'))
        e.sessions += s
        e.scrollWeight += s // weight scroll by same-day sessions when both exist
      } else if (metric === 'ScrollDepth') {
        e.scrollSum += num(field(r, 'averageScrollDepth'))
        e.scrollDepth = -1 // marker: computed below
      } else if (metric === 'RageClickCount') {
        e.rage += num(field(r, 'subTotal') ?? field(r, 'sessionsCount'))
      } else if (metric === 'DeadClickCount') {
        e.dead += num(field(r, 'subTotal') ?? field(r, 'sessionsCount'))
      } else if (metric === 'QuickbackClick') {
        e.quickback += num(field(r, 'subTotal') ?? field(r, 'sessionsCount'))
      } else if (metric === 'ScriptErrorCount') {
        e.scriptErrors += num(field(r, 'subTotal') ?? field(r, 'sessionsCount'))
      }
      byUrl.set(url, e)
    }
  }

  const rowsOut: UxPageRow[] = Array.from(byUrl.values()).map(e => ({
    url: e.url,
    sessions: e.sessions,
    // simple average of daily averages (Clarity already averages within a day)
    scrollDepth: e.scrollDepth === null ? null : Math.round((e.scrollSum / Math.max(1, e.dayset.size)) * 10) / 10,
    rage: e.rage,
    dead: e.dead,
    quickback: e.quickback,
    scriptErrors: e.scriptErrors,
    days: e.dayset.size,
  }))
  rowsOut.sort((a, b) => b.sessions - a.sessions)

  return { rows: rowsOut, snapshotDays: dayset.size, lastFetched }
}
