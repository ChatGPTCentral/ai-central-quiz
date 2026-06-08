// Beehiiv subscriber lookup by email — used as a v2 pipeline stage.
//
// Beehiiv stores the newsletter audience including first/last name, country,
// subscription tier, status, and the original utm_source the user came in
// through. For rows that have nothing but an email, this single API call can
// fill in the basics for free.
//
// Docs: https://developers.beehiiv.com/api-reference/subscriptions/by-email
// Env: BEEHIIV_API_KEY + BEEHIIV_PUBLICATION_ID (already wired in lib/beehiiv.ts)

const BEEHIIV_API_BASE = 'https://api.beehiiv.com/v2'
const PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID || 'pub_685dd277-3d37-4105-9320-d248c9e28f76'

export interface BeehiivLookupResult {
  /** Beehiiv subscription id — used by stage-update PATCH/tag calls. */
  subscriptionId?: string
  firstName?: string
  lastName?: string
  country?: string
  utmSource?: string
  subscriptionTier?: string
  status?: string                    // active | unsubscribed | inactive | pending | needs_attention
  raw: unknown
}

interface BeehiivSubscription {
  id?: string
  email?: string
  status?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  subscription_tier?: string
  custom_fields?: Array<{ name: string; value: string }>
}

/**
 * Pull subscriber data from Beehiiv by email. Returns null when not subscribed
 * or when the API key is missing. Never throws — failure is a soft miss.
 */
export async function findBeehiivSubscriberByEmail(email: string): Promise<BeehiivLookupResult | null> {
  const apiKey = process.env.BEEHIIV_API_KEY
  if (!apiKey) {
    console.warn('[beehiiv-lookup] BEEHIIV_API_KEY not set — skipping')
    return null
  }
  if (!email) return null

  const url = `${BEEHIIV_API_BASE}/publications/${PUBLICATION_ID}/subscriptions/by_email/${encodeURIComponent(email)}?expand[]=custom_fields&expand[]=subscription_tier`

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 404) return null   // not subscribed
    if (!res.ok) {
      console.error('[beehiiv-lookup] HTTP', res.status, (await res.text()).slice(0, 200))
      return null
    }
    const body = await res.json() as { data?: BeehiivSubscription }
    const sub = body?.data
    if (!sub) return null

    // Custom fields hold first_name, last_name, country (per the lib/beehiiv.ts
    // write path that populates them on signup). Some legacy rows may also use
    // `quiz_name` for the full name.
    const cf = Object.fromEntries((sub.custom_fields || []).map(f => [f.name?.toLowerCase(), f.value]))
    let firstName: string | undefined = cf['first_name'] || cf['firstname']
    let lastName:  string | undefined = cf['last_name']  || cf['lastname']
    if (!firstName && !lastName && cf['quiz_name']) {
      const parts = String(cf['quiz_name']).trim().split(/\s+/)
      firstName = parts[0]
      if (parts.length > 1) lastName = parts.slice(1).join(' ')
    }

    return {
      subscriptionId: sub.id || undefined,
      firstName: firstName?.trim() || undefined,
      lastName:  lastName?.trim()  || undefined,
      country:   (cf['country'] || cf['region'] || undefined)?.trim() || undefined,
      utmSource: sub.utm_source || undefined,
      subscriptionTier: sub.subscription_tier || undefined,
      status: sub.status || undefined,
      raw: sub,
    }
  } catch (err) {
    console.error('[beehiiv-lookup] threw:', err)
    return null
  }
}
