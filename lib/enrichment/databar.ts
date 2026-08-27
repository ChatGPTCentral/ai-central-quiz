import type { Provider, NormalizedPerson } from './types'

// Databar — meta-aggregator across 100+ providers.
//
// The endpoint and auth header below were WRONG until 2026-08-27 (this file
// was written against a guessed shape, never actually called — DATABAR_API_KEY
// was never set, so `if (!apiKey) return null` made it a silent no-op).
// Confirmed against the real docs (docs.databar.ai/quickstart-rest) instead of
// re-guessing: Databar has no generic "enrich by email" endpoint. Every
// enrichment is a specific PROVIDER (e.g. People Data Labs) configured as an
// "enrichment" resource in the Databar dashboard, each with its own id — you
// POST to /v1/enrichments/{id}/run, not to a generic /people/enrich route.
// That id is DATABAR_ENRICHMENT_ID below; it has to come from whoever sets up
// that enrichment in the Databar dashboard, there is no way to invent one.
//
// STILL UNCONFIRMED: the exact response field names for a completed run — the
// public docs don't show one. The parsing below is the best-effort shape a
// person-enrichment response is likely to have, kept from the original
// version of this file, but treat it as unverified until a real call's raw
// response has actually been seen (logged below specifically so that's easy
// to check the first time this runs for real).
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
    const enrichmentId = process.env.DATABAR_ENRICHMENT_ID
    if (!apiKey || !enrichmentId) return null

    try {
      const res = await fetch(`https://api.databar.ai/v1/enrichments/${enrichmentId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-apikey': apiKey,
        },
        body: JSON.stringify({ params: { email } }),
      })
      if (!res.ok) {
        if (res.status !== 404) console.error('Databar error:', res.status)
        return null
      }
      const data: DatabarResponse = await res.json()
      // Response shape is unconfirmed (see the file-header note) — logged
      // once per call, cheaply, until it's been checked against a real run.
      console.log('[databar] raw response:', JSON.stringify(data).slice(0, 2000))
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
