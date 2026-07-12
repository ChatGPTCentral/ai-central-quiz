// The public result page URL for a submission, from the admin's camelCase
// shape. Mirrors the quiz's own redirect and buildResultUrl in lib/email.ts
// (which keeps its snake_case variant for the notification email): the page
// re-fetches segment fields by id, so this link works anytime, not just at
// submission time.

export function personResultPath(r: {
  id?: string | null
  name?: string | null
  score?: number | null
  persona?: string | null
  stage?: string | null
}): string {
  const params = new URLSearchParams()
  if (r.name?.trim()) params.set('name', r.name.trim())
  if (r.score != null) params.set('score', String(r.score))
  if (r.persona) params.set('persona', r.persona)
  if (r.stage) params.set('stage', r.stage)
  if (r.id) params.set('id', r.id)
  return `/result?${params.toString()}`
}
