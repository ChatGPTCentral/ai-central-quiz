// Storage layer — Supabase Postgres.
// Filename kept as `kv.ts` for backwards-compat with existing imports.
// Public surface (saveSubmission, getSubmission, etc.) is identical to the
// previous Vercel KV implementation.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ArchetypeKey } from './archetypes'
import type { ApolloEnrichmentResult } from './apollo'
import type { MergedEnrichment, NormalizedPerson } from './enrichment/types'

export interface StoredSubmission {
  id: string
  name: string
  email: string
  aiLevel: string
  workArea: string
  learningStyle: string
  timeCommitment: string
  mainGoal: string
  aiTools: string
  jobLevel: string
  archetype: ArchetypeKey
  score?: number
  apolloData?: ApolloEnrichmentResult
  ts: number
  ip?: string
  userAgent?: string
  // Multi-provider enrichment — denormalized columns for fast filtering
  linkedinUrl?: string
  photoUrl?: string
  jobTitle?: string
  seniority?: string
  jobFunction?: string
  department?: string
  companyName?: string
  companyDomain?: string
  companyLinkedinUrl?: string
  companyWebsite?: string
  companySize?: string
  companyIndustry?: string
  companySubIndustry?: string
  country?: string
  region?: string
  city?: string
  enrichment?: MergedEnrichment
  enrichmentRaw?: Record<string, NormalizedPerson['raw']>
  enrichmentStatus?: 'complete' | 'partial' | 'failed'
  // Legacy import fields
  source?: 'survey' | 'legacy' | 'quiz_v2' | 'fillout_v1' | 'fillout_v2' | 'fillout_legacy' | 'apollo_legacy'
  ageBracket?: string
  buyingIntent?: string
  utmSource?: string
  utmRef?: string
  companyRevenue?: string
  companyFunding?: string
  companyFoundedYear?: number
  legacyResponses?: Record<string, unknown>
  // AI-estimated socio-demographics from profile photo
  ageAiEstimate?: string
  sexAiEstimate?: string
  aiEstimateConfidence?: string
}

// Lazy client — throws only when actually used, so build-time imports don't fail.
let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  // Accept either the documented name or the one Supabase's Vercel integration sets
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing — need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)',
    )
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

// ── snake_case ↔ camelCase helpers ──────────────────────────────
interface DbRow {
  id: string
  name: string | null
  email: string
  ai_level: string | null
  work_area: string | null
  learning_style: string | null
  time_commitment: string | null
  main_goal: string | null
  ai_tools: string | null
  job_level: string | null
  archetype: ArchetypeKey
  score: number | null
  apollo_data: ApolloEnrichmentResult | null
  ts: number
  ip: string | null
  user_agent: string | null
  // Enrichment columns
  linkedin_url: string | null
  photo_url: string | null
  job_title: string | null
  seniority: string | null
  job_function: string | null
  department: string | null
  company_name: string | null
  company_domain: string | null
  company_linkedin_url: string | null
  company_website: string | null
  company_size: string | null
  company_industry: string | null
  company_sub_industry: string | null
  country: string | null
  region: string | null
  city: string | null
  enrichment: MergedEnrichment | null
  enrichment_raw: Record<string, NormalizedPerson['raw']> | null
  enrichment_status: 'complete' | 'partial' | 'failed' | null
  source: string | null
  age_bracket: string | null
  buying_intent: string | null
  utm_source: string | null
  utm_ref: string | null
  company_revenue: string | null
  company_funding: string | null
  company_founded_year: number | null
  legacy_responses: Record<string, unknown> | null
  age_ai_estimate: string | null
  sex_ai_estimate: string | null
  ai_estimate_confidence: string | null
  created_at?: string
}

