import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { aggregateStripeByEmail, importAggregatedToCRM } from '@/lib/stripe-import'

export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/admin/stripe/import
 *
 * Body: {
 *   dryRun?: boolean,   // walk + aggregate but don't write
 *   resume?: boolean,   // skip emails already imported (default true)
 * }
 *
 * Resumable: each call has a ~250s budget for the slow per-customer
 * fetch loop. Anything not processed returns `hasMore: true` so the
 * caller can re-invoke. Skip-already-imported makes resumes efficient.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { dryRun?: boolean; resume?: boolean } = {}
  try { body = await req.json() } catch { /* empty body ok */ }
  const resume = body.resume !== false   // default true

  try {
    // For resume: list emails already imported, skip those
    let skipEmails: Set<string> | undefined
    if (resume && !body.dryRun) {
      const c = sb()
      const { data } = await c
        .from('submissions')
        .select('email')
        .not('stripe_imported_at', 'is', null)
      skipEmails = new Set((data || []).map((r: { email: string }) => r.email.toLowerCase()))
    }

    const t0 = Date.now()
    const { aggregated, totalEmails, hasMore: aggrHasMore } = await aggregateStripeByEmail({
      skipEmails,
      deadlineMs: body.dryRun ? undefined : 240_000,    // leave headroom for the upsert phase
    })
    const aggregateMs = Date.now() - t0

    if (body.dryRun) {
      const totalLtv = Array.from(aggregated.values()).reduce((a, b) => a + b.lifetimeValueUsd, 0)
      const multiCustomerEmails = Array.from(aggregated.values()).filter(a => a.customerIds.length > 1).length
      return NextResponse.json({
        dryRun: true,
        totalEmails,
        processed: aggregated.size,
        skipped: skipEmails?.size ?? 0,
        totalLtv: Math.round(totalLtv * 100) / 100,
        multiCustomerEmails,
        hasMore: aggrHasMore,
        aggregateMs,
        sample: Array.from(aggregated.values()).slice(0, 5).map(a => ({
          email: a.email,
          customerIds: a.customerIds.length,
          lifetimeValueUsd: a.lifetimeValueUsd,
          products: a.products.length,
        })),
      })
    }

    const t1 = Date.now()
    const upsert = await importAggregatedToCRM(aggregated)
    const upsertMs = Date.now() - t1

    return NextResponse.json({
      totalEmails,
      processed: aggregated.size,
      skipped: skipEmails?.size ?? 0,
      inserted: upsert.inserted,
      updated: upsert.updated,
      errors: upsert.errors,
      hasMore: aggrHasMore,
      aggregateMs,
      upsertMs,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
