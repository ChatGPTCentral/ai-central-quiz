// THE IDENTITY JURY — do the signals we hold agree that this LinkedIn profile
// belongs to THIS person?
//
// Owner, 2026-09-04: "più sorgenti di enrichment... so that we create a sort
// of jury and ensemble decision-making that vote together". The pipeline
// (pipeline-v2.ts) already asks several providers and MERGES their fields,
// filling gaps. Merging answers "what do we know". It never answers "do the
// sources agree it is the same human", which is the question the verification
// ledger actually needs — and the question nobody was asking.
//
// This file only counts votes. It sets no state and calls no API: verification
// .ts stays the single place that decides what a verdict is allowed to write,
// so the owner's law of 2026-08-22 is not restated in two files.
//
// WHY THE SLUG JUROR EXISTS, measured 2026-09-04 on all 2.837 stored URLs:
// 66,3% carry both the person's first and last name inside the LinkedIn slug,
// 13,9% the surname only, 12,3% the first name only, 7,5% nothing. That is a
// free, already-in-the-database corroboration nobody was reading, and it is
// worth more than the paid email lookups we tested the same day — those
// returned 1 hit in 21 tries, because 68,6% of this base signs up with a
// personal address and the B2B providers key on work email.
//
// WHY "SILENT" IS NOT "DISAGREE", learned the same day, three times in a row.
// Records I called obviously wrong on sight were confirmed correct by an
// independent provider:
//   robert@velocitysgi.com  -> /in/informationtechnologyjobs = Robert Midoneck
//   "Eric Thomas"           -> /in/etinspires                = Eric D Thomas
//   "C V"                   -> /in/charley-vrtjak-5a049a5    = Charley Vrtjak
// A vanity handle carries no name to compare, and a person who typed "Two
// Chilli" into the quiz broke OUR field, not the match. Neither is evidence
// against the row. Only a slug that is SHAPED like a name and carries a
// DIFFERENT name votes against.

export type JurorName = 'email_domain' | 'name_slug' | 'provider_name'
export type Vote = 'agree' | 'disagree' | 'silent'

export interface JurorVote {
  juror: JurorName
  vote: Vote
  /** Plain sentence, written to verification_evidence and read by the owner. */
  detail: string
}

export interface JuryVerdict {
  votes: JurorVote[]
  agreeing: number
  disagreeing: number
  /** The evidence sentence for the ledger, or null when nothing was proven. */
  evidence: string | null
  /** True only for a combination the ledger's law accepts as proof. */
  proven: boolean
  /** True when a juror actively contradicts the row — the owner's queue. */
  contested: boolean
}

/** Letters only, lower case: compares "O'Brien" to "obrien" and "José" to
 *  "jos" without pulling in a transliteration dependency. */
function letters(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '')
}

/** The slug of a LinkedIn profile URL: the part after /in/, without the query
 *  string or trailing slash. Returns null for anything that is not a personal
 *  profile URL (company pages, garbage). */
