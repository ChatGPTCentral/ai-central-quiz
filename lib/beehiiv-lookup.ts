const BEEHIIV_API_BASE = 'https://api.beehiiv.com/v2'
const PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID || 'pub_685dd277-3d37-4105-9320-d248c9e28f76'

export interface BeehiivLookupResult {
  found: boolean
  subscriberId?: string
  status?: string
  customFields?: Record<string, string>
  raw?: unknown
  error?: string
}

// Map raw Beehiiv custom_field keys → quiz field IDs
function mapBeehiivCustomFields(cf: Array<{ name: string; value: string }> = []): Record<string, string> {
  const map: Record<string, string> = {
    quiz_name: 'name',
    ai_level: 'aiLevel',
    work_area: 'workArea',
    learning_style: 'learningStyle',
    time_commitment: 'timeCommitment',
    main_goal: 'mainGoal',
    ai_tools: 'aiTools',
    job_level: 'jobLevel',
  }
  const out: Record<string, string> = {}
  for (const f of cf) {
    const k = map[f.name]
    if (k && f.value) out[k] = f.value
  }
  return out
}

export async function lookupBeehiivSubscriber(email: string): Promise<BeehiivLookupResult> {
  const apiKey = process.env.BEEHIIV_API_KEY
  if (!apiKey) return { found: false, error: 'BEEHIIV_API_KEY not set' }

  try {
    const url = `${BEEHIIV_API_BASE}/publications/${PUBLICATION_ID}/subscriptions/by_email/${encodeURIComponent(email)}?expand[]=custom_fields`
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      cache: 'no-store',
    })
    if (res.status === 404) return { found: false }
    if (!res.ok) {
      return { found: false, error: `Beehiiv ${res.status}` }
    }
    const data = await res.json()
    const sub = data?.data
    if (!sub) return { found: false, raw: data }

    return {
      found: true,
      subscriberId: sub.id,
      status: sub.status,
      customFields: mapBeehiivCustomFields(sub.custom_fields || []),
      raw: sub,
    }
  } catch (err) {
    return { found: false, error: String(err) }
  }
}
