// The public result page URL for a submission, from the admin's camelCase
// shape. Mirrors the quiz's own redirect and buildResultUrl in lib/email.ts
// (which keeps its snake_case variant for the notification email): the page
// re-fetches segment fields by id, so this link works anytime, not just at
// submission time.

/** Tags Pass Recovery traffic so a return visit is attributable to the sequence.
 *  Applied server-side when the merge field is written, NOT appended in the
 *  email template: `{{result_url|https://quiz.thecentral.ai}}` falls back to a
 *  URL with no query string, so a template-level `&utm_...` would produce a
 *  malformed link on exactly the sends where personalisation already failed. */
export const PASS_RECOVERY_UTM = { utm_source: 'passrec', utm_medium: 'email' } as const

/** Same idea for Checkout Recovery, the sequence for people who clicked the buy
 *  button and walked at the payment form. A distinct source, so each sequence's
 *  return traffic reads separately on its own admin page. */
export const CHECKOUT_RECOVERY_UTM = { utm_source: 'checkrec', utm_medium: 'email' } as const

export function personResultPath(r: {
  id?: string | null
  name?: string | null
  score?: number | null
  persona?: string | null
  stage?: string | null
}, utm?: Record<string, string>): string {
  const params = new URLSearchParams()
  if (r.name?.trim()) params.set('name', r.name.trim())
  if (r.score != null) params.set('score', String(r.score))
  if (r.persona) params.set('persona', r.persona)
  if (r.stage) params.set('stage', r.stage)
  if (r.id) params.set('id', r.id)
  if (utm) for (const [k, v] of Object.entries(utm)) params.set(k, v)
  return `/result?${params.toString()}`
}


/** "a" or "an" for a word, so a rung name never reads "a experimenter".
 *  English article choice follows the SOUND, but every rung on this ladder
 *  (Observer, Experimenter, Practitioner, Power User, Builder) agrees with
 *  the plain vowel-letter rule, so the simple test is the correct one here. */
export function article(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a'
}
