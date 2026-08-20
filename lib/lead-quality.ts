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
//
// Also matched against the COMPACT name (spaces stripped), which is how
// "Anony Mous" is caught: splitting a placeholder across two tokens is the
// commonest evasion, and the compact form gives it away.
const FAKE_SINGLE_NAMES = new Set<string>([
  'test', 'testtest', 'testing', 'asdf', 'asdfasdf', 'asdfgh', 'asdfghjkl',
  'qwerty', 'qwertyuiop', 'zxcvbn', 'zxcvbnm', 'fake', 'fakename', 'noname',
  'foobar', 'loremipsum',
  // Declaring yourself anonymous is not a name, however it is spelled or split.
  'anonymous', 'anonimous', 'anonymus', 'anonymouse', 'anonym', 'anonyme',
  'notelling', 'nomyname', 'notmyname', 'privateperson', 'nonevs', 'noneofyourbusiness',
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

/**
 * Does the name contain at least one token that could be a real name?
 *
 * Three letters, not two, because two-letter surnames are real (Ng, Li, Xu, Vo)
 * but a two-letter FULL name is not — the test is whether ANY token clears the
 * bar, so "Li Wei" passes on "Wei" and "Amy Ng" passes on "Amy", while "R S"
 * and "b d" fail. A single token is fine: "Fred" is a name, and plenty of
 * people give only a first name.
 *
 * Letters only, so digits cannot pad a token to length ("3 3", "a1b").
 * Unicode-aware, so non-Latin scripts are not punished for having no [a-z].
 */
/** Compact forms of the multi-word fakes, long enough that a prefix match
 *  cannot collide with a real name. Built once, not per call. */
// ── Profanity in the name field — hard-block ────────────────────────────────
//
// Owner, 2026-08-20: "Fuck Off" reached a member pass. Nothing in this file
// looked for abuse, so it passed every other test: two pronounceable tokens,
// no keyboard walk, no placeholder.
//
// MATCHED AS WHOLE TOKENS ONLY, never as substrings. This is the Scunthorpe
// problem and it is not theoretical: Dickinson, Dickens, Hancock, Babcock,
// Cummings, Weiner, Lipschitz, Shittu, Fuchs and Kuntz are all real surnames
// carried by real people who would be blocked forever by a substring match.
// A false positive here costs a lead permanently and silently.
const PROFANITY_TOKENS = new Set<string>([
  'fuck', 'fucker', 'fucking', 'fuckoff', 'fuckyou', 'fck', 'fuk',
  'shit', 'shite', 'bullshit', 'crap',
  'cunt', 'twat', 'wanker', 'bollocks',
  'bitch', 'bastard', 'asshole', 'arsehole', 'dickhead', 'jackass',
  'piss', 'pissoff', 'bugger', 'slut', 'whore',
  'nigger', 'nigga', 'faggot', 'retard',
  // Italian, because the owner's audience includes Italy.
  'cazzo', 'stronzo', 'stronza', 'merda', 'vaffanculo', 'coglione', 'puttana',
])

/** Not one letter in ANY script: "3 3", "1", "...".
 *
 *  Written without \p{L} because this tsconfig targets below ES6 and the regex
 *  `u` flag is unavailable there. Stripping digits, whitespace and punctuation
 *  leaves the letters of every alphabet standing, which is the same test by a
 *  different route. */
function hasNoLetters(name: string): boolean {
  const rest = name
    .replace(/[0-9\s]/g, '')
    .replace(/[!-\/:-@[-`{-~]/g, '')
    .replace(/[\u00B7\u2022\u2013\u2014\u2015\u2026\u00AB\u00BB\u201C\u201D\u2018\u2019\u201E]/g, '')
  return rest.length === 0
}

/** A token that is the word "test" in any of its usual disguises. "ttest test"
 *  and "test MKJKJKH" both cleared every other rule. */
const TEST_TOKENS = new Set<string>(['test', 'tests', 'testing', 'ttest', 'tset', 'prova', 'proval'])
function hasTestToken(name: string): boolean {
  return name.split(/[\s.\-_]+/).map(t => t.replace(/[^a-z]/g, '')).filter(Boolean)
    .some(t => TEST_TOKENS.has(t))
}

/** Every Latin token in the name lacks a vowel: "gh hj", "Fff Gfg".
 *
 *  Applied ONLY when the name is entirely Latin script, because a vowel is a
 *  Latin-script idea and Arabic, Cyrillic and CJK names carry none. 'y' counts
 *  as a vowel so Welsh and Slavic names survive, and the rule needs EVERY token
 *  to fail, which keeps real vowel-less surnames like "Ng" safe as long as they
 *  sit beside a normal given name ("Yu Ng"). */
const COMPANY_MARKERS = /\b(sp\.? ?z ?o\.? ?o|s\.?r\.?l|ltd|llc|l\.l\.c|inc|gmbh|b\.?v|n\.?v|a\.?g|oy|ab|as|plc|pty|kft|d\.?o\.?o|s\.?a|s\.?p\.?a)\b/i

function allTokensVowelless(name: string): boolean {
  if (name.replace(/[\x00-\x7F]/g, '').length > 0) return false
  // A company name is not gibberish. "N3S Sp. z o.o" is a real PAYING customer
  // whose Polish legal form has no vowels in it (found by backtest, 2026-08-20,
  // before this ever reached production).
  if (COMPANY_MARKERS.test(name)) return false
  const toks = name.split(/[\s.\-_]+/).map(t => t.replace(/[^a-z]/g, '')).filter(t => t.length >= 2)
  if (toks.length < 2) return false
  return toks.every(t => !/[aeiouy]/.test(t))
}

/** True when any whole token of the name is profanity. */
function hasProfanity(name: string): boolean {
  return name
    .split(/[\s.\-_]+/)
    .map(t => t.replace(/[^a-z]/g, ''))
    .filter(Boolean)
    .some(t => PROFANITY_TOKENS.has(t))
}

// ── Famous names — hard-block ───────────────────────────────────────────────
//
// "Elvis Presley" reached a pass on 2026-08-20. It defeats every structural
// test in this file because it IS a real name, it is simply not this person's.
// Only an identity list catches it.
//
// EXACT FULL-NAME MATCH ONLY. Plenty of real people are called John Lennon or
// Michael Jordan, so this list stays short and famous-dead-or-iconic, and it
// never matches a single token. Somebody named Presley keeps their name.
const FAMOUS_FULL_NAMES = new Set<string>([
  'elvis presley', 'michael jackson', 'freddie mercury', 'john lennon',
  'paul mccartney', 'kurt cobain', 'david bowie', 'bob marley',
  'marilyn monroe', 'james bond', 'harry potter', 'james dean',
  'albert einstein', 'isaac newton', 'stephen hawking', 'nikola tesla',
  'donald trump', 'joe biden', 'barack obama', 'vladimir putin',
  'elon musk', 'bill gates', 'steve jobs', 'jeff bezos', 'mark zuckerberg',
  'santa claus', 'jesus christ', 'adolf hitler', 'darth vader',
  'sherlock holmes', 'peter parker', 'clark kent', 'bruce wayne',
  'homer simpson', 'ronald mcdonald', 'walt disney', 'chuck norris',
  'lionel messi', 'cristiano ronaldo', 'michael jordan', 'kobe bryant',
])

const FAKE_NAME_PREFIXES: string[] = Array.from(FAKE_FULL_NAMES)
  .map(n => n.replace(/[^a-z0-9]/g, ''))
  .filter(n => n.length >= 7)

/**
 * Compact name begins with a known placeholder, i.e. someone appended a
 * character to evade the exact-match list. Only applied to the multi-word fake
 * names, whose compact forms are long and distinctive enough that a prefix
 * match cannot collide with a real name.
 */
function startsWithFakeName(nameCompact: string): boolean {
  if (nameCompact.length < 7) return false
  return FAKE_NAME_PREFIXES.some(p => nameCompact.startsWith(p))
}

function hasRealNameToken(name: string): boolean {
  const toks = name.split(/[\s.]+/).filter(Boolean)
  // Non-Latin scripts are not ours to score. Two characters of any other
  // script is a complete name (李 明), whether written as one token or two.
  if (name.replace(/[\x00-\x7F]/g, '').length >= 2) return true
  // Two short tokens are a whole real name in a lot of the world: "Yu Ng",
  // "Li Xu", "Vo Ha". The old rule demanded one token of three letters and
  // rejected every one of them, which is a false positive on a real person.
  const twoShort = toks.filter(t => t.replace(/[^A-Za-z]/g, '').length >= 2).length >= 2
  return toks.some(tok => {
    const latin = tok.replace(/[^A-Za-z]/g, '')
    if (latin.length >= 3) return true
    if (latin.length >= 2 && twoShort) return true
    // Non-Latin scripts carry more meaning per character: a two-character CJK
    // name is a complete, real name, so holding them to the Latin threshold
    // would reject real people. Anything outside ASCII gets the lower bar.
    return tok.replace(/[\x00-\x7F]/g, '').length >= 2
  })
}

// ── Is this token pronounceable? ────────────────────────────────────────────
//
// The rule the blocklists cannot express. "sdsf dsfdsf" is unmistakable junk
// and matches nothing, because there is nothing to match: it is a hand on a
// keyboard. What gives it away is that no part of it can be said out loud.
//
// y counts as a vowel (Bryn, Lynn) and so does w (Welsh Cwm, Bwlch), which
// costs nothing: keyboard mashing rarely leans on w, and a false NEGATIVE is
// always cheaper here than rejecting a real person.
const VOWELISH = /[aeiouyw]/

/** Letters that sit next to each other on one QWERTY row, e.g. "sd", "jk",
 *  "cv". A two-letter first name is usually real (Ng, Mc, Di, Yu); a two-letter
 *  first name with no vowel that is ALSO a keyboard neighbour is a mash. Both
 *  conditions together, because either alone has real names in it. */
function isKeyboardPair(s: string): boolean {
  if (s.length !== 2) return false
  return KEYBOARD_ROWS.some(row => {
    const i = row.indexOf(s[0])
    return i >= 0 && row[i + 1] === s[1]
  })
}

/** A whole token that is a contiguous run along one keyboard row: "asdf",
 *  "fghj", "poiu". FOUR characters is the floor, not three: "Yui" is a run
 *  through qwertyuiop and also a real Japanese name, and a rule that rejects
 *  Yui Aragaki to catch "qwe" is not worth having. The WHOLE token has to be
 *  the run, so a name that merely contains one ("Trewin") is safe. */
function isTokenKeyboardWalk(tok: string): boolean {
  const s = tok.replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (s.length < 4) return false
  return KEYBOARD_ROWS.some(row => row.includes(s))
}

/** A short string typed twice: "qweqwe", "dsfdsf", "asdfasdf".
 *
 *  The seed itself has to be junk, not merely repeated. Taktak is a real
 *  surname and a real paying customer, so "a seed doubled" alone is not
 *  evidence; a seed doubled where the seed cannot be pronounced or is a run
 *  off the keyboard is. Coco, Lulu and Gigi are safe twice over: their seeds
 *  are two letters and hold a vowel. */
function isRepeatedSeed(s: string): boolean {
  const t = s.replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (t.length < 6) return false
  for (let seed = 3; seed <= Math.floor(t.length / 2); seed++) {
    if (t.length % seed !== 0) continue
    const head = t.slice(0, seed)
    if (!new RegExp(`^(${head})+$`).test(t)) continue
    if (!VOWELISH.test(head)) return true
    if (KEYBOARD_ROWS.some(row => row.includes(head))) return true
  }
  return false
}

/**
 * The name is a keyboard walk. One walking token inside an otherwise normal
 * name is left alone unless it is long, because "Wert" is a real surname and a
 * four-letter run in isolation is not enough to call someone a fake. Every
 * token walking, or one walking for five characters, is.
 */
function isNameKeyboardWalk(name: string): boolean {
  const toks = name.split(/[\s.]+/).filter(Boolean)
  const walkers = toks.filter(isTokenKeyboardWalk)
  if (!walkers.length) return false
  return walkers.length === toks.length || walkers.some(t => t.replace(/[^a-z0-9]/gi, '').length >= 5)
}

/** A Latin token long enough to be a name but with nothing to pronounce in it.
 *  Three letters is the floor: "Ng" and "Xu" are real, "sdf" is not. */
function isUnpronounceable(tok: string): boolean {
  const latin = tok.replace(/[^A-Za-z]/g, '')
  if (latin.length < 3) return false
  // Only judge tokens that are ENTIRELY Latin. A transliteration carrying
  // accents or another script is not ours to score.
  if (latin.length !== tok.replace(/[^A-Za-zÀ-ɏ]/g, '').length) return false
  return !VOWELISH.test(latin)
}

/**
 * The WHOLE name is unsayable, not merely one token of it.
 *
 * This is the rule that has to be held tightly, because names carry legal
 * suffixes and honorifics that are pure consonants. Checked against every name
 * ever submitted: judging one token at a time would have rejected thirty real
 * paying customers, among them "Airgate Pty Ltd", "FACTOR Innsbruck GmbH",
 * "Michael Kanehl PLLC" and "MRS R GRAY". One real word anywhere in the name
 * makes it a name.
 *
 * The four-letter floor spares bare acronyms ("DCC", "PTS"), which are how
 * plenty of small businesses write themselves.
 */
function isNameUnpronounceable(name: string): boolean {
  const cands = name.split(/[\s.,]+/).filter(t => t.replace(/[^A-Za-z]/g, '').length >= 3)
  if (!cands.length) return false
  if (!cands.every(isUnpronounceable)) return false
  return cands.some(t => t.replace(/[^A-Za-z]/g, '').length >= 4)
}

/**
 * A first name that is a home-row pair: "sd iwanksi" (owner's example).
 *
 * SOFT, not a block. The same shape is how real customers write themselves:
 * "VB Consulting" and "rt brownrigg jr" both paid us, and v-b and r-t are both
 * keyboard neighbours. There is no test that separates those from "sd" without
 * guessing, so this scores the lead instead of rejecting the person.
 */
function firstNameLooksMashed(name: string): boolean {
  const raw = name.split(/[\s.]+/).filter(Boolean)[0] || ''
  const first = raw.replace(/[^A-Za-z]/g, '')
  if (first.length !== raw.replace(/[^A-Za-zÀ-ɏ]/g, '').length) return false
  if (first.length !== 2) return false
  return !VOWELISH.test(first) && isKeyboardPair(first)
}

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
    if (hasProfanity(name)) {
      // First, because it is the one an angry person types on purpose and the
      // one that is worst to print on a member pass.
      hard('name:profanity')
    } else if (FAMOUS_FULL_NAMES.has(name)) {
      hard('name:famous')
    } else if (hasNoLetters(name)) {
      hard('name:no_letters')
    } else if (hasTestToken(name)) {
      hard('name:test_token')
    } else if (allTokensVowelless(name)) {
      hard('name:no_vowels')
    } else if (FAKE_FULL_NAMES.has(name) || FAKE_SINGLE_NAMES.has(name) || FAKE_SINGLE_NAMES.has(nameCompact)) {
      hard('name:placeholder')
    } else if (startsWithFakeName(nameCompact)) {
      // Evasion by suffix. A real submission arrived as "John Doep" — one
      // letter appended to slip past an exact-match list. Prefix matching costs
      // nothing here because no real name begins with "johndoe" or "asdfasdf".
      hard('name:placeholder_variant')
    } else if (isKeyboardWalk(nameCompact)) {
      hard('name:keyboard_walk')
    } else if (isAllSameChar(nameCompact) && nameCompact.length >= 4) {
      hard('name:repeated_char')
    } else if (isNameKeyboardWalk(name)) {
      // A run off one keyboard row. The old check only looked at the whole
      // compact name, which any repetition ("asdf asdf") breaks.
      hard('name:keyboard_walk')
    } else if (isRepeatedSeed(nameCompact) || name.split(/[\s.]+/).filter(Boolean).some(isRepeatedSeed)) {
      // "qwe qweqwe", "jkl jkl" — typed once, then again.
      hard('name:repeated_seed')
    } else if (isNameUnpronounceable(name)) {
      // "sdsf dsfdsf". Long enough to clear every length rule, matching no
      // blocklist, and with nothing in it that can be said out loud.
      hard('name:unpronounceable')
    } else if (!hasRealNameToken(name)) {
      // Initials-only: "R S", "b d", ". M", "3 3". The dominant real-world fake
      // and the one an exact-match blocklist can never catch, because there is
      // nothing to match — it is people typing the minimum to get past the
      // field.
      //
      // DOWNGRADED TO SOFT, 2026-08-20. The note above said 37 such people since
      // Jul 5 and ZERO had ever paid. Backtesting this file against all 4,446
      // named submissions says otherwise: 39 initials-only leads, 3 of whom
      // PAID. That is 7.7% against a ~6.1% baseline, so they convert at least
      // as well as everybody else and hard-blocking them costs money.
      //
      // Initials are terse, not fake. The owner asked to block fake names, and
      // "P O" is a private person, not "Fuck Off". Kept as a flag so enrichment
      // still skips them, because there is genuinely no name to resolve.
      soft('name:no_real_token')
    } else {
      // Softer signals — flag but keep.
      if (firstNameLooksMashed(name)) soft('name:first_name_mash')
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
