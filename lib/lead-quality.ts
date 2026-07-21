// lib/lead-quality.ts
//
// Lightweight lead-quality heuristics for the quiz form. Catches the most
// obvious junk submissions — placeholder names ("john doe", "test test"),
// keyboard mashing ("asdf", "qwerty"), and disposable / temp email domains —
// WITHOUT blocking real people.
//
// The bar for `fake: true` (which the API hard-blocks with a 400) is
// deliberately high: only unmistakable garbage. Anything softer is surfaced
// through `reasons` for logging / flagging, but MUST NOT block the lead.
//
// This is a pure module (no server-only imports) so it can run on the client
// too — the quiz form uses the same egregious check for an inline nudge
// before submit.

export interface LeadAssessment {
  /** True only for the most egregious fakes — safe to hard-block. */
  fake: boolean
  /** Every quality signal found (egregious + soft), namespaced for logs. */
  reasons: string[]
  /** Rough fakeness score 0-100 (0 = clean, higher = more suspect). */
  score: number
}

export interface LeadInput {
  name?: string | null
  email?: string | null
}

// ── Disposable / throwaway email domains ────────────────────────────────────
// Exact host matches (subdomains are also caught via endsWith below). ~45
// entries covering the common temp-mail providers. This is a hard-block list.
export const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  'mailinator.com', 'mailinator.net',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.biz', 'guerrillamail.info', 'guerrillamail.de',
  'guerrillamailblock.com', 'grr.la', 'sharklasers.com', 'spam4.me',
  '10minutemail.com', '10minutemail.net', '10minutemail.org',
  'tempmail.com', 'temp-mail.org', 'tempmailo.com', 'tempr.email',
  'tmpmail.org', 'tmpmail.net', 'tempinbox.com', 'mytemp.email',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'trashmail.com', 'trashmail.de', 'trashmail.net', 'wegwerfmail.de',
  'getnada.com', 'nada.email', 'dispostable.com', 'fakeinbox.com',
  'maildrop.cc', 'throwaway.email', 'throwawaymail.com', 'mailnesia.com',
  'mintemail.com', 'mohmal.com', 'spamgourmet.com', 'mailcatch.com',
  'emailondeck.com', 'moakt.com', 'discard.email', 'discardmail.com',
  'burnermail.io', 'mailsac.com', 'inboxkitten.com', 'harakirimail.com',
  'cs.email', 'maileater.com', 'getairmail.com', 'fakemailgenerator.com',
])

// Substrings that strongly imply a throwaway inbox but aren't in the exact
// list above — used only for a SOFT flag (never a hard-block).
const DISPOSABLE_MARKERS = [
  'mailinator', 'guerrilla', 'tempmail', 'temp-mail', '10minute', 'throwaway',
  'trashmail', 'yopmail', 'sharklasers', 'getnada', 'dispostable', 'fakeinbox',
  'mailnesia', 'maildrop', 'spam4', 'mohmal', 'discardmail', 'wegwerf',
  'burnermail', 'mailsac', 'fakemail', 'tempinbox', 'throwawaymail',
]

// ── Fake full names (exact, normalized whole-name match) — hard-block ────────
const FAKE_FULL_NAMES = new Set<string>([
  'john doe', 'jane doe', 'john q doe', 'jane q doe', 'john q public',
  'test test', 'test testing', 'testing test', 'test user', 'test testtest',
  'first last', 'firstname lastname', 'first name last name', 'fname lname',
  'name surname', 'your name', 'full name', 'no name', 'na na',
  'foo bar', 'asdf asdf', 'asdf jkl', 'qwerty qwerty', 'abc abc', 'xyz xyz',
  'aaa aaa', 'lorem ipsum', 'mickey mouse', 'donald duck',
])

// ── Fake single-token names (whole normalized name equals one) — hard-block ──
const FAKE_SINGLE_NAMES = new Set<string>([
  'test', 'testtest', 'testing', 'asdf', 'asdfasdf', 'asdfgh', 'asdfghjkl',
  'qwerty', 'qwertyuiop', 'zxcvbn', 'zxcvbnm', 'fake', 'fakename', 'noname',
  'foobar', 'loremipsum',
])

// ── Softer placeholder names (flag, never block) ────────────────────────────
const SOFT_PLACEHOLDER_NAMES = new Set<string>([
  'user', 'users', 'admin', 'administrator', 'guest', 'anonymous', 'anon',
  'unknown', 'someone', 'somebody', 'nobody', 'myself', 'abc', 'abcd', 'xyz',
  'sample', 'demo', 'example', 'none', 'null', 'undefined', 'na', 'nan',
  'aaa', 'bbb', 'ccc', 'tester', 'placeholder', 'dummy', 'temp', 'temporary',
  'person', 'customer', 'client', 'hello', 'hi', 'blah', 'qwe', 'asd',
])

// ── Fake email local-parts (exact) — hard-block ─────────────────────────────
const FAKE_LOCAL_PARTS = new Set<string>([
  'test', 'testtest', 'testing', 'asdf', 'asdfasdf', 'asdfgh', 'asdfghjkl',
  'qwerty', 'qwertyuiop', 'zxcvbn', 'zxcvbnm', 'fake', 'faker', 'fakeemail',
  'nobody', 'noone', 'none', 'no', 'noreply', 'no-reply', 'donotreply',
  'do-not-reply', 'abc', 'xyz', 'foobar', 'example',
])