function toRow(s: StoredSubmission): DbRow {
  return {
    id: s.id,
    name: s.name || null,
    email: s.email,
    ai_level: s.aiLevel || null,
    work_area: s.workArea || null,
    learning_style: s.learningStyle || null,
    time_commitment: s.timeCommitment || null,
    main_goal: s.mainGoal || null,
    ai_tools: s.aiTools || null,
    job_level: s.jobLevel || null,
    archetype: s.archetype,
    score: s.score ?? null,
    apollo_data: s.apolloData ?? null,
    ts: s.ts,
    ip: s.ip || null,
    user_agent: s.userAgent || null,
    linkedin_url: s.linkedinUrl || null,
    photo_url: s.photoUrl || null,
    job_title: s.jobTitle || null,
    seniority: s.seniority || null,
    job_function: s.jobFunction || null,
    department: s.department || null,
    company_name: s.companyName || null,
    company_domain: s.companyDomain || null,
    company_linkedin_url: s.companyLinkedinUrl || null,
    company_website: s.companyWebsite || null,
    company_size: s.companySize || null,
    company_industry: s.companyIndustry || null,
    company_sub_industry: s.companySubIndustry || null,
    country: s.country || null,
    region: s.region || null,
    city: s.city || null,
    enrichment: s.enrichment ?? null,
    enrichment_raw: s.enrichmentRaw ?? null,
    enrichment_status: s.enrichmentStatus ?? null,
    source: s.source || 'quiz_v2',
    age_bracket: s.ageBracket || null,
    buying_intent: s.buyingIntent || null,
    utm_source: s.utmSource || null,
    utm_ref: s.utmRef || null,
    company_revenue: s.companyRevenue || null,
    company_funding: s.companyFunding || null,
    company_founded_year: s.companyFoundedYear ?? null,
    legacy_responses: s.legacyResponses ?? null,
    age_ai_estimate: s.ageAiEstimate || null,
    sex_ai_estimate: s.sexAiEstimate || null,
    ai_estimate_confidence: s.aiEstimateConfidence || null,
  }
}

function fromRow(r: DbRow): StoredSubmission {
  return {
    id: r.id,
    name: r.name || '',
    email: r.email,
    aiLevel: r.ai_level || '',
    workArea: r.work_area || '',
    learningStyle: r.learning_style || '',
    timeCommitment: r.time_commitment || '',
    mainGoal: r.main_goal || '',
    aiTools: r.ai_tools || '',
    jobLevel: r.job_level || '',
    archetype: r.archetype,
    score: r.score ?? undefined,
    apolloData: r.apollo_data ?? undefined,
    ts: r.ts,
    ip: r.ip || undefined,
    userAgent: r.user_agent || undefined,
    linkedinUrl: r.linkedin_url || undefined,
    photoUrl: r.photo_url || undefined,
    jobTitle: r.job_title || undefined,
    seniority: r.seniority || undefined,
    jobFunction: r.job_function || undefined,
    department: r.department || undefined,
    companyName: r.company_name || undefined,
    companyDomain: r.company_domain || undefined,
    companyLinkedinUrl: r.company_linkedin_url || undefined,
    companyWebsite: r.company_website || undefined,
    companySize: r.company_size || undefined,
    companyIndustry: r.company_industry || undefined,
    companySubIndustry: r.company_sub_industry || undefined,
    country: r.country || undefined,
    region: r.region || undefined,
    city: r.city || undefined,
    enrichment: r.enrichment ?? undefined,
    enrichmentRaw: r.enrichment_raw ?? undefined,
    enrichmentStatus: r.enrichment_status ?? undefined,
    source: (r.source as StoredSubmission['source']) ?? undefined,
    ageBracket: r.age_bracket ?? undefined,
    buyingIntent: r.buying_intent ?? undefined,
    utmSource: r.utm_source ?? undefined,
    utmRef: r.utm_ref ?? undefined,
    companyRevenue: r.company_revenue ?? undefined,
    companyFunding: r.company_funding ?? undefined,
    companyFoundedYear: r.company_founded_year ?? undefined,
    legacyResponses: r.legacy_responses ?? undefined,
    ageAiEstimate: r.age_ai_estimate ?? undefined,
    sexAiEstimate: r.sex_ai_estimate ?? undefined,
    aiEstimateConfidence: r.ai_estimate_confidence ?? undefined,
  }
}

// ── Public API (identical signatures to the old KV module) ──────

