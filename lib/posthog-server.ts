// Tell PostHog who bought.
//
// WHY THIS IS NEEDED AT ALL. The browser SDK identifies a person by submission
// id and attaches their stage and score, so PostHog can already answer "what do
// people at stage 4 do". What it has never known is who PAID, because the
// payment happens in Stripe and is confirmed by a webhook the browser never
// sees. So every question of the form "what do BUYERS do differently" was
// unanswerable, which is exactly the question worth asking.
//
// Fired server-side from the Stripe webhook rather than from a success page, on
// purpose: a success page only fires if the buyer waits for the redirect and
// keeps the tab open, and wallet payments frequently do neither. The webhook is
// the only place a purchase is a fact.
//
// Uses the PUBLIC project key, which is a write-only ingestion key. The
// personal API key that can READ recordings is never touched here.

const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '')

/**
 * Capture an event against a person PostHog already knows by submission id.
 *
 * Never throws and never blocks: analytics must not be able to fail a payment
 * webhook. A dropped event costs us one row in a chart; a thrown error costs us
 * a Stripe retry storm.
 */
export async function posthogCapture(input: {
  distinctId: string
  event: string
  properties?: Record<string, unknown>
  /** Person properties to set, e.g. is_buyer. */
  personSet?: Record<string, unknown>
}): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key || !input.distinctId) return
  try {
    await fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        api_key: key,
        event: input.event,
        distinct_id: input.distinctId,
        properties: {
          ...(input.properties || {}),
          // $set marks the PERSON, not just the event, so a cohort of buyers
          // can be built and every earlier session they had is queryable
          // against it. Without this we could only ask about the moment of
          // purchase, never about what led to it.
          ...(input.personSet ? { $set: input.personSet } : {}),
        },
        timestamp: new Date().toISOString(),
      }),
    })
  } catch {
    // Deliberately silent. See above: this must never affect the webhook.
  }
}
