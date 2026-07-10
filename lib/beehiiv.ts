import type { ApolloEnrichmentResult } from './apollo'
import { findBeehiivSubscriberByEmail } from './enrichment/beehiiv-lookup'

const BEEHIIV_API_BASE = 'https://api.beehiiv.com/v2'
const PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID || 'pub_685dd277-3d37-4105-9320-d248c9e28f76'

/** Tag prefix for the AI Adoption Ladder rung — `stage_S2_experimenter` etc. */
export function stageTag(stageKey: string): string {
  return `stage_${stageKey}`
}

/** Tag prefix for the role persona — `persona_decision_maker` etc. */
export function personaTag(personaKey: string): string {
  return `persona_${personaKey}`
}

interface CustomField {
  name: string
  value: string
}

export interface CreateSubscriberPayload {
  name: string
  email: string
  aiLevel: string
  workArea: string
  learningStyle: string
  timeCommitment: string
  mainGoal: string
  aiTools: string
  jobLevel: string
  persona: string
  apolloData: ApolloEnrichmentResult
}

export async function createBeehiivSubscriber(payload: CreateSubscriberPayload): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.BEEHIIV_API_KEY
  if (!apiKey) {
    console.error('beehiiv API key not configured')
    return { success: false, error: 'Server configuration error' }
  }

  const customFields: CustomField[] = [
    { name: 'quiz_name', value: payload.name },
    { name: 'ai_level', value: payload.aiLevel },
    { name: 'work_area', value: payload.workArea },
    { name: 'learning_style', value: payload.learningStyle },
    { name: 'time_commitment', value: payload.timeCommitment },
    { name: 'main_goal', value: payload.mainGoal },
    { name: 'ai_tools', value: payload.aiTools || '' },
    { name: 'job_level', value: payload.jobLevel },
    { name: 'apollo_enriched', value: payload.apolloData.success ? 'true' : 'false' },
  ]

  if (payload.apolloData.success) {
    if (payload.apolloData.companyName) customFields.push({ name: 'apollo_company_name', value: payload.apolloData.companyName })
    if (payload.apolloData.companySize) customFields.push({ name: 'apollo_company_size', value: payload.apolloData.companySize })
    if (payload.apolloData.industry) customFields.push({ name: 'apollo_industry', value: payload.apolloData.industry })
    if (payload.apolloData.linkedinUrl) customFields.push({ name: 'apollo_linkedin_url', value: payload.apolloData.linkedinUrl })
    if (payload.apolloData.jobTitle) customFields.push({ name: 'apollo_job_title', value: payload.apolloData.jobTitle })
  }

  const body = {
    email: payload.email,
    reactivate_existing: false,
    send_welcome_email: true,
    utm_source: 'quiz',
    utm_medium: 'personalized_signup',
    utm_campaign: 'quiz_v2',
    tags: payload.persona && payload.persona !== 'unknown' ? [personaTag(payload.persona)] : [],
    custom_fields: customFields,
  }

  try {
    const response = await fetch(`${BEEHIIV_API_BASE}/publications/${PUBLICATION_ID}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (response.status === 201 || response.status === 200) {
      return { success: true }
    }

    if (response.status === 400 && data?.errors?.some((e: { message: string }) => e.message?.includes('already'))) {
      return { success: false, error: 'ALREADY_SUBSCRIBED' }
    }

    console.error('beehiiv API error:', response.status, data)
    return { success: false, error: 'Subscription failed' }
  } catch (err) {
    console.error('beehiiv request failed:', err)
    return { success: false, error: 'Network error' }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Stage-centric API (Survey v2)
//
// The v1 createBeehiivSubscriber above ships every quiz answer to Beehiiv
// as a custom field. v2 inverts that: the only signal marketing branches
// on inside Beehiiv is the AI Adoption Ladder rung (stage), so we sync
// just that — once at signup, and again on every retake. The persona
// tag tags along as a low-cost secondary classifier; everything else
// stays in our DB.
// ─────────────────────────────────────────────────────────────────────

export interface StageSubscribePayload {
  email: string
  name: string
  /** AI Adoption Ladder rung, e.g. 'S2_experimenter'. Pass null if unknown. */
  stage: string | null
  /** Persona key for the persona_<key> secondary tag. Optional. */
  persona?: string | null
  /** Extra literal tags to attach (e.g. 'free_course' for the downsell). */
  extraTags?: string[]
  utm?: {
    source?: string | null
    medium?: string | null
    campaign?: string | null
  }
}

export interface StageResult {
  success: boolean
  /** 'ALREADY_SUBSCRIBED' is a sentinel — callers should follow up with
   *  updateSubscriberStage so we don't drop the stage on a duplicate. */
  error?: string
  subscriptionId?: string
}

function stageCustomFields(name: string, stage: string | null): CustomField[] {
  const fields: CustomField[] = []
  if (name) {
    // Preserve the v1 quiz_name field for backwards-compat with existing
    // beehiiv-lookup name parsing.
    fields.push({ name: 'quiz_name', value: name })
    const parts = name.trim().split(/\s+/)
    if (parts[0]) fields.push({ name: 'first_name', value: parts[0] })
    if (parts.length > 1) fields.push({ name: 'last_name', value: parts.slice(1).join(' ') })
  }
  if (stage) fields.push({ name: 'stage', value: stage })
  return fields
}

function stageTags(stage: string | null, persona: string | null | undefined): string[] {
  const tags: string[] = []
  if (stage) tags.push(stageTag(stage))
  // Persona rides along as a low-cost secondary classifier; stage stays the
  // primary signal marketing branches on.
  if (persona && persona !== 'unknown') tags.push(personaTag(persona))
  return tags
}

/**
 * Create a Beehiiv subscriber with stage-only segmentation. Used on the
 * first completion of the v2 quiz. On 400/ALREADY_SUBSCRIBED, returns the
 * sentinel so the caller can fall through to updateSubscriberStage —
 * that's the bug v1 hit (it silently dropped retakes).
 */
export async function subscribeWithStage(payload: StageSubscribePayload): Promise<StageResult> {
  const apiKey = process.env.BEEHIIV_API_KEY
  if (!apiKey) {
    console.error('beehiiv API key not configured')
    return { success: false, error: 'Server configuration error' }
  }

  const body = {
    email: payload.email,
    reactivate_existing: false,
    send_welcome_email: true,
    utm_source: payload.utm?.source ?? 'quiz',
    utm_medium: payload.utm?.medium ?? 'personalized_signup',
    utm_campaign: payload.utm?.campaign ?? 'quiz_v2',
    tags: [...stageTags(payload.stage, payload.persona), ...(payload.extraTags ?? [])],
    custom_fields: stageCustomFields(payload.name, payload.stage),
  }

  try {
    const response = await fetch(`${BEEHIIV_API_BASE}/publications/${PUBLICATION_ID}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const data = await response.json().catch(() => ({}))

    if (response.status === 201 || response.status === 200) {
      const id = (data?.data?.id as string | undefined) ?? undefined
      return { success: true, subscriptionId: id }
    }

    if (response.status === 400 && data?.errors?.some((e: { message: string }) => e.message?.includes('already'))) {
      return { success: false, error: 'ALREADY_SUBSCRIBED' }
    }

    console.error('beehiiv subscribeWithStage error:', response.status, data)
    return { success: false, error: 'Subscription failed' }
  } catch (err) {
    console.error('beehiiv subscribeWithStage failed:', err)
    return { success: false, error: 'Network error' }
  }
}

