import type { Provider, NormalizedPerson } from './types'

// Wiza — reverse email lookup (also "email to LinkedIn")
// https://wiza.co/api
// Wiza's email → person endpoint is `POST /api/email_lookups` (instant if cached)
interface WizaResponse {
  status?: { code?: number; message?: string }
  data?: {
    full_name?: string
    first_name?: string
    last_name?: string
    title?: string
    seniority?: string
    department?: string
    linkedin_url?: string
    profile_image?: string
    location?: string
    location_country?: string
    location_state?: string
    location_city?: string
    company?: string
    company_domain?: string
    company_industry?: string
    company_size?: string
    company_linkedin?: string
  }
}

export const wizaProvider: Provider = {
  name: 'wiza',
  async lookup({ email }): Promise<NormalizedPerson | null> {
    const apiKey = process.env.WIZA_API_KEY
    if (!apiKey) return null

    try {
      const res = await fetch('https://wiza.co/api/email_lookups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ email_lookup: { email } }),
      })
      if (!res.ok) {
        if (res.status !== 404) console.error('Wiza error:', res.status)
        return null
      }
      const data: WizaResponse = await res.json()
      const p = data?.data
      if (!p) return null

      return {
        source: 'wiza',
        firstName: p.first_name,
        lastName: p.last_name,
        fullName: p.full_name,
        linkedinUrl: p.linkedin_url,
        jobTitle: p.title,
        seniority: p.seniority,
        department: p.department,
        companyName: p.company,
        companyDomain: p.company_domain,
        companySize: p.company_size,
        companyLinkedinUrl: p.company_linkedin,
        industry: p.company_industry,
        country: p.location_country,
        region: p.location_state,
        city: p.location_city,
        photoUrl: p.profile_image,
        raw: p,
      }
    } catch (err) {
      console.error('Wiza enrichment failed:', err)
      return null
    }
  },
}
