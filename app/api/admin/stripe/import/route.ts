import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import {
  aggregateStripeByEmail,
  aggregateStripeIncrementalSince,
  importAggregatedToCRM,
} from '@/lib/stripe-import'

export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Latest stripe_imported_at across all rows = the wall-clock cutoff for
 *  the next incremental sync. NULL when nothing has ever been imported. */
async function getLastSyncMs(): Promise<number | null> {
  const c = sb()
  const { data } = await c
    .from('submissions')
    .select('stripe_imported_at')
    .not('stripe_imported_at', 'is', null)
    .order('stripe_imported_at', { ascending: false })
    .limit(1)
  const ts = data?.[0]?.stripe_imported_at
  if (!ts) return null
  return new Date(ts).getTime()
}

/**
 * POST /api/admin/stripe/import
 *
 * Body: {
 *   mode?: 'incremental' | 'full',  // default: 'incremental'
 *   dryRun?: boolean,
 *   resume?: boolean,               // only used in 'full' mode
 *   sinceMs?: number,               // override cutoff (rare; usually computed)
 * }
 *
 * Incremental mode (default):
 *   Looks at MAX(stripe_imported_at) across submissions, then only re-syncs
 *   emails with new charges / refunds / customer records since that cutoff.
 *   Falls back to a full sync on the first ever run (no prior sync state).
 *
 * Full mode:
 *   Walks every Stripe customer. Resumable via `resume=true` (default) which
 *   skips already-imported emails. Use this for nuclear re-sync.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { mode?: 'incremental' | 'full'; dryRun?: boolean; resume?: boolean; sinceMs?: number } = {}
  try { body = await req.json() } catch { /* empty body ok */ }
  const mode = body.mode ?? 'incremental'
  const dryRun = body.dryRun === true

  try {
    if (mode === 'incremental') {
      const sinceMs = body.sinceMs ?? await getLastSyncMs()
      if (sinceMs == null) {
        // First-ever run: nothing to be incremental against; force full.
        return NextResponse.json(
          { error: 'No prior sync found - - run a Full re-import first.', mode: 'incremental', sinceMs: null },
          { status: 400 },
        )
      }

      const t0 = Date.now()
      const { aggregated, totalEmails, hasMore, affectedEmails } = await aggregateStripeIncrementalSince(sinceMs, {
        deadlineMs: dryRun ? undefined : 240_000,
      })
      const aggregateMs = Date.now() - t0

      if (dryRun) {
        const totalLtv = Array.from(aggregated.values()).reduce((a, b) => a + b.lifetimeValueUsd, 0)
        return NextResponse.json({
          mode: 'incremental',
          dryRun: true,
          sinceMs,
          sinceIso: new Date(sinceMs).toISOString(),
          affectedEmails,
          totalEmails,
          processed: aggregated.size,
          totalLtv: Math.round(totalLtv * 100) / 100,
          hasMore,
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
        mode: 'incremental',
        sinceMs,
        sinceIso: new Date(sinceMs).toISOString(),
        affectedEmails,
        totalEmails,
        processed: aggregated.size,
        inserted: upsert.inserted,
        updated: upsert.updated,
        errors: upsert.errors,
        hasMore,
        aggregateMs,
        upsertMs,
      })
    }

    // ── Full mode (existing behavior) ───────────────────────────
    const resume = body.resume !== false
    let skipEmails: Set<string> | undefined
    if (resume && !dryRun) {
      const c = sb()
      const { data } = await c
        .from('submissions')
        .select('email')
        .not('stripe_imported_at', 'is', null)
      skipEmails = new Set((data || []).map((r: { email: string }) => r.email.toLowerCase()))
    }

    const t0 = Date.now()
    const { aggregated, totalEmails, hasMore } = await aggregateStripeByEmail({
      skipEmails,
      deadlineMs: dryRun ? undefined : 240_000,
    })
    const aggregateMs = Date.now() - t0

    if (dryRun) {
      const totalLtv = Array.from(aggregated.values()).reduce((a, b) => a + b.lifetimeValueUsd, 0)
      const multiCustomerEmails = Array.from(aggregated.values()).filter(a => a.customerIds.length > 1).length
      return NextResponse.json({
        mode: 'full',
        dryRun: true,
        totalEmails,
        processed: aggregated.size,
        skipped: skipEmails?.size ?? 0,
        totalLtv: Math.round(totalLtv * 100) / 100,
        multiCustomerEmails,
        hasMore,
        aggregateMs,
      })
    }

    const t1 = Date.now()
    const upsert = await importAggregatedToCRM(aggregated)
    const upsertMs = Date.now() - t1

    return NextResponse.json({
      mode: 'full',
      totalEmails,
      processed: aggregated.size,
      skipped: skipEmails?.size ?? 0,
      inserted: upsert.inserted,
      updated: upsert.updated,
      errors: upsert.errors,
      hasMore,
      aggregateMs,
      upsertMs,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * GET /api/admin/stripe/import
 *
 * Returns the last sync timestamp so the UI can render "Last synced X ago"
 * without triggering a sync.
 */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const sinceMs = await getLastSyncMs()
    return NextResponse.json({
      lastSyncMs: sinceMs,
      lastSyncIso: sinceMs ? new Date(sinceMs).toISOString() : null,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
