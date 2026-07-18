import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fromRow, type DbRow, type StoredSubmission } from './kv'
import { applyFilterSpec, decodeSpec, type FilterSpec } from './advanced-filter'

// ────────────────────────────────────────────────────────────────
// Column projection — list-view queries skip the heavy jsonb columns.
// `enrichment_raw` alone averages ~20KB per row (provider raw payloads).
// Pulling all of it for the dashboard's 2.4k+ rows = ~50MB transfer.
// Listing scalars explicitly drops the dashboard payload by ~95%.
// Detail-page queries still use '*' to keep the raw audit blob available.
// ────────────────────────────────────────────────────────────────
const LIST_COLUMNS = [
  // identity
  'id', 'email', 'name', 'ts', 'created_at', 'ip', 'user_agent', 'archived_at',
  // quiz
  'ai_level', 'work_area', 'learning_style', 'time_commitment', 'main_goal', 'ai_tools', 'job_level',
  'score',
  // enrichment scalars
  'linkedin_url', 'photo_url',
  'job_title', 'job_title_standardized', 'seniority', 'job_function', 'department',
  'company_name', 'company_domain', 'company_linkedin_url', 'company_website',
  'company_size', 'company_industry', 'company_sub_industry',
  'company_revenue', 'company_funding', 'company_founded_year',
  'country', 'region', 'city',
  'enrichment_status', 'enriched_at',
  // demographics
  'age_bracket', 'age_ai_estimate', 'sex_ai_estimate', 'ai_estimate_confidence',
  // source / utm
  'source', 'buying_intent', 'utm_source', 'utm_ref', 'utm_source_beehiiv',
  // beehiiv + stripe
  'subscription_tier', 'beehiiv_status',
  'stripe_customer_id', 'stripe_customer_ids', 'stripe_products', 'stripe_subscriptions',
  'stripe_first_charge_at', 'stripe_last_charge_at', 'stripe_imported_at',
  'lifetime_value_usd',
  // SANDBOX v2 — Stage + Persona
  'stage', 'stage_score', 'stage_reason', 'persona', 'persona_reason', 'staged_at',
  'frequency_score', 'depth_score', 'breadth_score', 'momentum', 'friction', 'intent_30d',
].join(', ')

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
  // Additional facets (multi-select like stage/persona etc.)
  subscriptionTier?: string[]
  beehiivStatus?: string[]
  sexAiEstimate?: string[]
  enrichmentStatus?: string[]
  companySize?: string[]
  /** Saved-search style "broken records" filters — show ONLY rows missing each field. */
  missing?: ('enrichment' | 'linkedin' | 'photo' | 'sex' | 'age' | 'company' | 'country' | 'industry' | 'beehiiv' | 'stripe')[]
  /** Free-form advanced filter tree (AND/OR rules with per-field operators). */
  spec?: FilterSpec
  /** Include rows where archived_at IS NOT NULL. Default false. */
  includeArchived?: boolean
  /** Show ONLY archived rows (for the archive browser). */
  onlyArchived?: boolean
  scoreMin?: number
  scoreMax?: number
  workArea?: string  // substring match on the CSV column
  search?: string    // free-text on name/email/company
  /** Sample scope: 'launch' = only the post-launch quiz funnel
   *  (source='quiz_v2'), excluding the legacy Fillout import and the
   *  Stripe-customer import; 'all' = every record. The dashboard defaults
   *  to 'launch'. Note we key on source, not a date, because the Stripe
   *  import overwrites ts/created_at with the customer's original Stripe
   *  date, so a date cutoff would wrongly drop launch-era converters. */
  sample?: 'launch' | 'all'
}

export function parseFilters(sp: URLSearchParams): DashboardFilters {
  const csv = (k: string) => {
    const v = sp.get(k)
    return v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined
  }
  return {
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
    subscriptionTier: csv('subscriptionTier'),
    beehiivStatus: csv('beehiivStatus'),
    sexAiEstimate: csv('sexAiEstimate'),
    enrichmentStatus: csv('enrichmentStatus'),
    companySize: csv('companySize'),
    missing: sp.get('missing')
      ? sp.get('missing')!.split(',').map(s => s.trim()).filter(Boolean) as DashboardFilters['missing']
      : undefined,
    scoreMin: sp.get('scoreMin') ? parseInt(sp.get('scoreMin')!, 10) : undefined,
    scoreMax: sp.get('scoreMax') ? parseInt(sp.get('scoreMax')!, 10) : undefined,
    workArea: sp.get('workArea') || undefined,
    search: sp.get('q') || undefined,
    spec: decodeSpec(sp.get('spec')),
    includeArchived: sp.get('includeArchived') === '1' ? true : undefined,
    onlyArchived: sp.get('onlyArchived') === '1' ? true : undefined,
    sample: sp.get('sample') === 'all' ? 'all' : sp.get('sample') === 'launch' ? 'launch' : undefined,
  }
}

