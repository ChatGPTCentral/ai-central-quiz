// The paid juror: an outside provider resolves a LinkedIn URL we already hold.
//
// Written 2026-09-04 against REAL responses, not against the docs. The older
// databar.ts in this folder was written from a guessed shape, never called
// (DATABAR_API_KEY has never been set), and carries two mistakes this file
// does not repeat:
//   1. it POSTs and reads the body as the person. The real API is ASYNC: the
//      POST returns { task_id, status: "queued" } and the answer arrives from
//      GET /v1/tasks/{id} once status leaves queued/processing.
//   2. it keys on email. Measured on this base the same day: email-keyed
//      lookups returned 1 result in 21 tries, because 68,6% of these people
//      sign up with a personal address and the providers key on work email.
//      URL-keyed lookups answered 3 in 19 on the same rows.
//
// PROVIDER: Muraena, Databar enrichment id 658, 2 credits per HIT (a miss
// costs nothing, which is what makes running the whole tail affordable).
//
// WHAT THIS JUROR IS ACTUALLY FOR, and it is not the name. The name on a
// LinkedIn profile almost always matches the slug of its own URL, and our
// free juror already read that slug — so a provider agreeing on the name is
// close to a tautology and proves little. What the provider adds that nobody
// else has is THE EMAIL ADDRESSES ON THAT PROFILE. If one of them is the
// address the person typed into our quiz, that is a genuine, independent tie
// between the profile and our human, and it works for a gmail address, where
// the domain rule can never work.
//
// AND IT CAN NEVER VOTE AGAINST. A profile whose known addresses do not
// include ours means the provider does not hold that address — people have
// several, and these databases are far from complete. Absence of evidence is
// not evidence of absence, so a non-match is SILENT. Only a human, or a
// provider returning a plainly different person, may condemn a row.

const RUN_URL = 'https://api.databar.ai/v1/enrichments/658/run'
const TASK_URL = 'https://api.databar.ai/v1/tasks'

export interface LinkedInResolution {
  firstName: string | null
  lastName: string | null
  title: string | null
  company: string | null
  country: string | null
  /** Every address the provider holds for this profile, lower-cased. */
  emails: string[]
}

interface MuraenaPerson {
  firstname?: string | null
  lastname?: string | null
  title?: string | null
  country?: string | null
  workemail?: string | null
  personalemail?: string | null
  emails?: string[] | null
  experience?: { company?: string | null; current?: number | null }[] | null
}

function shape(p: MuraenaPerson | null | undefined): LinkedInResolution | null {
  if (!p || (!p.firstname && !p.lastname)) return null
  const emails = new Set<string>()
  for (const e of [p.workemail, p.personalemail, ...(p.emails ?? [])]) {
    if (e && e.includes('@')) emails.add(e.trim().toLowerCase())
  }
  const current = (p.experience ?? []).find(x => x?.current === 1)
  return {
    firstName: p.firstname ?? null,
    lastName: p.lastname ?? null,
    title: p.title ?? null,
    company: current?.company ?? null,
    country: p.country ?? null,
    emails: Array.from(emails),
  }
}

/**
 * Resolve one stored LinkedIn URL. Returns null on a miss, which costs no
 * credits, and never throws: a juror that can take the job down is worse than
 * a juror that abstains.
 */
export async function resolveLinkedInProfile(
  linkedinUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<LinkedInResolution | null> {
  const apiKey = process.env.DATABAR_API_KEY
  if (!apiKey || !linkedinUrl) return null
  const deadline = Date.now() + (opts.timeoutMs ?? 45_000)

  try {
    const started = await fetch(RUN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-apikey': apiKey },
      body: JSON.stringify({ params: { linkedin_url: linkedinUrl } }),
    })
    if (!started.ok) return null
    const { task_id: taskId } = (await started.json()) as { task_id?: string }
    if (!taskId) return null

    // Poll. Observed real timings: a hit or a miss settles in 15-30 seconds.
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3_000))
      const res = await fetch(`${TASK_URL}/${taskId}`, { headers: { 'x-apikey': apiKey } })
      if (!res.ok) continue
      const body = (await res.json()) as { status?: string; data?: MuraenaPerson | MuraenaPerson[] | null }
      if (body.status === 'queued' || body.status === 'processing') continue
      if (body.status === 'failed') return null
      const first = Array.isArray(body.data) ? body.data[0] : body.data
      return shape(first)
    }
    return null
  } catch {
    return null
  }
}

/**
 * The vote. AGREE only when the provider holds the very address the person
 * gave us — the one tie that is independent of the profile we are testing.
 * Everything else abstains, for the reason in the file header.
 */
export function emailTieVote(
  ourEmail: string | null | undefined,
  resolved: LinkedInResolution | null,
): { vote: 'agree' | 'silent'; detail: string } {
  if (!resolved) return { vote: 'silent', detail: 'the provider could not resolve this profile URL' }
  const ours = (ourEmail || '').trim().toLowerCase()
  if (!ours) return { vote: 'silent', detail: 'no email on file to tie the profile to' }
  if (resolved.emails.includes(ours)) {
    return { vote: 'agree', detail: `the provider lists ${ours} among the addresses on this LinkedIn profile — the profile and the person who took the quiz are the same human` }
  }
  const who = [resolved.firstName, resolved.lastName].filter(Boolean).join(' ')
  return {
    vote: 'silent',
    detail: `the provider resolved the URL to ${who || 'a person'}${resolved.company ? ` at ${resolved.company}` : ''} but does not hold ${ours}, which neither confirms nor contradicts the match`,
  }
}
