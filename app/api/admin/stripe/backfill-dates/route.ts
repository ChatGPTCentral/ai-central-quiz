import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * POST /api/admin/stripe/backfill-dates
 *
 * Targeted fix for Stripe-imported rows whose `created_at` defaulted to
 * import time instead of the original Stripe customer.created date.
 *
 * Strategy: query rows where source='stripe' AND created_at > 2026-05-01
 * (i.e. "today-ish" dates that came from the broken first import). For
 * each row, retrieve the Stripe customer by ID — single fast API call —
 * and UPDATE the row's created_at + ts to the real customer.created.
 *
 * Body: { limit?: 300 }
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 })

  let body: { limit?: number } = {}
  try { body = await req.json() } catch { /* empty ok */ }
  const limit = Math.max(1, Math.min(body.limit ?? 300, 500))

  const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 5, timeout: 30_000 })
  const c = sb()

  // Find rows with broken dates (Stripe-imported but created_at is recent)
  const { data: rows, error } = await c
    .from('submissions')
    .select('id, stripe_customer_id, created_at')
    .eq('source', 'stripe')
    .gte('created_at', '2026-05-01')
    .not('stripe_customer_id', 'is', null)
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const candidates = (rows || []) as { id: string; stripe_customer_id: string; created_at: string }[]

  const t0 = Date.now()
  const deadline = t0 + 270_000
  let updated = 0
  let processed = 0
  const errors: { id: string; error: string }[] = []

  for (const row of candidates) {
    if (Date.now() > deadline) break
    processed++
    try {
      const cust = await stripe.customers.retrieve(row.stripe_customer_id)
      if (cust.deleted || !cust.created) continue
      const iso = new Date(cust.created * 1000).toISOString()
      const ts = cust.created * 1000
      const { error: upErr } = await c.from('submissions').update({ created_at: iso, ts }).eq('id', row.id)
      if (upErr) { errors.push({ id: row.id, error: upErr.message }); continue }
      updated++
    } catch (err) {
      errors.push({ id: row.id, error: String(err) })
    }
  }

  return NextResponse.json({
    candidates: candidates.length,
    processed,
    updated,
    hasMore: candidates.length === limit,
    errors,
    elapsedMs: Date.now() - t0,
  })
}