export function linkedinSlug(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/\/in\/([^/?#]+)/i)
  if (!m) return null
  const slug = m[1].trim().toLowerCase()
  return slug || null
}

/** A slug is NAME-SHAPED when it is hyphen-separated words, the convention
 *  LinkedIn generates by default (mario-rossi-8a1b2c3). A single run of
 *  letters is a chosen vanity handle (etinspires, kryptoconsultants) and
 *  proves nothing either way. The trailing hash LinkedIn appends is ignored. */
function nameShapedTokens(slug: string): string[] {
  const parts = slug.split('-').map(p => p.replace(/[^a-z]/g, '')).filter(p => p.length >= 3)
  return parts.length >= 2 ? parts : []
}

/** Usable name tokens from what the person typed. "K O" and "Two Chilli" give
 *  nothing usable — the quiz field is free text and people put jokes in it. */
function nameTokens(name: string | null | undefined): { first: string; last: string } | null {
  const parts = (name || '').trim().split(/\s+/).map(letters).filter(p => p.length >= 3)
  if (parts.length < 2) return null
  return { first: parts[0], last: parts[parts.length - 1] }
}

/**
 * Juror: does the person's own name appear inside the LinkedIn slug?
 *
 * Free, needs no provider, and is the only juror that works for the 68,6% of
 * this base who sign up with a personal email address.
 */
export function nameSlugVote(name: string | null | undefined, linkedinUrl: string | null | undefined): JurorVote {
  const slug = linkedinSlug(linkedinUrl)
  if (!slug) return { juror: 'name_slug', vote: 'silent', detail: 'no LinkedIn profile URL on file' }

  const tokens = nameTokens(name)
  if (!tokens) {
    return { juror: 'name_slug', vote: 'silent', detail: `the name on file ("${(name || '').trim()}") is not two usable words, so it cannot corroborate anything` }
  }

  const flat = letters(slug)
  const hasFirst = flat.includes(tokens.first)
  const hasLast = flat.includes(tokens.last)

  if (hasFirst && hasLast) {
    return { juror: 'name_slug', vote: 'agree', detail: `the LinkedIn slug "${slug}" contains both "${tokens.first}" and "${tokens.last}"` }
  }
  if (hasFirst || hasLast) {
    return { juror: 'name_slug', vote: 'silent', detail: `the LinkedIn slug "${slug}" contains only the ${hasLast ? 'surname' : 'first name'}, which is not enough on its own` }
  }

  // Nothing matched. Only a slug SHAPED like somebody else's name votes
  // against; a vanity handle simply has nothing to say.
  const shaped = nameShapedTokens(slug)
  if (shaped.length) {
    return { juror: 'name_slug', vote: 'disagree', detail: `the LinkedIn slug "${slug}" reads as a different person's name, not "${tokens.first} ${tokens.last}"` }
  }
  return { juror: 'name_slug', vote: 'silent', detail: `the LinkedIn slug "${slug}" is a chosen handle, not a name, so it neither confirms nor contradicts` }
}

/**
 * Juror: an outside provider resolved the STORED LinkedIn URL and returned a
 * name. It never saw our record, so agreement is independent evidence.
 *
 * Keyed on the URL on purpose. The same day this was written, email-keyed
 * lookups returned 1 result in 21 tries on this base; URL-keyed lookups
 * answered 2 in 10 on the hardest bucket we have.
 */
export function providerNameVote(
  ourName: string | null | undefined,
  providerFirst: string | null | undefined,
  providerLast: string | null | undefined,
  providerLabel = 'an independent provider',
): JurorVote {
  const provider = `${(providerFirst || '').trim()} ${(providerLast || '').trim()}`.trim()
  if (!provider) return { juror: 'provider_name', vote: 'silent', detail: `${providerLabel} could not resolve the profile URL` }

  const ours = nameTokens(ourName)
  if (!ours) {
    return { juror: 'provider_name', vote: 'silent', detail: `${providerLabel} resolved the URL to "${provider}", but the name on file is unusable, so it cannot say whether that is our person` }
  }

  const flat = letters(provider)
  const hasFirst = flat.includes(ours.first)
  const hasLast = flat.includes(ours.last)

  if (hasFirst && hasLast) return { juror: 'provider_name', vote: 'agree', detail: `${providerLabel} resolved the URL to "${provider}", matching the name on file` }
  if (hasLast) return { juror: 'provider_name', vote: 'silent', detail: `${providerLabel} resolved the URL to "${provider}" — surname matches, first name does not` }
  return { juror: 'provider_name', vote: 'disagree', detail: `${providerLabel} resolved the URL to "${provider}", a different person from "${ours.first} ${ours.last}"` }
}

/**
 * Count the votes into a verdict.
 *
 * PROVEN needs either the deterministic domain proof on its own (the rule the
 * ledger already had, unchanged), or TWO independent agreeing jurors — our own
 * record's name in the slug plus an outside provider reading the same name off
 * the same URL. One agreeing juror is corroboration worth storing, never
 * proof: a common name in a slug is not "no real ambiguity", and the law says
 * nothing probabilistic qualifies.
 *
 * CONTESTED means a juror actively contradicts the row. Those belong in the
 * owner's queue, ahead of the merely unproven ones — they are the rows most
 * likely to be the wrong human.
 */
export function verdict(votes: JurorVote[], domainEvidence: string | null): JuryVerdict {
  const all = domainEvidence
    ? [{ juror: 'email_domain' as JurorName, vote: 'agree' as Vote, detail: domainEvidence }, ...votes]
    : votes

  const agreeing = all.filter(v => v.vote === 'agree').length
  const disagreeing = all.filter(v => v.vote === 'disagree').length
  const contested = disagreeing > 0
  const proven = !contested && (!!domainEvidence || agreeing >= 2)

  const evidence = proven
    ? all.filter(v => v.vote === 'agree').map(v => v.detail).join(' · ')
    : null

  return { votes: all, agreeing, disagreeing, evidence, proven, contested }
}
