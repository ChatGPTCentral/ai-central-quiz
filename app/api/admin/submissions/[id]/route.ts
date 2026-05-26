import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { getSubmission, deleteSubmission } from '@/lib/kv'
import { createClient } from '@supabase/supabase-js'

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const item = await getSubmission(params.id)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await deleteSubmission(params.id)
  return NextResponse.json({ success: true })
}

// Whitelist of editable fields → DB column names. Every column the user can
// see in the CRM should be editable from here.
const EDITABLE: Record<string, string> = {
  // Identity
  name: 'name',
  email: 'email',
  // LinkedIn / photo
  linkedinUrl: 'linkedin_url',
  photoUrl: 'photo_url',
  // Work
  jobTitle: 'job_title',
  jobTitleStandardized: 'job_title_standardized',
  seniority: 'seniority',
  jobFunction: 'job_function',
  department: 'department',
  jobLevel: 'job_level',
  // Company
  companyName: 'company_name',
  companyDomain: 'company_domain',
  companyWebsite: 'company_website',
  companyLinkedinUrl: 'company_linkedin_url',
  companySize: 'company_size',
  companyIndustry: 'company_industry',
  companySubIndustry: 'company_sub_industry',
  companyRevenue: 'company_revenue',
  companyFunding: 'company_funding',
  companyFoundedYear: 'company_founded_year',
  // Location
  country: 'country',
  region: 'region',
  city: 'city',
  // Demographics
  ageBracket: 'age_bracket',
  ageAiEstimate: 'age_ai_estimate',
  sexAiEstimate: 'sex_ai_estimate',
  aiEstimateConfidence: 'ai_estimate_confidence',
  // Quiz / archetype / score
  archetype: 'archetype',
  score: 'score',
  aiLevel: 'ai_level',
  workArea: 'work_area',
  learningStyle: 'learning_style',
  timeCommitment: 'time_commitment',
  mainGoal: 'main_goal',
  aiTools: 'ai_tools',
  buyingIntent: 'buying_intent',
  // Source / UTM
  source: 'source',
  utmSource: 'utm_source',
  utmRef: 'utm_ref',
  utmSourceBeehiiv: 'utm_source_beehiiv',
  // Beehiiv + Stripe
  subscriptionTier: 'subscription_tier',
  beehiivStatus: 'beehiiv_status',
  stripeCustomerId: 'stripe_customer_id',
  lifetimeValueUsd: 'lifetime_value_usd',
  // Status
  enrichmentStatus: 'enrichment_status',
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, string | null>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  // Translate camelCase keys → snake_case columns, drop anything not whitelisted.
  const update: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(body)) {
    const col = EDITABLE[k]
    if (!col) continue
    // Empty string → null (clear the field)
    update[col] = (v === '' || v === undefined) ? null : v
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 })
  }

  const { error } = await client().from('submissions').update(update).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, updated: Object.keys(update) })
}