/** Wall-clock launch of the quiz funnel (Jul 5, 2026 UTC). */
export const LAUNCH_LABEL = 'Jul 5, 2026'
/** Cutoff for the launch sample. We key on staged_at (set when the quiz
 *  classifies the submission) because ts/created_at get OVERWRITTEN by the
 *  Stripe import to the customer's original Stripe date — so ~20 launch
 *  quiz-takers who are also existing Stripe customers show 2023-2025 dates
 *  there. staged_at is never overwritten, so it's the true "took the quiz" time. */
export const LAUNCH_ISO = '2026-07-05'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: DashboardFilters): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let r: any = q
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
  if (f.subscriptionTier?.length)  r = r.in('subscription_tier', f.subscriptionTier)
  if (f.beehiivStatus?.length)     r = r.in('beehiiv_status', f.beehiivStatus)
  if (f.sexAiEstimate?.length)     r = r.in('sex_ai_estimate', f.sexAiEstimate)
  if (f.enrichmentStatus?.length)  r = r.in('enrichment_status', f.enrichmentStatus)
  if (f.companySize?.length)       r = r.in('company_size', f.companySize)
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
      beehiiv:    'subscription_tier',
      stripe:     'stripe_customer_id',
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
  // Launch scope: the new quiz funnel, submitted since launch. Keyed on
  // staged_at (not ts/created_at, which the Stripe import overwrites).
  // Launch sample anchors on IMMUTABLE created_at (enrichment re-stamps
  // staged_at, which used to shuffle the cohort between pages). Legacy rows
  // without created_at fall back to staged_at.
  if (f.sample === 'launch')       r = r.eq('source', 'quiz_v2').or(`created_at.gte.${LAUNCH_ISO},and(created_at.is.null,staged_at.gte.${LAUNCH_ISO})`)
  if (f.search) {
    r = r.or(`name.ilike.%${f.search}%,email.ilike.%${f.search}%,company_name.ilike.%${f.search}%`)
  }
  if (f.spec) r = applyFilterSpec(r, f.spec)
  // Soft-delete handling: by default exclude archived rows from every view
  // (dashboard charts, submissions list, exports). Two opt-outs:
  //   - includeArchived=1  → show both active + archived
  //   - onlyArchived=1     → show only archived (the archive browser)
  if (f.onlyArchived) {
    r = r.not('archived_at', 'is', null)
  } else if (!f.includeArchived) {
    r = r.is('archived_at', null)
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
  let q = c.from('submissions').select(LIST_COLUMNS, { count: 'exact' })
  q = applyFilters(q, filters)
  const { data, error, count } = await q
    .order('ts', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)
  return {
    items: (data || []).map(r => fromRow(r as unknown as DbRow)),
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
  // Supabase / PostgREST returns max 1000 rows per request by default. With
  // 2000+ rows in the unified CRM the dashboard was silently truncating.
  // Page through in 1000-row chunks until exhausted.
  const PAGE = 1000
  const all: StoredSubmission[] = []
  let offset = 0
  // Safety cap: 50 pages = 50k rows. Bail before that — something else is wrong.
  for (let page = 0; page < 50; page++) {
    let q = client().from('submissions').select(LIST_COLUMNS)
    q = applyFilters(q, filters)
    const { data, error } = await q
      .order('ts', { ascending: false })
      .order('id', { ascending: false })   // stable secondary sort for paging
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = (data || []).map(r => fromRow(r as unknown as DbRow))
    all.push(...batch)
    if (batch.length < PAGE) break
    offset += PAGE
  }
  return all
}

/** Top-N facet counts honoring current filters (so the UI shows reachable values only). */
export async function facetCounts(
  filters: DashboardFilters,
  column: 'stage' | 'persona' | 'seniority' | 'company_industry' | 'country' | 'main_goal' | 'source' | 'age_bracket' | 'buying_intent' | 'subscription_tier' | 'beehiiv_status' | 'sex_ai_estimate' | 'enrichment_status' | 'work_area' | 'ai_level' | 'company_size' | 'job_level',
  limit = 10,
): Promise<{ value: string; count: number }[]> {
  // Paginate to bypass the PostgREST 1000-row default cap (same fix as
  // filteredSubmissionsAll — otherwise facets undercount at 2k+ rows).
  const PAGE = 1000
  const counts = new Map<string, number>()
  let offset = 0
  for (let page = 0; page < 50; page++) {
    let q = client().from('submissions').select(column)
    q = applyFilters(q, filters)
    const { data, error } = await q.range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    const batch = (data || []) as Record<string, string | null>[]
    for (const row of batch) {
      const v = row[column]
      if (!v) continue
      counts.set(v, (counts.get(v) || 0) + 1)
    }
    if (batch.length < PAGE) break
    offset += PAGE
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

// The DB-row → StoredSubmission mapper lives in lib/kv.ts (`fromRow`).
// Do NOT re-implement it here — keep a single source of truth so new columns
// surface in every code path (table, detail, CSV export) at the same time.
