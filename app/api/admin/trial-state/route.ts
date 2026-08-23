// Set (or clear) the manual state of a trial from the revenue page.
//
// The derived state in trial_ledger is always right about the money; this only
// records what the owner knows that the charges cannot say — on hold, disputed,
// recovered by hand. Sending state='auto' deletes the override and the row goes
// back to being derived.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The states the dropdown offers. Mirrors the owner's spreadsheet vocabulary,
 *  because that is what he reconciles against.
 *
 *  NOT exported: a Next route file may only export handlers and route config,
 *  and exporting a plain const here fails the build. Same rule that caught
 *  readLtvModel earlier. The dropdown keeps its own copy of this list. */
// 'hold' removed 2026-08-22 (owner: "Trialing and hold sono la stessa cosa")
// — it duplicated the derived Trialing state; existing holds were cleared.
const MANUAL_STATES = [
  'yearly_subscriber', 'recovered', 'lifetime', 'no_payment',
  'dispute', 'cancel', 'refunded', 'deleted',
] as const

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

/**
 * A live read, never a write: what does Stripe say about this customer RIGHT
 * NOW, at the moment the owner records a manual judgment (owner, 2026-08-23:
 * "when i change status by hand it also ... checks the stripe again"). This
 * is advisory only — his dropdown still wins regardless of what comes back —
 * it exists so a mis-click or a stale assumption gets caught immediately
 * instead of sitting wrong until the next reconciliation.
 */
async function stripeCheck(customerId: string): Promise<{ ok: true; hasActiveSubscription: boolean; subscriptionStatus: string | null } | { ok: false; error: string }> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return { ok: false, error: 'STRIPE_SECRET_KEY missing' }
  try {
    const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 1 })
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 5 })
    const active = subs.data.find(s => s.status === 'active' || s.status === 'trialing')
    const newest = subs.data.sort((a, b) => b.created - a.created)[0]
    return { ok: true, hasActiveSubscription: !!active, subscriptionStatus: active?.status ?? newest?.status ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function POST(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { chargeId?: string; state?: string; note?: string; customerId?: string } | null
  const chargeId = body?.chargeId?.trim()
  const state = body?.state?.trim()
  const customerId = body?.customerId?.trim() || null
  if (!chargeId || !state) return NextResponse.json({ error: 'chargeId and state required' }, { status: 400 })

  const c = db()
  if (state === 'auto') {
    const { error } = await c.from('trial_state_overrides').delete().eq('charge_id', chargeId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const check = customerId ? await stripeCheck(customerId) : null
    return NextResponse.json({ ok: true, state: 'auto', stripeCheck: check })
  }

  if (!(MANUAL_STATES as readonly string[]).includes(state)) {
    return NextResponse.json({ error: `unknown state: ${state}` }, { status: 400 })
  }
  const { error } = await c
    .from('trial_state_overrides')
    .upsert({ charge_id: chargeId, state, note: body?.note ?? null, updated_at: new Date().toISOString() },
            { onConflict: 'charge_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const check = customerId ? await stripeCheck(customerId) : null
  return NextResponse.json({ ok: true, state, stripeCheck: check })
}