// ── Fake email domain second-level labels (exact) — hard-block ──────────────
// NOTE: single-character SLDs are deliberately NOT here — x.com, q.com etc.
// are real. The a@a.com / x@x.com pattern is caught via the local-part rule.
const FAKE_DOMAIN_SLDS = new Set<string>([
  'example', 'test', 'fake', 'faker', 'asdf', 'qwerty', 'domain', 'none',
  'null', 'invalid', 'notreal', 'nomail', 'noemail', 'fakemail',
])

// Keyboard rows (and reverses) for detecting contiguous keyboard walks.
const KEYBOARD_ROWS = [
  'qwertyuiop', 'poiuytrewq', 'asdfghjkl', 'lkjhgfdsa',
  'zxcvbnm', 'mnbvcxz', '1234567890', '0987654321',
]

function normalize(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function isAllSameChar(s: string): boolean {
  return s.length > 1 && /^(.)\1+$/.test(s)
}

function isKeyboardWalk(s: string): boolean {
  if (s.length < 4) return false
  return KEYBOARD_ROWS.some(row => row.includes(s))
}

function isDisposableDomain(domain: string): boolean {
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true
  // Catch subdomains (e.g. foo.mailinator.com) by testing each suffix against
  // the exact set — avoids iterating the Set (keeps older TS targets happy).
  const labels = domain.split('.')
  for (let i = 1; i < labels.length - 1; i++) {
    if (DISPOSABLE_EMAIL_DOMAINS.has(labels.slice(i).join('.'))) return true
  }
  return false
}

/**
 * Assess a submitted name + email for obvious fakery.
 *
 * `fake` is true ONLY for egregious cases that are safe to reject outright
 * (placeholder names, keyboard mashing, disposable domains, synthetic
 * local-parts). Everything else lands in `reasons` with `fake: false`, so the
 * caller can flag-but-keep the lead. Basic email SHAPE (a@b.c) is validated
 * elsewhere; this adds the fake-domain + fake-local layer on top.
 */
export function assessLead(input: LeadInput): LeadAssessment {
  const reasons: string[] = []
  let score = 0
  let egregious = false

  const hard = (reason: string) => { reasons.push(reason); egregious = true; score += 60 }
  const soft = (reason: string) => { reasons.push(reason); score += 15 }

  // ── Name ──────────────────────────────────────────────────────────────────
  const name = normalize(input.name)
  const nameCompact = name.replace(/[^a-z0-9]/g, '')

  if (name) {
    if (FAKE_FULL_NAMES.has(name) || FAKE_SINGLE_NAMES.has(name) || FAKE_SINGLE_NAMES.has(nameCompact)) {
      hard('name:placeholder')
    } else if (isKeyboardWalk(nameCompact)) {
      hard('name:keyboard_walk')
    } else if (isAllSameChar(nameCompact) && nameCompact.length >= 4) {
      hard('name:repeated_char')
    } else {
      // Softer signals — flag but keep.
      if (isAllSameChar(nameCompact)) soft('name:repeated_char_short')
      if (name.replace(/[^a-z]/gi, '').length < 2) soft('name:too_short')
      const firstToken = name.split(' ')[0]
      if (SOFT_PLACEHOLDER_NAMES.has(name) || SOFT_PLACEHOLDER_NAMES.has(firstToken)) {
        soft('name:soft_placeholder')
      }
      if (/\d/.test(name)) soft('name:contains_digits')
      if (/https?:|www\.|@|\.com/i.test(name)) soft('name:contains_url')
    }
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  const email = normalize(input.email).replace(/\s+/g, '')
  const at = email.lastIndexOf('@')
  if (email && at > 0 && at < email.length - 1) {
    const local = email.slice(0, at)
    const domain = email.slice(at + 1)
    const labels = domain.split('.')
    const sld = labels.length >= 2 ? labels[labels.length - 2] : labels[0]
    const localCompact = local.replace(/[^a-z0-9]/g, '')

    if (isDisposableDomain(domain)) {
      hard('email:disposable_domain')
    } else if (FAKE_DOMAIN_SLDS.has(sld)) {
      hard('email:fake_domain')
    } else if (FAKE_LOCAL_PARTS.has(local) || FAKE_LOCAL_PARTS.has(localCompact)) {
      hard('email:fake_local')
    } else if (isKeyboardWalk(localCompact)) {
      hard('email:keyboard_local')
    } else if (isAllSameChar(localCompact) && localCompact.length >= 4) {
      hard('email:repeated_local')
    } else if (/^\d$/.test(local)) {
      // "1@gmail.com" — single-digit local part is never a real inbox.
      hard('email:digit_local')
    } else if (local.length === 1 && sld.length <= 2 && sld.startsWith(local)) {
      // "a@a.com" / "x@x.io" — single-char local mirroring a tiny domain.
      hard('email:aa_pattern')
    } else {
      // Softer signals — flag but keep.
      if (DISPOSABLE_MARKERS.some(m => domain.includes(m))) soft('email:disposable_marker')
      if (isAllSameChar(localCompact)) soft('email:repeated_local_short')
      if (/^\d+$/.test(localCompact) && localCompact.length >= 2) soft('email:all_digits_local')
      if (/^(test|fake|asdf|spam|junk|trash)/.test(localCompact)) soft('email:suspicious_prefix')
    }

    // Cross-signal: the name is just the email's local part (weak on its own).
    if (name && nameCompact && nameCompact === localCompact) soft('name:equals_email_local')
  }

  return { fake: egregious, reasons, score: Math.min(100, score) }
}

/** Convenience: the egregious-only check the UI uses for an inline nudge. */
export function isEgregiousFake(input: LeadInput): boolean {
  return assessLead(input).fake
}
