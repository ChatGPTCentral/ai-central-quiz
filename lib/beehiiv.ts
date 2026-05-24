import type { ApolloEnrichmentResult } from './apollo'
import type { ArchetypeKey } from './archetypes'
import { ARCHETYPES } from './archetypes'

const BEEHIIV_API_BASE = 'https://api.beehiiv.com/v2'
const PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID || 'pub_685dd277-3d37-4105-9320-d248c9e28f76'

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
  archetype: ArchetypeKey
  apolloData: ApolloEnrichmentResult
}

export async function createBeehiivSubscriber(payload: CreateSubscriberPayload): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.BEEHIIV_API_KEY
  if (!apiKey) {
    console.error('beehiiv API key not configured')
    return { success: false, error: 'Server configuration error' }
  }

  const archetypeConfig = ARCHETYPES[payload.archetype]

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
    tags: archetypeConfig.tags,
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
