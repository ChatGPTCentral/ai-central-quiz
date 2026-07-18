import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'

/**
 * GET /api/admin/env-status
 *
 * Returns a presence-only map of every env var the app expects. Values are
 * never returned - - only `true` / `false`. Used by ops to confirm which
 * keys are wired on a given environment without exposing secrets.
 */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const has = (k: string) => !!(process.env[k] && process.env[k]!.trim().length > 0)
  // Accept any of several documented aliases — the code falls back across them.
  const hasAny = (keys: string[]) => keys.some(has)

  return NextResponse.json({
    supabase: {
      url: hasAny(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']),
      serviceRole: hasAny(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY']),
    },
    enrichment: {
      APIFY:      hasAny(['APIFY_API_KEY', 'APIFY_TOKEN', 'APIFY_API_TOKEN']),
      APOLLO:     has('APOLLO_API_KEY'),
      ANTHROPIC:  has('ANTHROPIC_API_KEY'),
    },
    integrations: {
      BEEHIIV_API_KEY:        has('BEEHIIV_API_KEY'),
      BEEHIIV_PUBLICATION_ID: has('BEEHIIV_PUBLICATION_ID'),
      STRIPE_SECRET_KEY:      has('STRIPE_SECRET_KEY'),
    },
    flags: {
      NEXT_PUBLIC_ENRICH_V2: process.env.NEXT_PUBLIC_ENRICH_V2 || null,
      APIFY_LINKEDIN_ACTOR:  process.env.APIFY_LINKEDIN_ACTOR || null,
    },
    admin: {
      ADMIN_PASSWORD:       has('ADMIN_PASSWORD'),
      ADMIN_SESSION_SECRET: has('ADMIN_SESSION_SECRET'),
    },
    site: {
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || null,
      NEXT_PUBLIC_PAYMENT_URL: process.env.NEXT_PUBLIC_PAYMENT_URL || null,
      NEXT_PUBLIC_UPSELL_URL:  process.env.NEXT_PUBLIC_UPSELL_URL || null,
    },
  })
}
