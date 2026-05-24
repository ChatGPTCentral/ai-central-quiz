import type { Provider, NormalizedPerson } from './types'

// Databar — meta-aggregator across 100+ providers
// API shape per Databar docs; if your account uses a different endpoint, adjust here.
// https://databar.ai/api
interface DatabarResponse {
  person?: {
    full_name?: string
    first_name?: string
    last_name?: string
    job_title?: string
    seniority?: string
    function?: string
    department?: string
    linkedin_url?: string
    photo_url?: string
    headline?: string
    location?: {
      country?: string
      state?: string
      city?: string
    }
    company?: {
      name?: string
      domain?: string
      industry?: string
      sub_industry?: string
      size?: string
      linkedin_url?: string
      logo_url?: string
    }
  }
}

export const databarProvider: Provider = {
  name: 'databar',
  async lookup({ email }): Promise<NormalizedPerson | null> {
    const apiKey = process.env.DATABAR_API_KEY
    if (!apiKey) return null

    try {
      const res = await fetch('https://api.databar.ai/v1/people/enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        if (res.status !== 404) console.error('Databar error:', res.status)
        return null
      }
      const data: DatabarResponse = await res.json()
      const p = data?.person
      if (!p) return null

      return {
        source: 'databar',
        firstName: p.first_name,
        lastName: p.last_name,
        fullName: p.full_name,
        linkedinUrl: p.linkedin_url,
        jobTitle: p.job_title,
        seniority: p.seniority,
        function: p.function,
        department: p.department,
        companyName: p.company?.name,
        companyDomain: p.company?.domain,
        companySize: p.company?.size,
        companyLinkedinUrl: p.company?.linkedin_url,
        companyLogoUrl: p.company?.logo_url,
        industry: p.company?.industry,
        subIndustry: p.company?.sub_industry,
        country: p.location?.country,
        region: p.location?.state,
        city: p.location?.city,
        photoUrl: p.photo_url,
        headline: p.headline,
        raw: p,
      }
    } catch (err) {
      console.error('Databar enrichment failed:', err)
      return null
    }
  },
}
