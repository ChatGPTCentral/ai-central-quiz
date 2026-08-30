import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fromRow, type DbRow, type StoredSubmission } from './kv'
import { applyFilterSpec, decodeSpec, type FilterSpec } from './advanced-filter'
import { classifyLedger, loadLedgerAndCharges, type Entry, type TrialPoint } from './trial-entries'

// ────────────────────────────────────────────────────────────────
// Column projection — list-view queries skip the heavy jsonb columns.
// `enrichment_raw` alone averages ~20KB per row (provider raw payloads).
// Pulling all of it for the dashboard's 2.4k+ rows = ~50MB transfer.
// Listing scalars explicitly drops the dashboard payload by ~95%.
// Detail-page queries still use '*' to keep the raw audit blob available.
// ────────────────────────────────────────────────────────────────
const LIST_COLUMNS = [
  // identity
  'id', 'email', 'name', 'ts', 'created_at', 'quiz_completed_at', 'ip', 'user_agent', 'archived_at',
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
  'enrichment_status', 'enriched_at', 'enrichment_verified_at',
  'verification_state', 'verification_evidence', 'verified_at', 'verified_by',
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
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
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

/** Where the stripe_charges mirror (and the matrix's money rows) begin: the
 *  MONDAY of launch week. Launch day was a Sunday, so a mirror starting at
 *  LAUNCH_ISO left the "Jun 29" week column showing only its final day and
 *  silently dropping the Jun 29-Jul 4 trials the owner's spreadsheet has.
 *  Every bucket the matrix can render is fully covered from here. */
export const MIRROR_START_ISO = '2026-06-29'

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
  // Launch scope: the new quiz funnel, submitted since launch.
  //
  // Anchored on quiz_completed_at, which is write-once and enforced by a
  // database trigger. The two comments that used to sit here contradicted each
  // other, one saying created_at gets overwritten by the Stripe import and the
  // other calling it immutable, and the second one was wrong. created_at means
  // "first seen in the CRM by any route": the quiz only sets it on INSERT, so
  // an existing subscriber or Stripe customer who takes the quiz keeps their
  // old date. That hid 97 real post-launch takers from this cohort and let 4
  // pre-existing customers count as net-new.
  //
  // No fallback chain any more. Every quiz row has quiz_completed_at,
  // backfilled from stage_history at 100% coverage, so a row without one is
  // not a quiz row and does not belong in the launch sample.
  if (f.sample === 'launch')       r = r.eq('source', 'quiz_v2').gte('quiz_completed_at', LAUNCH_ISO)
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
  // Test submissions (?test=1 on the quiz) are real rows so the whole flow can
  // be walked end to end, but they must never appear in a reported number.
  r = r.or('is_test.is.null,is_test.eq.false')
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

// The matrix's five revenue rows AND the "Not from the quiz" count, all from
// ONE classification pass over REAL charges in the stripe_charges mirror.
// This function used to classify raw charges itself, which meant the same
// rules lived in two places and drifted; now the database owns the rules and
// this only decides which CLOCK each row sits on.
//
// 'net'          quiz earned the trial from someone who had never paid. Quiz clock.
// 'quizExisting' quiz earned the trial from an existing customer. Quiz clock.
// 'notQuiz'      never took the quiz, or took it after paying. Charge clock.
// 'annual'       the conversion that trial produced, on ITS TRIAL'S clock, so
//                a week column answers "what did that week's trials become".
// 'other'        every remaining dollar in the account: legacy subscriptions,
//                old annual prices, duplicate subscriptions. Charge clock.
// Conversion money is split by WHO earned the trial behind it, because "what
// did the quiz produce" has to include the renewals its trials went on to pay.
// Two real kinds rather than a shadow tag, so ALL REVENUE stays a plain sum of
// its parts and nothing can be double-counted.
//
// The classification itself lives in lib/trial-entries.ts because
// /api/admin/drill replays it to answer "which rows made this cell". A
// drill-down that re-queried would be a second implementation of the same
// rules, which is how every number in this project that disagreed with itself
// got that way.
//
// Moved here from app/admin/dashboard/page.tsx (owner, 2026-08-29): a page.tsx
// file may only export the route-segment surface Next.js expects
// (default/metadata/dynamic/…), so a second caller — /admin/insights, which
// needs the same netNewEmails/quizExistingEmails join for its "who actually
// paid" column — could not import it from there directly.
export async function revenueCharges(): Promise<{
  entries: Entry[]
  mirrored: number
  /** $54.74 bundles ($4.99 trial + $49.75 lifetime) inside the numbers. */
  lifetimeSplits: number
  /** Conversions whose trial cohort predates the visible window. Attributed to
   *  their real (off-screen) cohort and disclosed, never shown under a recent
   *  week that could not have produced them. */
  preWindowAnnuals: number
  /** Emails of quiz-earned trials from EXISTING customers, for the north star. */
  quizExistingEmails: Set<string>
  /** Emails of NET-NEW trial buyers. The ledger decides this rather than a
   *  second computation over submissions: the two agreed at 71 each today, but
   *  they agreed by coincidence of two code paths, and every number in this
   *  project that was computed twice eventually disagreed. */
  netNewEmails: Set<string>
  /** NET quiz revenue per person (their trial + its own renewal, kept money,
   *  rule 6) — for anything pricing a person or a source, so it never falls
   *  back to submissions.lifetime_value_usd, a CRM field that is gross of
   *  Stripe's fees and lags the ledger's own hourly refresh. */
  quizRevenueByEmail: Map<string, number>
  /** People holding more than one paid trial. Owner's rule 2 and 5: they all
   *  count, so this is a fact about the customer base, not a deduction. */
  quizRepeatTrials: number
  /** Every trial with the clock it sits on, whether its renewal date has
   *  passed, and whether it converted. The Trial→annual row is built from
   *  THIS, not from a lifetime-value threshold on submissions — that older
   *  path called a Jun-29 cohort 0% while the ledger showed it converting,
   *  which is exactly the two-sources problem this rebuild exists to kill. */
  trialPoints: TrialPoint[]
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  const empty = { entries: [], mirrored: 0, lifetimeSplits: 0, quizRepeatTrials: 0, preWindowAnnuals: 0, quizExistingEmails: new Set<string>(), netNewEmails: new Set<string>(), quizRevenueByEmail: new Map<string, number>(), trialPoints: [] }
  if (!url || !key) return empty
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })

  const { ledger, charges } = await loadLedgerAndCharges(c)

  // ONE classification pass, shared with /api/admin/drill so the drawer that
  // opens a cell lists the very entries that were summed into it.
  const { entries, trialPoints, lifetimeSplits, preWindowAnnuals, quizExistingEmails, netNewEmails, quizRevenueByEmail } =
    classifyLedger(ledger, charges, MIRROR_START_ISO)

  // People holding more than one paid trial. This used to be the count of
  // trials the ledger threw away as duplicates; nothing is thrown away now
  // (owner's rules 1, 2 and 5 — gross, always, restated 2026-08-29), so it is
  // simply how many people bought twice. A refund does not un-buy the trial.
  const perPerson = new Map<string, number>()
  for (const t of ledger) {
    perPerson.set(t.person_key, (perPerson.get(t.person_key) || 0) + 1)
  }
  const quizRepeatTrials = Array.from(perPerson.values()).filter(n => n > 1).length

  return { entries, mirrored: charges.length, lifetimeSplits, quizRepeatTrials, preWindowAnnuals, quizExistingEmails, netNewEmails, quizRevenueByEmail, trialPoints }
}
