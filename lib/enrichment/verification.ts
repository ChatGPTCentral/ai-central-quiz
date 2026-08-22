// The verification ledger — the owner's law, stated 2026-08-22:
//
//   A person is VERIFIED only in two cases. Case one: deterministic proof,
//   no real ambiguity. Case two: the owner validates by hand.
//   A hand validation is FINAL. The system never overwrites it.
//
// ONE source for the fact: submissions.verification_state, four values:
//   unverified      — default; enrichment data exists but nothing proves it
//   auto_verified   — deterministic proof (below); machine may set/refresh it
//   owner_verified  — the owner said yes; locked, only the owner changes it
//   rejected        — the owner said the data is wrong; locked the same way
//
// THE ONE AUTO RULE (deterministic, nothing probabilistic qualifies): the
// email domain the person themselves owns matches the enriched company's
// domain. Someone writing from @acme.com who the pipeline says works at the
// company whose domain is acme.com has proven the AFFILIATION with their own
// inbox. It proves the company, not the job title — the evidence string says
// so. Free-mail and consumer-ISP domains can never prove anything.
//
// The SQL backfill in migration submission_verification_ledger is the
// one-time twin of this rule; this file is the living copy every forward
// write goes through.

export type VerificationState = 'unverified' | 'auto_verified' | 'owner_verified' | 'rejected'

/** States only the owner may change. Any automated path must skip these rows
 *  entirely — same precedent as trial_state_overrides: his dropdown wins. */
export const OWNER_LOCKED: readonly VerificationState[] = ['owner_verified', 'rejected']

export function isOwnerLocked(state: string | null | undefined): boolean {
  return state === 'owner_verified' || state === 'rejected'
}

/** Domains that identify a mailbox provider, not an employer. A match against
 *  these proves nothing. Kept in sync with the migration's inline list. */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.es', 'yahoo.de', 'yahoo.it',
  'ymail.com', 'rocketmail.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.it', 'hotmail.es',
  'outlook.com', 'outlook.es', 'live.com', 'live.co.uk', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 'mail.com', 'mail.ru',
  'yandex.com', 'yandex.ru', 'zoho.com', 'zohomail.com', 'qq.com', '163.com', '126.com', 'sina.com', 'naver.com', 'daum.net', 'hanmail.net',
  'rediffmail.com', 'libero.it', 'virgilio.it', 'tiscali.it', 'alice.it', 'tin.it',
  'wanadoo.fr', 'orange.fr', 'free.fr', 'laposte.net', 'sfr.fr', 't-online.de', 'freenet.de', 'arcor.de',
  'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net', 'earthlink.net',
  'btinternet.com', 'btopenworld.com', 'sky.com', 'talktalk.net', 'virginmedia.com',
  'shaw.ca', 'rogers.com', 'sympatico.ca', 'bigpond.com', 'optusnet.com.au', 'telstra.com', 'xtra.co.nz',
  'ziggo.nl', 'kpnmail.nl', 'telenet.be', 'skynet.be', 'bluewin.ch', 'seznam.cz', 'wp.pl', 'o2.pl', 'interia.pl', 'onet.pl',
  'uol.com.br', 'bol.com.br', 'terra.com.br',
])

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain.toLowerCase())
}

function emailDomain(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null
  const d = email.split('@').pop()!.trim().toLowerCase()
  return d || null
}

/** Normalize a company domain or website into a bare comparable host. */
function bareHost(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null
  let h = value.trim().toLowerCase()
  try { if (h.includes('://')) h = new URL(h).hostname } catch { /* keep as-is */ }
  h = h.replace(/^www\./, '').replace(/\/.*$/, '')
  return h || null
}

/**
 * The deterministic proof, or null. Exact-host match, or the email domain as
 * a subdomain of the company host (mail.acme.com proves acme.com). Anything
 * looser than this is a guess and a guess is not verification.
 */
export function deterministicEvidence(
  email: string | null | undefined,
  companyDomain: string | null | undefined,
  companyWebsite?: string | null,
): string | null {
  const ed = emailDomain(email)
  if (!ed || isFreeMailDomain(ed)) return null
  for (const candidate of [bareHost(companyDomain), bareHost(companyWebsite)]) {
    if (!candidate) continue
    if (ed === candidate || ed.endsWith(`.${candidate}`)) {
      return `email domain ${ed} matches the company domain — company affiliation proven; role details still machine-sourced`
    }
  }
  return null
}

/**
 * The column update an automated pipeline is allowed to write, given the
 * row's current state and the merged (existing + fresh) company fields.
 * Returns {} for owner-locked rows — by construction, not by caller
 * discipline. Recomputed from scratch each run: proof that no longer holds
 * (a force-overwrite changed the company) downgrades honestly to unverified.
 */
export function autoVerificationUpdate(
  currentState: string | null | undefined,
  email: string | null | undefined,
  mergedCompanyDomain: string | null | undefined,
  mergedCompanyWebsite?: string | null,
): Record<string, unknown> {
  if (isOwnerLocked(currentState)) return {}
  const evidence = deterministicEvidence(email, mergedCompanyDomain, mergedCompanyWebsite)
  if (evidence) {
    return {
      verification_state: 'auto_verified',
      verification_evidence: evidence,
      verified_at: new Date().toISOString(),
      verified_by: 'auto',
    }
  }
  return {
    verification_state: 'unverified',
    verification_evidence: null,
    verified_at: null,
    verified_by: null,
  }
}
