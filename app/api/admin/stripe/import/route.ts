import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { aggregateStripeByEmail, importAggregatedToCRM } from '@/lib/stripe-import'

export const maxDuration = 300

/**
 * POST /api/admin/stripe/import
 *
 * Walks every Stripe customer, groups by email, aggregates LTV +
 * products + subscriptions, then upserts into the submissions table.
 *
 * Body: { dryRun?: boolean }
 *   dryRun=true returns the aggregation summary without writing.
 *
 * Stripe always wins on conflict (name + country + every stripe_*
 * column). Quiz-derived fields (archetype, score, ai_level, etc.)
 * stay untouched on existing rows.
 *
 * Stripe-only rows land as `source='stripe'`. They can later be
 * enriched via the normal v2 pipeline (Google → Apify → Apollo →
 * Beehiiv → Claude vision) just like quiz rows.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { dryRun?: boolean } = {}
  try { body = await req.json() } catch { /* empty body ok */ }

  try {
    const t0 = Date.now()
    const aggregated = await aggregateStripeByEmail()
    const aggregateMs = Date.now() - t0

    if (body.dryRun) {
      const totalLtv = Array.from(aggregated.values()).reduce((a, b) => a + b.lifetimeValueUsd, 0)
      const multiCustomerEmails = Array.from(aggregated.values()).filter(a => a.customerIds.length > 1).length
      return NextResponse.json({
        dryRun: true,
        emails: aggregated.size,
        totalLtv: Math.round(totalLtv * 100) / 100,
        multiCustomerEmails,
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
      emails: aggregated.size,
      inserted: upsert.inserted,
      updated: upsert.updated,
      errors: upsert.errors,
      aggregateMs,
      upsertMs,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
