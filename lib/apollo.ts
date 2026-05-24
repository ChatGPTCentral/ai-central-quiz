const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'me.com',
  'live.com', 'msn.com', 'mail.com', 'ymail.com',
])

export function shouldEnrichEmail(email: string, companySize: string): boolean {
  if (companySize === 'Just me (solo)') return false
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  return !PERSONAL_EMAIL_DOMAINS.has(domain)
}

export interface ApolloEnrichmentResult {
  success: boolean
  companyName?: string
  companySize?: string
  industry?: string
  linkedinUrl?: string
  jobTitle?: string
  seniorityLevel?: string
}

export async function enrichWithApollo(email: string): Promise<ApolloEnrichmentResult> {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) {
    console.warn('Apollo API key not configured')
    return { success: false }
  }

  try {
    const response = await fetch('https://api.apollo.io/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({
        email,
        reveal_personal_emails: false,
        reveal_phone_number: false,
      }),
    })

    if (!response.ok) {
      console.error('Apollo API error:', response.status)
      return { success: false }
    }

    const data = await response.json()
    const person = data?.person

    if (!person) return { success: false }

    return {
      success: true,
      companyName: person.organization?.name,
      companySize: person.organization?.estimated_num_employees?.toString(),
      industry: person.organization?.industry,
      linkedinUrl: person.linkedin_url,
      jobTitle: person.title,
      seniorityLevel: person.seniority,
    }
  } catch (err) {
    console.error('Apollo enrichment failed:', err)
    return { success: false }
  }
}
