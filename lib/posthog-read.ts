// Reading PostHog: one project-id resolver and one query function.
//
// WHY THIS EXISTS. Two routes needed to run HogQL and each grew its own copy of
// the plumbing. posthog-sync could DISCOVER the project id from the API key;
// the buyer backfill demanded POSTHOG_PROJECT_ID and failed outright when it
// was unset. Same credential, same API, two behaviours, and the one that failed
// was the one the owner ran. Duplicated plumbing diverges — this is the third
// time today that pattern has cost something.
//
// The personal API key stays server-side. It can read every session recording
// we hold, so it is never returned in a response and never reaches the browser.

const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '')

/** Cached per process: it never changes and a sync runs several queries. */
let cachedProjectId: string | null = null

/**
 * The project id, configured or discovered.
 *
 * POSTHOG_PROJECT_ID is honoured when set, but a personal API key can already
 * list the projects it has access to, so demanding a number the credential can
 * tell us is a step that exists only to be forgotten. It was.
 */
export async function posthogProjectId(): Promise<{ id?: string; error?: string }> {
  const configured = process.env.POSTHOG_PROJECT_ID
  if (configured) return { id: configured }
  if (cachedProjectId) return { id: cachedProjectId }

  const key = process.env.POSTHOG_PERSONAL_API_KEY
  if (!key) return { error: 'POSTHOG_PERSONAL_API_KEY is not set' }
  try {
    const res = await fetch(`${HOST}/api/projects/`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    const text = await res.text()
    if (!res.ok) {
      return {
        error: `could not list projects (HTTP ${res.status}). The key probably lacks the `
          + `project:read scope, so either add it or set POSTHOG_PROJECT_ID. ${text.slice(0, 200)}`,
      }
    }
    const list = (JSON.parse(text) as { results?: { id: number | string; name?: string }[] }).results ?? []
    if (list.length === 0) return { error: 'the personal API key can see no projects' }
    // Guessing which analytics project to read is exactly the kind of silent
    // wrong answer this codebase has had enough of.
    if (list.length > 1) {
      return {
        error: `the key can see ${list.length} projects (${list.map(p => `${p.id}:${p.name ?? '?'}`).join(', ')}). `
          + 'Set POSTHOG_PROJECT_ID to pick one.',
      }
    }
    cachedProjectId = String(list[0].id)
    return { id: cachedProjectId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** Run HogQL and return positional rows. */
export async function hogql(query: string): Promise<{ rows: unknown[][]; columns: string[]; error?: string }> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY
  if (!key) return { rows: [], columns: [], error: 'POSTHOG_PERSONAL_API_KEY is not set' }
  const resolved = await posthogProjectId()
  if (!resolved.id) return { rows: [], columns: [], error: `project id unresolved: ${resolved.error}` }
  try {
    const res = await fetch(`${HOST}/api/projects/${resolved.id}/query/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
      cache: 'no-store',
    })
    const text = await res.text()
    if (!res.ok) return { rows: [], columns: [], error: `HTTP ${res.status}: ${text.slice(0, 300)}` }
    const json = JSON.parse(text) as { results?: unknown[][]; columns?: string[] }
    return { rows: json.results ?? [], columns: json.columns ?? [] }
  } catch (e) {
    return { rows: [], columns: [], error: e instanceof Error ? e.message : String(e) }
  }
}
