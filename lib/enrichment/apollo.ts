import type { Provider, NormalizedPerson } from './types'
import { cleanPhoto } from './photo-filter'

interface ApolloPerson {
  name?: string
  first_name?: string
  last_name?: string
  title?: string
  headline?: string
  linkedin_url?: string
  photo_url?: string
  email_status?: string
  seniority?: string
  departments?: string[]
  functions?: string[]
  country?: string
  state?: string
  city?: string
  organization?: {
    name?: string
    primary_domain?: string
    website_url?: string
    estimated_num_employees?: number
    industry?: string
    keywords?: string[]
    linkedin_url?: string
    logo_url?: string
    country?: string
  }
}

export const apolloProvider: Provider = {
  name: 'apollo',
  async lookup({ email, linkedinUrl, name }): Promise<NormalizedPerson | null> {
    const apiKey = process.env.APOLLO_API_KEY
    if (!apiKey) return null

    // Apollo people/match accepts {email, linkedin_url, name+org} — use whichever we have.
    // LinkedIn URL matches give the richest data, so prefer it when present.
    const body: Record<string, unknown> = {
      reveal_personal_emails: false,
      reveal_phone_number: false,
    }
    if (linkedinUrl) body.linkedin_url = linkedinUrl
    if (email) body.email = email
    if (name && !linkedinUrl) {
      const parts = name.trim().split(/\s+/)
      body.first_name = parts[0]
      if (parts.length > 1) body.last_name = parts.slice(1).join(' ')
    }

    try {
      const res = await fetch('https://api.apollo.io/v1/people/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        console.error('Apollo error:', res.status)
        return null
      }
      const data = await res.json()
      const p: ApolloPerson | undefined = data?.person
      if (!p) return null

      // Sanity-check Apollo's `title` — sometimes LinkedIn's freeform headline
      // ("Living my best life…") leaks into this field. Real titles are short
      // and don't read like prose. If it looks like a sentence, drop it so
      // later providers / merge can use a better value.
      const looksLikeJobTitle = (t?: string) => {
        if (!t) return false
        const s = t.trim()
        if (!s) return false
        if (s.length > 80) return false
        if (s.split(/\s+/).length > 8) return false
        if (/\b(my|i'm|i am|love|life|passionate|enthusiast|living)\b/i.test(s)) return false
        return true
      }
      const cleanTitle = looksLikeJobTitle(p.title) ? p.title : undefined

      return {
        source: 'apollo',
        firstName: p.first_name,
        lastName: p.last_name,
        fullName: p.name,
        linkedinUrl: p.linkedin_url || undefined,
        jobTitle: cleanTitle || undefined,
        seniority: p.seniority || undefined,
        function: p.functions?.[0],
        department: p.departments?.[0],
        companyName: p.organization?.name,
        companyDomain: p.organization?.primary_domain,
        companyWebsite: p.organization?.website_url,
        companySize: p.organization?.estimated_num_employees?.toString(),
        companyLinkedinUrl: p.organization?.linkedin_url,
        companyLogoUrl: p.organization?.logo_url,
        industry: p.organization?.industry,
        subIndustry: p.organization?.keywords?.[0],
        country: p.country || p.organization?.country,
        region: p.state,
        city: p.city,
        photoUrl: cleanPhoto(p.photo_url),
        headline: p.headline,
        raw: p,
      }
    } catch (err) {
      console.error('Apollo enrichment failed:', err)
      return null
    }
  },
}