export async function saveSubmission(s: StoredSubmission): Promise<void> {
  // Check for an existing row (case-insensitive email lookup).
  const existing = await findSubmissionByEmail(s.email)

  if (!existing) {
    const { error } = await client().from('submissions').insert(toRow(s))
    if (error) throw new Error(`Supabase insert failed: ${error.message}`)
    return
  }

  // Re-submission: quiz answers overwrite, enrichment preserved unless missing/failed.
  const merged: StoredSubmission = {
    ...existing,
    // Quiz answers from the new submission always win
    id: existing.id,
    name: s.name || existing.name,
    aiLevel: s.aiLevel || existing.aiLevel,
    workArea: s.workArea || existing.workArea,
    learningStyle: s.learningStyle || existing.learningStyle,
    timeCommitment: s.timeCommitment || existing.timeCommitment,
    mainGoal: s.mainGoal || existing.mainGoal,
    aiTools: s.aiTools || existing.aiTools,
    jobLevel: s.jobLevel || existing.jobLevel,
    archetype: s.archetype,
    score: s.score ?? existing.score,
    ts: s.ts,                       // refresh capture date on re-submit
    ip: s.ip || existing.ip,
    userAgent: s.userAgent || existing.userAgent,
    source: 'quiz_v2',
  }

  // Enrichment: only fill if missing or previously failed
  const enrichmentStale = !existing.enrichmentStatus || existing.enrichmentStatus === 'failed'
  if (enrichmentStale && s.enrichmentStatus) {
    merged.enrichment = s.enrichment
    merged.enrichmentRaw = s.enrichmentRaw
    merged.enrichmentStatus = s.enrichmentStatus
    merged.linkedinUrl = s.linkedinUrl || existing.linkedinUrl
    merged.photoUrl = s.photoUrl || existing.photoUrl
    merged.jobTitle = s.jobTitle || existing.jobTitle
    merged.seniority = s.seniority || existing.seniority
    merged.jobFunction = s.jobFunction || existing.jobFunction
    merged.department = s.department || existing.department
    merged.companyName = s.companyName || existing.companyName
    merged.companyDomain = s.companyDomain || existing.companyDomain
    merged.companySize = s.companySize || existing.companySize
    merged.companyIndustry = s.companyIndustry || existing.companyIndustry
    merged.companySubIndustry = s.companySubIndustry || existing.companySubIndustry
    merged.country = s.country || existing.country
    merged.region = s.region || existing.region
    merged.city = s.city || existing.city
  }

  const { error } = await client()
    .from('submissions')
    .update(toRow(merged))
    .eq('id', existing.id)
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
}

export async function getSubmission(id: string): Promise<StoredSubmission | null> {
  const { data, error } = await client()
    .from('submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Supabase select failed: ${error.message}`)
  return data ? fromRow(data as DbRow) : null
}

export async function findSubmissionByEmail(email: string): Promise<StoredSubmission | null> {
  const clean = email.trim().toLowerCase()
  const { data, error } = await client()
    .from('submissions')
    .select('*')
    .ilike('email', clean)
    .order('ts', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Supabase select failed: ${error.message}`)
  return data ? fromRow(data as DbRow) : null
}

export async function listSubmissions(opts: { offset?: number; limit?: number } = {}): Promise<{ items: StoredSubmission[]; total: number }> {
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? 50
  const { data, error, count } = await client()
    .from('submissions')
    .select('*', { count: 'exact' })
    .order('ts', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(`Supabase list failed: ${error.message}`)
  return {
    items: (data || []).map(r => fromRow(r as DbRow)),
    total: count || 0,
  }
}

export async function deleteSubmission(id: string): Promise<void> {
  const { error } = await client().from('submissions').delete().eq('id', id)
  if (error) throw new Error(`Supabase delete failed: ${error.message}`)
}

export async function countSubmissionsSince(ts: number): Promise<number> {
  const { count, error } = await client()
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .gte('ts', ts)
  if (error) throw new Error(`Supabase count failed: ${error.message}`)
  return count || 0
}

export async function allSubmissionsForExport(): Promise<StoredSubmission[]> {
  const { data, error } = await client()
    .from('submissions')
    .select('*')
    .order('ts', { ascending: false })
  if (error) throw new Error(`Supabase export failed: ${error.message}`)
  return (data || []).map(r => fromRow(r as DbRow))
}
