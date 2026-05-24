// Standardization layer. The RAW job title / company / industry from LinkedIn
// is preserved in the columns we already have; this file derives canonical
// values that match the survey enum so dashboards segment cleanly.
//
// The banks are designed to GROW — add new entries over time without breaking
// existing rows.

/** Survey-enum seniority values (must match lib/questions.ts step 9 options). */
export type Seniority =
  | 'Founder'
  | 'C-Suite'
  | 'VP/Director'
  | 'Manager'
  | 'Individual contributor'
  | 'Student or intern'
  | 'Other'

// Lower-cased keyword → standardized seniority bucket.
// Order matters: more-specific keywords first (e.g. "vp engineering" before "engineer").
export const SENIORITY_BANK: Array<[RegExp, Seniority]> = [
  // Founder
  [/\b(founder|co[- ]?founder|owner|proprietor)\b/, 'Founder'],

  // C-Suite — match common C-level acronyms + variants
  [/\b(c-?suite|c-?level)\b/, 'C-Suite'],
  [/\bchief\b/, 'C-Suite'],
  [/\bc[efotmrips]o\b/, 'C-Suite'],  // ceo, cfo, cto, coo, cmo, cro, cpo, cio, cso

  // VP / Director / Head
  [/\b(svp|evp|senior vice president|executive vice president)\b/, 'VP/Director'],
  [/\b(vp|vice president)\b/, 'VP/Director'],
  [/\b(director|head of)\b/, 'VP/Director'],

  // Manager / Lead
  [/\b(senior manager|sr\.? manager|principal|staff)\b/, 'Manager'],
  [/\b(manager|team lead|lead|supervisor)\b/, 'Manager'],

  // Student / intern
  [/\b(student|intern|apprentice|trainee)\b/, 'Student or intern'],

  // Individual contributor (catch-all — most ICs fall here)
  [/\b(engineer|developer|programmer|software|swe|analyst|specialist|consultant|associate|advisor|coordinator|representative|executive|writer|designer|researcher|scientist|architect|accountant|paralegal|nurse|technician)\b/, 'Individual contributor'],
]

/** Returns a standardized Seniority bucket given a raw job title + optional raw seniority. */
export function standardizeSeniority(rawTitle?: string | null, rawSeniority?: string | null): Seniority | undefined {
  const text = `${rawSeniority || ''} ${rawTitle || ''}`.toLowerCase()
  if (!text.trim()) return undefined
  for (const [re, bucket] of SENIORITY_BANK) {
    if (re.test(text)) return bucket
  }
  return 'Other'
}

/**
 * Job-title bank — extensible canonical name lookup.
 *
 * Keys are LOWER-CASED matchers; the value is the canonical title we want to
 * display + segment on. Add to this map over time as new variants surface.
 * Unknown titles fall through to the raw title (preserved separately).
 */
export const TITLE_BANK: Record<string, string> = {
  // C-Suite
  'ceo': 'Chief Executive Officer',
  'cfo': 'Chief Financial Officer',
  'cto': 'Chief Technology Officer',
  'coo': 'Chief Operating Officer',
  'cmo': 'Chief Marketing Officer',
  'cpo': 'Chief Product Officer',
  'cro': 'Chief Revenue Officer',
  'cio': 'Chief Information Officer',
  'cso': 'Chief Strategy Officer',
  // Common heads / VPs
  'head of marketing': 'Head of Marketing',
  'head of sales': 'Head of Sales',
  'head of product': 'Head of Product',
  'vp marketing': 'VP of Marketing',
  'vp sales': 'VP of Sales',
  'vp product': 'VP of Product',
  'vp engineering': 'VP of Engineering',
  // Founders
  'founder': 'Founder',
  'co-founder': 'Co-Founder',
  'cofounder': 'Co-Founder',
  // Frequent IC roles — add more as you encounter them
  'software engineer': 'Software Engineer',
  'product manager': 'Product Manager',
  'data scientist': 'Data Scientist',
  'data analyst': 'Data Analyst',
  'marketing manager': 'Marketing Manager',
  'sales manager': 'Sales Manager',
  'account executive': 'Account Executive',
  'business development representative': 'BDR',
  'sales development representative': 'SDR',
  'designer': 'Designer',
  'consultant': 'Consultant',
}

/** Returns a canonical title if the raw matches the bank; otherwise undefined (so caller preserves raw). */
export function standardizeTitle(rawTitle?: string | null): string | undefined {
  if (!rawTitle) return undefined
  const t = rawTitle.trim().toLowerCase()
  // Direct hit
  if (TITLE_BANK[t]) return TITLE_BANK[t]
  // Strip prefixes like "senior", "sr.", "principal"
  const stripped = t.replace(/^(senior|sr\.?|principal|staff|lead)\s+/, '').trim()
  if (TITLE_BANK[stripped]) return TITLE_BANK[stripped]
  return undefined
}

/** Industry — pass-through helper for now (room to add a bank later if needed). */
export function standardizeIndustry(rawIndustry?: string | null): string | undefined {
  if (!rawIndustry) return undefined
  return rawIndustry.trim()
}
