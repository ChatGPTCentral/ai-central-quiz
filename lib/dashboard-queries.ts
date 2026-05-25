import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fromRow, type DbRow, type StoredSubmission } from './kv'

let _client: SupabaseClient | null = null
function client(): SupabaseClient {
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

export interface DashboardFilters {
  archetype?: string[]
  aiLevel?: string[]
  mainGoal?: string[]
  timeCommitment?: string[]
  jobLevel?: string[]
  seniority?: string[]
  companyIndustry?: string[]
  country?: string[]
  source?: string[]
  ageBracket?: string[]
  buyingIntent?: string[]
  hasLinkedin?: boolean
  hasPhoto?: boolean
  /** Saved-search style "broken records" filters — show ONLY rows missing each field. */
  missing?: ('enrichment' | 'linkedin' | 'photo' | 'sex' | 'age' | 'company' | 'country' | 'industry')[]
  scoreMin?: number
  scoreMax?: number
  workArea?: string  // substring match on the CSV column
  search?: string    // free-text on name/email/company
}

export function parseFilters(sp: URLSearchParams): DashboardFilters {
  const csv = (k: string) => {
    const v = sp.get(k)
    return v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined
  }
  return {
    archetype: csv('archetype'),
    aiLevel: csv('aiLevel'),
    mainGoal: csv('mainGoal'),
    timeCommitment: csv('timeCommitment'),
    jobLevel: csv('jobLevel'),
    seniority: csv('seniority'),
    companyIndustry: csv('industry'),
    country: csv('country'),
    source: csv('source'),
    ageBracket: csv('age'),
    buyingIntent: csv('intent'),
    hasLinkedin: sp.get('hasLinkedin') === '1' ? true : undefined,
    hasPhoto: sp.get('hasPhoto') === '1' ? true : undefined,
    missing: sp.get('missing')
      ? sp.get('missing')!.split(',').map(s => s.trim()).filter(Boolean) as DashboardFilters['missing']
      : undefined,
    scoreMin: sp.get('scoreMin') ? parseInt(sp.get('scoreMin')!, 10) : undefined,
    scoreMax: sp.get('scoreMax') ? parseInt(sp.get('scoreMax')!, 10) : undefined,
    workArea: sp.get('workArea') || undefined,
    search: sp.get('q') || undefined,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: DashboardFilters): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r: any = q
  if (f.archetype?.length)         r = r.in('archetype', f.archetype)
  if (f.aiLevel?.length)           r = r.in('ai_level', f.aiLevel)
  if (f.mainGoal?.length)          r = r.in('main_goal', f.mainGoal)
  if (f.timeCommitment?.length)    r = r.in('time_commitment', f.timeCommitment)
  if (f.jobLevel?.length)          r = r.in('job_level', f.jobLevel)
  if (f.seniority?.length)         r = r.in('seniority', f.seniority)
  if (f.companyIndustry?.length)   r = r.in('company_industry', f.companyIndustry)
  if (f.country?.length)           r = r.in('country', f.country)
  if (f.source?.length)            r = r.in('source', f.source)
  if (f.ageBracket?.length)        r = r.in('age_bracket', f.ageBracket)
  if (f.buyingIntent?.length)      r = r.in('buying_intent', f.buyingIntent)
  if (f.hasLinkedin)               r = r.not('linkedin_url', 'is', null)
  if (f.hasPhoto)                  r = r.not('photo_url', 'is', null)
  if (f.missing?.length) {
    // Each token narrows the result to rows MISSING that field.
    // (intersect — a row must match every requested gap)
    // For 'age', a row is "missing age" only if BOTH the user-reported
    // age_bracket AND the AI-estimated age_ai_estimate are empty — matches
    // what the table cell actually renders (ageBracket || ageAiEstimate).
    const colFor: Record<string, string | string[]> = {
      enrichment: 'enrichment_status',
      linkedin:   'linkedin_url',
      photo:      'photo_url',
      sex:        'sex_ai_estimate',
      age:        ['age_bracket', 'age_ai_estimate'],
      company:    'company_name',
      country:    'country',
      industry:   'company_industry',
    }
    for (const m of f.missing) {
      const col = colFor[m]
      if (!col) continue
      if (Array.isArray(col)) {
        // intersect: every column must be null/empty
        for (const c of col) r = r.or(`${c}.is.null,${c}.eq.`)
      } else {
        r = r.or(`${col}.is.null,${col}.eq.`)
      }
    }
  }
  if (typeof f.scoreMin === 'number') r = r.gte('score', f.scoreMin)
  if (typeof f.scoreMax === 'number') r = r.lte('score', f.scoreMax)
  if (f.workArea)                  r = r.ilike('work_area', `%${f.workArea}%`)
  if (f.search) {
    r = r.or(`name.ilike.%${f.search}%,email.ilike.%${f.search}%,company_name.ilike.%${f.search}%`)
  }
  return r
}

export async function filteredSubmissions(
  filters: DashboardFilters,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ items: StoredSubmission[]; total: number }> {
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? 50
  const c = client()
  let q = c.from('submissions').select('*', { count: 'exact' })
  q = applyFilters(q, filters)
  const { data, error, count } = await q
    .order('ts', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)
  return {
    items: (data || []).map(r => fromRow(r as DbRow)),
    total: count || 0,
  }
}

export async function filteredCount(filters: DashboardFilters): Promise<number> {
  let q = client().from('submissions').select('id', { count: 'exact', head: true })
  q = applyFilters(q, filters)
  const { count, error } = await q
  if (error) throw new Error(error.message)
  return count || 0
}

/** All matching submissions (no pagination) — used by CSV export. */
export async function filteredSubmissionsAll(filters: DashboardFilters): Promise<StoredSubmission[]> {
  let q = client().from('submissions').select('*')
  q = applyFilters(q, filters)
  const { data, error } = await q.order('ts', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(r => fromRow(r as DbRow))
}

/** Top-N facet counts honoring current filters (so the UI shows reachable values only). */
export async function facetCounts(
  filters: DashboardFilters,
  column: 'archetype' | 'seniority' | 'company_industry' | 'country' | 'main_goal' | 'source' | 'age_bracket' | 'buying_intent',
  limit = 10,
): Promise<{ value: string; count: number }[]> {
  let q = client().from('submissions').select(column)
  q = applyFilters(q, filters)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const counts = new Map<string, number>()
  for (const row of (data || []) as Record<string, string | null>[]) {
    const v = row[column]
    if (!v) continue
    counts.set(v, (counts.get(v) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

// The DB-row → StoredSubmission mapper lives in lib/kv.ts (`fromRow`).
// Do NOT re-implement it here — keep a single source of truth so new columns
// surface in every code path (table, detail, CSV export) at the same time.
