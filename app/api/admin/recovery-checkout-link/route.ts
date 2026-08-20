// A real, hosted Stripe Checkout link for someone with NO quiz result to
// send them back to.
//
// WHY THIS EXISTS. The India/never-billed cohort (revenue_recovery_members,
// 2026-08-20) arrived with source='stripe' — a direct Stripe payment link,
// not the quiz. quiz_completed_at is null for all of them, so
// personResultPath (the usual "come back and finish checkout" link) would
// send them to an empty result page. And /api/admin/charge-annual creates the
// subscription SERVER-SIDE, which is exactly the mechanism that cannot
// complete a 3D Secure / SCA challenge — the owner's own hypothesis for why
// several of these were never billed in the first place. A HOSTED Checkout
// Session is the one link that can actually finish a 3DS challenge, because
// the cardholder completes it interactively, in their own browser.
//
// This creates the session and returns its real URL. It does not charge
// anything by itself — nothing moves until the person opens the link and
// pays. That makes it lower-risk than the retry buttons, not higher: worst
// case, an unused link expires (Stripe Checkout Sessions default to 24h).
//
// GUARDS, same posture as the rest of today's admin tools:
//   · admin session required
//   · REFUSED if the customer already holds a live (active/trialing/past_due)
//     subscription — same rule /api/admin/charge-annual enforces, so a
//     duplicate ask can never happen from either surface
//   · the plan is resolved from the TRIAL CHARGE ON RECORD server-side,
//     never trusted from the client — charging the wrong plan must stay
//     impossible
//   · every call lands in admin_actions

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { annualPriceForTrialCents } from '@/lib/offers-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

async function audit(action: string, personKey: string | null, customerId: string | null, detail: Record<string, unknown>) {
  try { await db().from('admin_actions').insert({ action, person_key: personKey, customer_id: customerId, detail }) }
  catch (e) { console.error('[recovery-checkout-link] audit insert failed:', e) }
}

export async function POST(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { customerId?: string; personKey?: string; chargeId?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const customerId = (body.customerId || '').trim()
  const personKey = (body.personKey || '').trim() || null
  const chargeId = (body.chargeId || '').trim()
  if (!customerId.startsWith('cus_') || !chargeId) {
    return NextResponse.json({ error: 'customerId and chargeId are required' }, { status: 400 })
  }

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return NextResponse.json({ error: 'Stripe key missing' }, { status: 500 })
  const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia', maxNetworkRetries: 1 })

  const { data: trialCharge } = await db().from('stripe_charges').select('amount_cents').eq('id', chargeId).maybeSingle()
  const trialCents = Number(trialCharge?.amount_cents ?? 0)
  const plan = annualPriceForTrialCents(trialCents)
  if (!plan) {
    await audit('recovery_checkout_link_refused', personKey, customerId, { reason: 'no annual plan mapped', trial_cents: trialCents, trial_charge_id: chargeId })
    return NextResponse.json({ error: `refused: trial charge has amount ${trialCents} cents, which maps to no annual plan` }, { status: 409 })
  }

  try {
    const existing = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 })
    const live = existing.data.filter(s => ['active', 'trialing', 'past_due'].includes(s.status))
    if (live.length > 0) {
      await audit('recovery_checkout_link_refused', personKey, customerId, { reason: 'already has a live subscription', subscription: live[0].id, status: live[0].status })
      return NextResponse.json({ error: `refused: this customer already has a ${live[0].status} subscription (${live[0].id}).` }, { status: 409 })
    }

    const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai').replace(/\/$/, '')
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: plan.id, quantity: 1 }],
        success_url: `${site}/checkout/success?recovery=1`,
        cancel_url: `${site}/?recovery=1`,
        metadata: { source: 'admin_recovery_checkout_link', trial_charge_id: chargeId, person_key: personKey ?? '' },
      },
      { idempotencyKey: `recovery-checkout-${chargeId}` },
    )

    await audit('recovery_checkout_link_created', personKey, customerId, {
      session_id: session.id, plan_cents: plan.cents, trial_cents: trialCents, trial_charge_id: chargeId,
    })
    return NextResponse.json({ ok: true, url: session.url, planCents: plan.cents, expiresAt: session.expires_at })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Stripe error'
    await audit('recovery_checkout_link_failed', personKey, customerId, { error: msg, trial_charge_id: chargeId })
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
