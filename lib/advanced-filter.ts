// Advanced filter spec — used by the CRM submissions list to build
// arbitrary AND/OR rule trees against the submissions table.
//
// A FilterSpec is a JSON document the client posts (or URL-encodes) and the
// server translates into a supabase-js query chain. Operators are kept
// intentionally limited to the dozen most useful in a CRM filter UX.

export type Op =
  | 'eq' | 'neq'
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
  | 'empty' | 'not_empty'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'between'
  | 'in' | 'not_in'

export interface FilterRule {
  field: string                   // camelCase StoredSubmission field name
  op: Op
  value?: string | number | string[] | [string | number, string | number]
}

export interface FilterGroup {
  combinator: 'and' | 'or'
  rules: (FilterRule | FilterGroup)[]
}

export type FilterSpec = FilterGroup | null

// camelCase → snake_case DB column. Mirrors EDITABLE in submissions/[id]/route.
// Only fields that are sensibly filterable are listed.
export const FILTERABLE_FIELDS: Record<string, { col: string; type: 'text' | 'number' | 'enum' | 'boolean' | 'timestamp'; enum?: string[] }> = {
  // Identity
  name:                  { col: 'name',                  type: 'text' },
  email:                 { col: 'email',                 type: 'text' },
  // Work
  jobTitle:              { col: 'job_title',             type: 'text' },
  jobTitleStandardized:  { col: 'job_title_standardized', type: 'text' },
  seniority:             { col: 'seniority',             type: 'enum',
                           enum: ['Founder', 'C-Suite', 'VP/Director', 'Manager', 'Individual contributor', 'Student or intern', 'Other'] },
  jobFunction:           { col: 'job_function',          type: 'text' },
  department:            { col: 'department',            type: 'text' },
  jobLevel:              { col: 'job_level',             type: 'text' },
  // Company
  companyName:           { col: 'company_name',          type: 'text' },
  companyDomain:         { col: 'company_domain',        type: 'text' },
  companyWebsite:        { col: 'company_website',       type: 'text' },
  companyLinkedinUrl:    { col: 'company_linkedin_url',  type: 'text' },
  companySize:           { col: 'company_size',          type: 'text' },
  companyIndustry:       { col: 'company_industry',      type: 'text' },
  companySubIndustry:    { col: 'company_sub_industry',  type: 'text' },
  companyRevenue:        { col: 'company_revenue',       type: 'text' },
  companyFoundedYear:    { col: 'company_founded_year',  type: 'number' },
  // Location
  country:               { col: 'country',               type: 'text' },
  region:                { col: 'region',                type: 'text' },
  city:                  { col: 'city',                  type: 'text' },
  // Demographics
  ageBracket:            { col: 'age_bracket',           type: 'text' },
  ageAiEstimate:         { col: 'age_ai_estimate',       type: 'text' },
  sexAiEstimate:         { col: 'sex_ai_estimate',       type: 'enum', enum: ['male', 'female', 'uncertain'] },
  // Quiz / scoring
  archetype:             { col: 'archetype',             type: 'text' },
  score:                 { col: 'score',                 type: 'number' },
  aiLevel:               { col: 'ai_level',              type: 'text' },
  workArea:              { col: 'work_area',             type: 'text' },
  learningStyle:         { col: 'learning_style',        type: 'text' },
  timeCommitment:        { col: 'time_commitment',       type: 'text' },
  mainGoal:              { col: 'main_goal',             type: 'text' },
  aiTools:               { col: 'ai_tools',              type: 'text' },
  buyingIntent:          { col: 'buying_intent',         type: 'text' },
  // Source / UTM
  source:                { col: 'source',                type: 'enum', enum: ['survey', 'legacy', 'quiz_v2', 'fillout_v1', 'fillout_v2', 'fillout_legacy', 'apollo_legacy'] },
  utmSource:             { col: 'utm_source',            type: 'text' },
  utmRef:                { col: 'utm_ref',               type: 'text' },
  utmSourceBeehiiv:      { col: 'utm_source_beehiiv',    type: 'text' },
  // Beehiiv + Stripe
  subscriptionTier:      { col: 'subscription_tier',     type: 'text' },
  beehiivStatus:         { col: 'beehiiv_status',        type: 'enum', enum: ['active', 'unsubscribed', 'inactive', 'pending', 'needs_attention'] },
  stripeCustomerId:      { col: 'stripe_customer_id',    type: 'text' },
  lifetimeValueUsd:      { col: 'lifetime_value_usd',    type: 'number' },
  // Photo / LinkedIn presence
  linkedinUrl:           { col: 'linkedin_url',          type: 'text' },
  photoUrl:              { col: 'photo_url',             type: 'text' },
  // Status
  enrichmentStatus:      { col: 'enrichment_status',     type: 'enum', enum: ['complete', 'partial', 'failed'] },
  enrichedAt:            { col: 'enriched_at',           type: 'timestamp' },
  createdAt:             { col: 'created_at',            type: 'timestamp' },
  // Persona segmentation
  segment:               { col: 'segment',               type: 'enum',
                           enum: ['decision_maker', 'growth_operator', 'technical_builder', 'ai_power_user', 'mid_career_operator', 'curious_beginner', 'student_early_career', 'unclassified'] },
}