/**
 * Update an existing Beehiiv subscriber's stage. PATCHes the `stage`
 * custom field on the subscription and adds the new stage_<key> tag.
 *
 * Note on tag rotation: Beehiiv's v2 API removes tags only by tag id (not
 * by name), and we already do one lookup to get the subscription id. We
 * intentionally do NOT pay for a second round-trip to remove the prior
 * stage_<key> tag — old tags accumulate, but the source of truth for
 * downstream automations is the `stage` custom field, and the newly added
 * tag is the trigger event marketing branches on. If we later need a
 * single tag per subscriber, swap this for a stale-tag sweep job.
 */
export async function updateSubscriberStage(input: {
  email: string
  stage: string
}): Promise<StageResult> {
  const apiKey = process.env.BEEHIIV_API_KEY
  if (!apiKey) {
    console.error('beehiiv API key not configured')
    return { success: false, error: 'Server configuration error' }
  }

  const lookup = await findBeehiivSubscriberByEmail(input.email)
  const subId = lookup?.subscriptionId
  if (!subId) {
    return { success: false, error: 'NOT_SUBSCRIBED' }
  }

  // 1) PATCH the stage custom field.
  try {
    const patchRes = await fetch(
      `${BEEHIIV_API_BASE}/publications/${PUBLICATION_ID}/subscriptions/${subId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          custom_fields: [{ name: 'stage', value: input.stage }],
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!patchRes.ok) {
      const text = await patchRes.text().catch(() => '')
      console.error('beehiiv updateSubscriberStage PATCH failed:', patchRes.status, text.slice(0, 200))
      return { success: false, error: 'Update failed', subscriptionId: subId }
    }
  } catch (err) {
    console.error('beehiiv updateSubscriberStage PATCH threw:', err)
    return { success: false, error: 'Network error', subscriptionId: subId }
  }

  // 2) Add the new stage_<key> tag. Non-fatal — the custom field is the
  //    source of truth; the tag is a convenience trigger.
  try {
    const tagRes = await fetch(
      `${BEEHIIV_API_BASE}/publications/${PUBLICATION_ID}/subscriptions/${subId}/tags`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ tags: [stageTag(input.stage)] }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!tagRes.ok && tagRes.status !== 409 /* already has tag */) {
      const text = await tagRes.text().catch(() => '')
      console.error('beehiiv updateSubscriberStage tag add failed:', tagRes.status, text.slice(0, 200))
    }
  } catch (err) {
    console.error('beehiiv updateSubscriberStage tag add threw:', err)
  }

  return { success: true, subscriptionId: subId }
}

/**
 * Suppression tags for lifecycle automations. `customer_active` marks any
 * email with Stripe LTV > 0 (entry filters exclude it so paying customers
 * are never pitched the $4.99 trial); `purchased` is the mid-journey exit
 * trigger. Applied by the Stripe webhook on every synced charge, so the
 * tags land within seconds of a payment. NOT_SUBSCRIBED is a fine outcome —
 * someone not on the list has nothing to suppress.
 */
export async function applyCustomerTags(email: string): Promise<StageResult> {
  return addSubscriberTags({ email, tags: ['customer_active', 'purchased'] })
}

/**
 * Attach literal tags to an already-subscribed email (looked up by email).
 * Used by the free-course downsell to tag existing subscribers whom
 * subscribeWithStage returned ALREADY_SUBSCRIBED for. Returns NOT_SUBSCRIBED
 * when the email isn't on the list.
 */
export async function addSubscriberTags(input: { email: string; tags: string[] }): Promise<StageResult> {
  const apiKey = process.env.BEEHIIV_API_KEY
  if (!apiKey) return { success: false, error: 'Server configuration error' }

  const lookup = await findBeehiivSubscriberByEmail(input.email)
  const subId = lookup?.subscriptionId
  if (!subId) return { success: false, error: 'NOT_SUBSCRIBED' }

  try {
    const res = await fetch(
      `${BEEHIIV_API_BASE}/publications/${PUBLICATION_ID}/subscriptions/${subId}/tags`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ tags: input.tags }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!res.ok && res.status !== 409 /* already has tag */) {
      const text = await res.text().catch(() => '')
      console.error('beehiiv addSubscriberTags failed:', res.status, text.slice(0, 200))
      return { success: false, error: 'Tag failed', subscriptionId: subId }
    }
  } catch (err) {
    console.error('beehiiv addSubscriberTags threw:', err)
    return { success: false, error: 'Network error', subscriptionId: subId }
  }
  return { success: true, subscriptionId: subId }
}
