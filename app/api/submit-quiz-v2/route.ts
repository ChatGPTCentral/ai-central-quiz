import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { waitUntil } from '@vercel/functions'
import { checkRateLimit } from '@/lib/validation'
import { subscribeWithStage, updateSubscriberStage } from '@/lib/beehiiv'
import { findSubmissionByEmail, fromRow } from '@/lib/kv'
import { answersToDb, calculateScoreV2, QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'
import { getLivePublishedConfig } from '@/lib/form-config'
import { assignSegmentationV2 } from '@/lib/segmentation-v2'
import { enrichLeadAndNotify } from '@/lib/enrichment/enrich-lead'
import { deletePartial } from '@/lib/partials'
import { createClient } from '@supabase/supabase-js'

// The quiz taker gets a fast response; enrichment + the admin email run in
// the background via waitUntil (the Apify actor alone can take 30-90s), so
// the lambda needs headroom well past the user-facing turnaround.
export const maxDuration = 300

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

  // Enrichment now runs in the BACKGROUND (after the response) for EVERY
  // lead, personal domains included — see enrichLeadAndNotify below. This
  // keeps the Apify actor (30-90s) off the quiz taker's critical path.
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
    depth_actions: v.depth_actions ?? null,
    breadth_score: v.breadth_score ?? null,
    momentum: v.momentum ?? null,
    friction: v.friction ?? null,
    intent_30d: v.intent_30d ?? null,
    score,
    utm_source: utmSource,
    utm_ref: utmRef,
    source: 'quiz_v2' as const,
  }

  let rowId: string
  if (existing) {
    rowId = existing.id
    const { error } = await c.from('submissions').update(dbUpdate).eq('id', rowId)
    if (error) console.error('v2 update failed:', error.message)
  } else {
    rowId = randomUUID()
    // Vercel injects x-vercel-ip-country (ISO 3166 alpha-2) on every edge
    // request — capture it as the user's submit-time geolocation, distinct
    // from `country` which downstream enrichment overwrites with company /
    // role location.
    const ipCountry = req.headers.get('x-vercel-ip-country') || null
    const { error } = await c.from('submissions').insert({
      id: rowId,
      ts: Date.now(),
      created_at: new Date().toISOString(),
      ip,
      ip_country: ipCountry,
      user_agent: req.headers.get('user-agent') || null,
      ...dbUpdate,
    })
    if (error) console.error('v2 insert failed:', error.message)
  }

  // Promote out of "In progress": a completed submission removes any matching
  // partial capture so it no longer shows in the in-progress admin section.
  deletePartial(v.email).catch(err => console.error('[partials] cleanup failed:', err))

  // Re-read and classify
  const { data: rowAfter } = await c.from('submissions').select('*').eq('id', rowId).maybeSingle()
  let computedStage: string | null = null
  let computedPersona: string | null = null
  if (rowAfter) {
    const seg = assignSegmentationV2(fromRow(rowAfter as Parameters<typeof fromRow>[0]))
    computedStage = seg.stage
    computedPersona = seg.persona
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

  // Beehiiv stage sync — stage-only, retake-aware. New submissions create
  // the subscriber; retakes PATCH the stage. If a new submission collides
  // with an already-subscribed email, we still update so the stage doesn't
  // get dropped (the v1 short-circuit bug).
  const hasBeehiiv = !!process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_API_KEY !== 'your_beehiiv_api_key_here'
  let alreadySubscribed = false
  if (hasBeehiiv && computedStage) {
    if (existing) {
      const upd = await updateSubscriberStage({ email: v.email!, stage: computedStage })
      if (!upd.success && upd.error !== 'NOT_SUBSCRIBED') {
        console.error('v2 beehiiv update failed:', upd.error)
      }
      // If they retake but were never subscribed (e.g. unsubscribed and the
      // row is gone), fall through to a fresh subscribe.
      if (upd.error === 'NOT_SUBSCRIBED') {
        const sub = await subscribeWithStage({
          email: v.email!, name: v.name!, stage: computedStage, persona: computedPersona,
          utm: { source: utmSource ?? undefined },
        })
        if (!sub.success && sub.error !== 'ALREADY_SUBSCRIBED') {
          console.error('v2 beehiiv subscribe failed:', sub.error)
        }
      }
    } else {
      const sub = await subscribeWithStage({
        email: v.email!, name: v.name!, stage: computedStage, persona: computedPersona,
        utm: { source: utmSource ?? undefined },
      })
      if (sub.error === 'ALREADY_SUBSCRIBED') {
        alreadySubscribed = true
        // Fresh quiz fill but already on the newsletter from another funnel —
        // make sure the stage gets onto their record.
        const upd = await updateSubscriberStage({ email: v.email!, stage: computedStage })
        if (!upd.success) console.error('v2 beehiiv post-collide update failed:', upd.error)
      } else if (!sub.success) {
        console.error('v2 beehiiv subscribe failed:', sub.error)
      }
    }
  }

  // Enrichment + admin notification, in the BACKGROUND. waitUntil keeps the
  // lambda alive past the response so the (30-90s) Apify actor and the other
  // providers can run, then the email is sent from the fully enriched row —
  // no more "not enriched" notifications. New submissions only (retakes are
  // already known); resend one manually via /api/admin/notify/resend.
  if (!existing) {
    waitUntil(
      enrichLeadAndNotify(rowId, { siteUrl: process.env.NEXT_PUBLIC_SITE_URL })
        .catch(err => console.error('[submit] background enrich/notify failed:', err)),
    )
  }

  return NextResponse.json({
    success: true,
    id: rowId,
    persona: computedPersona,
    stage: computedStage,
    name: v.name,
    score,
    alreadySubscribed,
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