/**
 * Apply a FilterSpec onto a supabase-js builder. Recursively walks the rule
 * tree. For OR groups we use the `.or(...)` operator with PostgREST syntax;
 * for AND we just chain operators.
 *
 * Note: Supabase's .or() expects a flattened comma-separated string with
 * PostgREST syntax. We can build it as long as the OR branch contains only
 * leaf rules (no nested AND inside an OR). For simplicity we collapse any
 * sub-group inside an OR into its own .or() segment via a `and()` wrapper.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilterSpec(q: any, spec: FilterSpec): any {
  if (!spec) return q
  if (spec.rules.length === 0) return q

  if (spec.combinator === 'and') {
    let cur = q
    for (const rule of spec.rules) {
      if ('combinator' in rule) cur = applyFilterSpec(cur, rule)
      else cur = applyRule(cur, rule)
    }
    return cur
  }

  // OR — flatten to PostgREST or() string
  const orStr = spec.rules.map(rule => ruleToPostgrest(rule)).filter(Boolean).join(',')
  if (orStr) return q.or(orStr)
  return q
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyRule(q: any, rule: FilterRule): any {
  const meta = FILTERABLE_FIELDS[rule.field]
  if (!meta) return q
  const col = meta.col
  switch (rule.op) {
    case 'eq':            return q.eq(col, rule.value)
    case 'neq':           return q.neq(col, rule.value)
    case 'contains':      return q.ilike(col, `%${rule.value}%`)
    case 'not_contains':  return q.not(col, 'ilike', `%${rule.value}%`)
    case 'starts_with':   return q.ilike(col, `${rule.value}%`)
    case 'ends_with':     return q.ilike(col, `%${rule.value}`)
    case 'empty':         return q.or(`${col}.is.null,${col}.eq.`)
    case 'not_empty':     return q.not(col, 'is', null).neq(col, '')
    case 'gt':            return q.gt(col, rule.value)
    case 'gte':           return q.gte(col, rule.value)
    case 'lt':            return q.lt(col, rule.value)
    case 'lte':           return q.lte(col, rule.value)
    case 'between': {
      const v = rule.value as [string | number, string | number]
      if (!Array.isArray(v) || v.length !== 2) return q
      return q.gte(col, v[0]).lte(col, v[1])
    }
    case 'in':            return q.in(col, Array.isArray(rule.value) ? rule.value : [rule.value])
    case 'not_in':        return q.not(col, 'in', `(${(Array.isArray(rule.value) ? rule.value : [rule.value]).map(v => `"${v}"`).join(',')})`)
    default:              return q
  }
}

function ruleToPostgrest(rule: FilterRule | FilterGroup): string {
  if ('combinator' in rule) {
    // Nested group inside an OR — wrap as an and()
    const segs = rule.rules.map(r => ruleToPostgrest(r)).filter(Boolean)
    if (segs.length === 0) return ''
    return rule.combinator === 'and' ? `and(${segs.join(',')})` : `or(${segs.join(',')})`
  }
  const meta = FILTERABLE_FIELDS[rule.field]
  if (!meta) return ''
  const col = meta.col
  const v = rule.value
  switch (rule.op) {
    case 'eq':            return `${col}.eq.${v}`
    case 'neq':           return `${col}.neq.${v}`
    case 'contains':      return `${col}.ilike.%${v}%`
    case 'not_contains':  return `not.${col}.ilike.%${v}%`
    case 'starts_with':   return `${col}.ilike.${v}%`
    case 'ends_with':     return `${col}.ilike.%${v}`
    case 'empty':         return `${col}.is.null`
    case 'not_empty':     return `${col}.not.is.null`
    case 'gt':            return `${col}.gt.${v}`
    case 'gte':           return `${col}.gte.${v}`
    case 'lt':            return `${col}.lt.${v}`
    case 'lte':           return `${col}.lte.${v}`
    case 'in':            return `${col}.in.(${(Array.isArray(v) ? v : [v]).join(',')})`
    case 'not_in':        return `not.${col}.in.(${(Array.isArray(v) ? v : [v]).join(',')})`
    default:              return ''
  }
}

/** Encode a FilterSpec into a URL-safe string. Empty / null → ''. */
export function encodeSpec(spec: FilterSpec): string {
  if (!spec || spec.rules.length === 0) return ''
  return encodeURIComponent(JSON.stringify(spec))
}
/** Decode the URL-safe string back into a FilterSpec. Returns null if invalid. */
export function decodeSpec(s?: string | null): FilterSpec {
  if (!s) return null
  try {
    const obj = JSON.parse(decodeURIComponent(s))
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.rules)) return null
    return obj as FilterSpec
  } catch { return null }
}
