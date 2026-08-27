import type { Provider, NormalizedPerson } from './types'

// Cleanlist — cascades through 15+ providers per lookup itself, so this is
// one call standing in for its own small ensemble, same idea as Databar.
//
// Owner explicitly does not want a "lead list" workflow — just enrich a
// contact. The v2 /enrichment/person endpoint (docs.cleanlist.ai/api-
// reference) requires a lead_list_id up front; the v1 public surface
// (docs.cleanlist.ai/mcp-api/enrichment) does not — its bulk endpoint
// groups un-listed enrichments into a system-managed "Extension Leads"
// list automatically, so lead_list_id is simply omitted below.
//
// UNCONFIRMED, same caveat as databar.ts: the public docs don't show the
// exact bulk request array key or the completed-result field names for
// this specific endpoint (only the older /enrichment/person example did:
// full_name, linkedin_url, title, company). Best-effort parsing below,
// raw response logged so the first real call can correct it rather than
// this being assumed right.

const BASE = 'https://api.cleanlist.ai/api/v1/public'

interface CleanlistResult {
  full_name?: string
  first_name?: string
  last_name?: string
  email?: string
  linkedin_url?: string
  title?: string
  job_title?: string
  company?: string
  company_name?: string
  company_domain?: string
  industry?: string
  location?: string
  country?: string
  city?: string
  photo_url?: string
}

async function pollStatus(apiKey: string, workflowId: string, attempts = 6, delayMs = 4000): Promise<CleanlistResult | null> {
  for (let i = 0; i < attempts; i++) {
    await new Promise(r => setTimeout(r, delayMs))
    const res = await fetch(`${BASE}/enrich/status?workflow_id=${encodeURIComponent(workflowId)}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (!res.ok) continue
    const data = await res.json()
    console.log('[cleanlist] poll response:', JSON.stringify(data).slice(0, 2000))
    if (data?.status === 'completed') {
      return (data.result ?? data.results?.[0] ?? data.data?.[0] ?? null) as CleanlistResult | null
    }
    if (data?.status === 'failed') return null
    // pending — loop again
  }
  return null
}

export const cleanlistProvider: Provider = {
  name: 'cleanlist',
  // Async, submit-then-poll — up to ~24s worst case (6 * 4s). Fine for the
  // fire-and-forget background enrichment path; too slow to add to a live,
  // click-and-wait admin flow (see the Enrich tuner complaint, 2026-08-27).
  slow: true,
  async lookup({ email }): Promise<NormalizedPerson | null> {
    const apiKey = process.env.CLEANLIST_API_KEY
    if (!apiKey) return null

    try {
      const res = await fetch(`${BASE}/enrich/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ contacts: [{ email }] }),
      })
      if (!res.ok) {
        if (res.status !== 404) console.error('Cleanlist error:', res.status, await res.text().catch(() => ''))
        return null
      }
      const submitted = await res.json()
      console.log('[cleanlist] submit response:', JSON.stringify(submitted).slice(0, 1000))
      const workflowId = submitted?.workflow_id ?? submitted?.task_id ?? submitted?.id
      if (!workflowId) return null

      const p = await pollStatus(apiKey, workflowId)
      if (!p) return null

      return {
        source: 'cleanlist',
        firstName: p.first_name,
        lastName: p.last_name,
        fullName: p.full_name,
        linkedinUrl: p.linkedin_url,
        jobTitle: p.title || p.job_title,
        companyName: p.company || p.company_name,
        companyDomain: p.company_domain,
        industry: p.industry,
        country: p.country,
        city: p.city,
        photoUrl: p.photo_url,
        raw: p,
      }
    } catch (err) {
      console.error('Cleanlist enrichment failed:', err)
      return null
    }
  },
}
