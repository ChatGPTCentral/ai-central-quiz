import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { checkRateLimit } from '@/lib/validation'
import { createBeehiivSubscriber } from '@/lib/beehiiv'
import { determineArchetype } from '@/lib/archetypes'
import { findSubmissionByEmail, fromRow, type StoredSubmission } from '@/lib/kv'
import { runEnrichment } from '@/lib/enrichment/waterfall'
import { answersToDb, calculateScoreV2, QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'
import { getLivePublishedConfig } from '@/lib/form-config'
import { assignSegmentationV2 } from '@/lib/segmentation-v2'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com',
  'aol.com', 'protonmail.com', 'me.com', 'live.com', 'msn.com', 'mail.com', 'ymail.com',
])
function shouldEnrich(email: string): boolean {
  const d = email.split('@')[1]?.toLowerCase()
  return !!d && !PERSONAL_EMAIL_DOMAINS.has(d)
}

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/submit-quiz-v2
 *
 * The merged Survey v2 endpoint. Body shape: { answers: Record<questionId, value>, utmSource?, utmRef? }
 *
 * Differs from /api/submit-quiz in that it:
 *   - Writes the new sandbox columns (frequency_score, depth_score, breadth_score, momentum, friction, intent_30d)
 *   - Uses the v2 score formula
 *   - Auto-classifies via assignSegmentationV2 after save
 *   - Skips the dropped v1 columns (ai_level, learning_style, time_commitment, main_goal)
 *
 * Doesn't touch /api/submit-quiz so the existing flow stays alive while we A/B test.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ success: false, error: 'Rate limited', code: 'RATE_LIMITED' }, { status: 429 })
  }

  let body: { answers?: Record<string, string | string[]>; utmSource?: string; utmRef?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
  }
  const answers = body.answers || {}
  // Convert answers against the live published config (so editor changes apply
  // immediately) — fall back to the seed array if the config fetch fails.
  let questionsForMap = QUESTIONS_V2_MERGED
  try {
    const cfg = await getLivePublishedConfig('quiz-v2')
    if (cfg && Array.isArray(cfg.questions) && cfg.questions.length > 0) {
      questionsForMap = cfg.questions
    }
  } catch (err) {
    console.error('[submit-quiz-v2] live config fetch failed, using seed:', err)
  }
  const v = answersToDb(answers, questionsForMap)

  if (!v.email || !v.name) {
    return NextResponse.json({ success: false, error: 'Name and email required' }, { status: 400 })
  }

  const utmSource = (body.utmSource || '').trim().slice(0, 120) || null
  const utmRef    = (body.utmRef    || '').trim().slice(0, 120) || null

  // Score (v2 formula)
  const score = calculateScoreV2({
    frequencyScore: v.frequency_score,
    depthScore: v.depth_score,
    breadthScore: v.breadth_score,
  })

  // Archetype — reuse the legacy mapping from v1 answers where possible.
  // We don't have aiLevel/timeCommitment/mainGoal/learningStyle in v2; pass
  // empty strings → determineArchetype falls back to a sensible default.
  const archetype = determineArchetype({
    name: v.name,
    email: v.email,
    aiLevel: '',
    workArea: v.work_area || '',
    learningStyle: '',
    timeCommitment: '',
    mainGoal: '',
    aiTools: v.ai_tools || '',
    jobLevel: v.job_level || '',
  })

  // Enrichment (work emails only, fire-and-forget for personal domains)
  let enrichedRow: Partial<StoredSubmission> = {}
  let enrichmentStatus: StoredSubmission['enrichmentStatus'] = undefined
  if (shouldEnrich(v.email)) {
    try {
      const enriched = await runEnrichment(v.email)
      enrichmentStatus = enriched.status
      enrichedRow = {
        linkedinUrl: enriched.merged.linkedinUrl,
        photoUrl: enriched.merged.photoUrl,
        jobTitle: enriched.merged.jobTitle,
        seniority: enriched.merged.seniority,
        jobFunction: enriched.merged.function,
        department: enriched.merged.department,
        companyName: enriched.merged.companyName,
        companyDomain: enriched.merged.companyDomain,
        companySize: enriched.merged.companySize,
        companyIndustry: enriched.merged.industry,
        companySubIndustry: enriched.merged.subIndustry,
        country: enriched.merged.country,
        region: enriched.merged.region,
        city: enriched.merged.city,
        enrichment: enriched.merged,
        enrichmentRaw: enriched.raw,
        enrichmentStatus: enriched.status,
      }
    } catch (e) {
      console.error('v2 enrichment failed:', e)
    }
  }

  const existing = await findSubmissionByEmail(v.email)
  const c = sb()

  const dbUpdate = {
    name: v.name,
    email: v.email,
    ai_tools: v.ai_tools ?? null,
    work_area: v.work_area ?? null,
    job_level: v.job_level ?? null,
    frequency_score: v.frequency_score ?? null,
    depth_score: v.depth_score ?? null,
    breadth_score: v.breadth_score ?? null,
    momentum: v.momentum ?? null,
    friction: v.friction ?? null,
    intent_30d: v.intent_30d ?? null,
    archetype,
    score,
    utm_source: utmSource,
    utm_ref: utmRef,
    source: 'quiz_v2' as const,
    enrichment_status: enrichmentStatus ?? null,
    enriched_at: enrichmentStatus ? new Date().toISOString() : null,
    // Enrichment denormalized columns (when available)
    linkedin_url: enrichedRow.linkedinUrl ?? undefined,
    photo_url: enrichedRow.photoUrl ?? undefined,
    job_title: enrichedRow.jobTitle ?? undefined,
    seniority: enrichedRow.seniority ?? undefined,
    job_function: enrichedRow.jobFunction ?? undefined,
    department: enrichedRow.department ?? undefined,
    company_name: enrichedRow.companyName ?? undefined,
    company_domain: enrichedRow.companyDomain ?? undefined,
    company_size: enrichedRow.companySize ?? undefined,
    company_industry: enrichedRow.companyIndustry ?? undefined,
    company_sub_industry: enrichedRow.companySubIndustry ?? undefined,
    country: enrichedRow.country ?? undefined,
    region: enrichedRow.region ?? undefined,
    city: enrichedRow.city ?? undefined,
  }
  // strip explicitly-undefined keys so we don't overwrite enrichment with nulls
  for (const k of Object.keys(dbUpdate) as (keyof typeof dbUpdate)[]) {
    if (dbUpdate[k] === undefined) delete dbUpdate[k]
  }

  let rowId: string
  if (existing) {
    rowId = existing.id
    const { error } = await c.from('submissions').update(dbUpdate).eq('id', rowId)
    if (error) console.error('v2 update failed:', error.message)
  } else {
    rowId = randomUUID()
    const { error } = await c.from('submissions').insert({
      id: rowId,
      ts: Date.now(),
      created_at: new Date().toISOString(),
      ip,
      user_agent: req.headers.get('user-agent') || null,
      ...dbUpdate,
    })
    if (error) console.error('v2 insert failed:', error.message)
  }

  // Re-read and classify
  const { data: rowAfter } = await c.from('submissions').select('*').eq('id', rowId).maybeSingle()
  if (rowAfter) {
    const seg = assignSegmentationV2(fromRow(rowAfter as Parameters<typeof fromRow>[0]))
    await c.from('submissions').update({
      stage: seg.stage,
      stage_score: seg.stageScore,
      stage_reason: seg.stageReason,
      persona: seg.persona,
      persona_reason: seg.personaReason,
      staged_at: new Date().toISOString(),
    }).eq('id', rowId)
    // Append history snapshot for transition charting later
    await c.from('stage_history').insert({
      submission_id: rowId,
      stage: seg.stage,
      stage_score: seg.stageScore,
      persona: seg.persona,
    })
  }

  // Beehiiv subscription (fire-and-forget except for known-fail)
  const hasBeehiiv = !!process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_API_KEY !== 'your_beehiiv_api_key_here'
  let alreadySubscribed = false
  if (hasBeehiiv) {
    const result = await createBeehiivSubscriber({
      name: v.name!, email: v.email!, archetype,
      aiLevel: '', workArea: v.work_area || '', learningStyle: '',
      timeCommitment: '', mainGoal: '', aiTools: v.ai_tools || '',
      jobLevel: v.job_level || '',
      apolloData: { success: false },
    })
    if (result.error === 'ALREADY_SUBSCRIBED') alreadySubscribed = true
    if (!result.success && result.error !== 'ALREADY_SUBSCRIBED') {
      console.error('v2 beehiiv failed:', result.error)
    }
  }

  return NextResponse.json({
    success: true,
    id: rowId,
    archetype,
    name: v.name,
    score,
    alreadySubscribed,
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
