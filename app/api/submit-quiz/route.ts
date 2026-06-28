import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { validateQuizSubmission, checkRateLimit } from '@/lib/validation'
import { type ApolloEnrichmentResult } from '@/lib/apollo'
import { createBeehiivSubscriber } from '@/lib/beehiiv'
import { saveSubmission, type StoredSubmission } from '@/lib/kv'
import { assignSegmentationV2 } from '@/lib/segmentation-v2'
import { calculateAIScore } from '@/lib/score'
import { runEnrichment } from '@/lib/enrichment/waterfall'

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'me.com',
  'live.com', 'msn.com', 'mail.com', 'ymail.com',
])

function shouldEnrich(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return !!domain && !PERSONAL_EMAIL_DOMAINS.has(domain)
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Too many submissions. Please try again in an hour.', code: 'RATE_LIMITED' },
      { status: 429 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  const formData = {
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    aiLevel: String(body.aiLevel || ''),
    workArea: String(body.workArea || ''),
    learningStyle: String(body.learningStyle || ''),
    timeCommitment: String(body.timeCommitment || ''),
    mainGoal: String(body.mainGoal || ''),
    aiTools: String(body.aiTools || ''),
    jobLevel: String(body.jobLevel || ''),
  }

  const utmSource = String(body.utmSource || '').trim().slice(0, 120) || undefined
  const utmRef    = String(body.utmRef    || '').trim().slice(0, 120) || undefined

  const { valid, errors } = validateQuizSubmission(formData)
  if (!valid) {
    return NextResponse.json({ success: false, error: 'Validation failed', errors }, { status: 400 })
  }

  // Multi-provider enrichment waterfall (Apollo → Databar → Wiza, cached)
  let enrichmentSuccess = false
  let enrichedRow: Partial<Parameters<typeof saveSubmission>[0]> = {}
  let apolloLegacy: ApolloEnrichmentResult = { success: false }

  if (shouldEnrich(formData.email)) {
    try {
      const enriched = await runEnrichment(formData.email)
      enrichmentSuccess = enriched.status !== 'failed'
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
      // Maintain legacy apollo_data for backwards compat
      if (enriched.raw.apollo) {
        apolloLegacy = {
          success: true,
          companyName: enriched.merged.companyName,
          companySize: enriched.merged.companySize,
          industry: enriched.merged.industry,
          linkedinUrl: enriched.merged.linkedinUrl,
          jobTitle: enriched.merged.jobTitle,
          seniorityLevel: enriched.merged.seniority,
        }
      }
    } catch (err) {
      console.error('enrichment waterfall failed:', err)
    }
  }

  // Persist to Supabase (fire-and-forget — failures must not block the user)
  const submissionId = randomUUID()
  const aiToolsCount = (formData.aiTools || '').split(',').map(s => s.trim()).filter(v => v && v !== 'None').length
  const score = calculateAIScore(formData.aiLevel, formData.timeCommitment, aiToolsCount)

  const submission: StoredSubmission = {
    id: submissionId,
    ...formData,
    score,
    apolloData: apolloLegacy,
    ts: Date.now(),
    ip,
    userAgent: req.headers.get('user-agent') || undefined,
    utmSource,
    utmRef,
    ...enrichedRow,
  }
  // Classify role (persona) + ladder stage up front so legacy submissions
  // stay consistent with the v2 funnel.
  const seg = assignSegmentationV2(submission)
  submission.stage = seg.stage
  submission.stageScore = seg.stageScore
  submission.stageReason = seg.stageReason
  submission.persona = seg.persona
  submission.personaReason = seg.personaReason
  submission.stagedAt = new Date().toISOString()

  saveSubmission(submission).catch(err => console.error('Supabase save failed:', err))

  const hasBeehiivKey = !!process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_API_KEY !== 'your_beehiiv_api_key_here'
  let alreadySubscribed = false
  if (hasBeehiivKey) {
    const result = await createBeehiivSubscriber({ ...formData, persona: seg.persona, apolloData: apolloLegacy })
    if (result.error === 'ALREADY_SUBSCRIBED') alreadySubscribed = true
    if (!result.success && result.error !== 'ALREADY_SUBSCRIBED') {
      console.error('beehiiv subscription failed:', result.error)
    }
  }

  fetch('https://hook.relay.app/api/v1/playbook/cmov5h7mt0mfl0pkndjope6sw/trigger/SgnIcVm2F0MQepnTBLfznA', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...formData,
      persona: seg.persona,
      apolloEnriched: enrichmentSuccess,
      linkedinUrl: enrichedRow.linkedinUrl,
      companyName: enrichedRow.companyName,
      timestamp: new Date().toISOString(),
    }),
  }).catch(console.error)

  return NextResponse.json({
    success: true,
    persona: seg.persona,
    name: formData.name,
    apolloEnriched: enrichmentSuccess,
    alreadySubscribed,
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
