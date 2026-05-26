// Bulk-import Stripe customers into the unified CRM (submissions table).
//
// Stripe customers (cus_XXX) can share an email. We collapse the entire
// graph into ONE submission row per lowercased email:
//   • union of customer IDs
//   • sum of paid, non-refunded charges
//   • aggregated product lines from invoices
//   • subscription summary
//
// Stripe is the source of truth when conflicts arise — overwrites name,
// country, and every stripe_* column. Quiz-derived fields (archetype,
// score, ai_level, etc.) stay untouched.
//
// New customers without a quiz row land as `source='stripe'` rows that
// can later be enriched via the existing v2 pipeline.

import Stripe from 'stripe'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { normalizeCountry } from './normalize'

let _stripe: Stripe | null = null
function stripeClient(): Stripe | null {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  _stripe = new Stripe(key, {
    apiVersion: '2026-04-22.dahlia',
    maxNetworkRetries: 5,           // auto-backoff on 429s — Stripe burst limits trip easily on bulk reads
    timeout: 30_000,
  })
  return _stripe
}

let _supabase: SupabaseClient | null = null
function supabase(): SupabaseClient {
  if (_supabase) return _supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  _supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _supabase
}

// ─────────────────────────────────────────────────────────────────
// Aggregation types
// ─────────────────────────────────────────────────────────────────

export interface ProductLine {
  productId?: string
  name?: string
  totalAmount: number   // USD
  count: number
  firstPaidAt?: string
  lastPaidAt?: string
}

export interface SubscriptionSummary {
  id: string
  status: string
  productId?: string
  productName?: string
  amount?: number
  interval?: string
  currentPeriodEnd?: string
  cancelAt?: string | null
}

export interface AggregatedCustomer {
  email: string
  customerIds: string[]              // all cus_XXX with this email
  primaryCustomerId: string          // most recently created
  name?: string
  country?: string
  lifetimeValueUsd: number
  products: ProductLine[]
  subscriptions: SubscriptionSummary[]
  firstChargeAt?: string
  lastChargeAt?: string
  // Raw payload — kept for the detail-page Stripe card
  raw: { customers: Stripe.Customer[]; chargeCount: number; invoiceCount: number }
}

// ─────────────────────────────────────────────────────────────────
// Step 1: iterate Stripe and aggregate
// ─────────────────────────────────────────────────────────────────

/**
 * Walk every Stripe customer, group by lowercased email, and for each
 * group compute the unified LTV, product breakdown, subscription summary.
 *
 * Customers without an email are skipped (can't dedupe by email).
 *
 * Options:
 *   skipEmails — emails already imported (skip the slow per-customer fetch)
 *   deadlineMs — wall-clock budget; stop processing once exceeded, return what we have
 */
export async function aggregateStripeByEmail(opts: { skipEmails?: Set<string>; deadlineMs?: number } = {}): Promise<{
  aggregated: Map<string, AggregatedCustomer>
  totalEmails: number
  hasMore: boolean
}> {
  const stripe = stripeClient()
  if (!stripe) throw new Error('STRIPE_SECRET_KEY not set')

  // Group customers by email first (cheap — one paginated list)
  const customersByEmail = new Map<string, Stripe.Customer[]>()
  for await (const customer of stripe.customers.list({ limit: 100 })) {
    const email = customer.email?.trim().toLowerCase()
    if (!email) continue
    const bucket = customersByEmail.get(email) || []
    bucket.push(customer)
    customersByEmail.set(email, bucket)
  }

  // Process emails in parallel. Stripe's burst limit is tighter than the
  // documented 100 req/s — bulk reads with concurrency=4 still tripped
  // rate-limits. CONCURRENCY=2 + SDK maxNetworkRetries handles transient
  // 429s gracefully. Slower but reliable.
  const CONCURRENCY = 2
  const result = new Map<string, AggregatedCustomer>()
  const totalEmails = customersByEmail.size

  // Filter out already-imported emails BEFORE the slow per-customer loop
  const skipEmails = opts.skipEmails || new Set()
  const entries = Array.from(customersByEmail.entries()).filter(([email]) => !skipEmails.has(email))
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity
  let hasMore = false
  const s: Stripe = stripe  // narrow for use inside the closure (TypeScript loses the null-check across the async boundary)

  async function processOne(email: string, customers: Stripe.Customer[]) {
    customers.sort((a, b) => (b.created || 0) - (a.created || 0))
    const primary = customers[0]
    const customerIds = customers.map(c => c.id)

    // Charges → LTV + first/last charge timestamps
    let totalCents = 0
    let chargeCount = 0
    let firstChargeAt: number | undefined
    let lastChargeAt: number | undefined
    // Invoices → product aggregation
    const productMap = new Map<string, ProductLine>()
    let invoiceCount = 0
    // Subscriptions
    const subscriptions: SubscriptionSummary[] = []

    for (const c of customers) {
      // Parallel per-customer
      const [charges, invoices, subs] = await Promise.all([
        collect(s.charges.list({ customer: c.id, limit: 100 })),
        collect(s.invoices.list({ customer: c.id, limit: 100 })),
        collect(s.subscriptions.list({ customer: c.id, limit: 100, status: 'all' })),
      ])

      for (const charge of charges) {
        if (!charge.paid || charge.refunded || charge.status !== 'succeeded') continue
        const net = charge.amount - (charge.amount_refunded || 0)
        if (net <= 0) continue
        totalCents += net
        chargeCount++
        const createdMs = (charge.created || 0) * 1000
        if (firstChargeAt === undefined || createdMs < firstChargeAt) firstChargeAt = createdMs
        if (lastChargeAt === undefined || createdMs > lastChargeAt) lastChargeAt = createdMs
      }

      for (const inv of invoices) {
        if (inv.status !== 'paid') continue
        invoiceCount++
        for (const line of inv.lines?.data || []) {
          // line.price.product is either a string id or an expanded Product
          const price = (line as unknown as { price?: { product?: string | { id?: string; name?: string } } }).price
          const productId = typeof price?.product === 'string'
            ? price.product
            : price?.product?.id
          const productName = typeof price?.product === 'object' ? price?.product?.name : undefined
          const desc = line.description || productName || productId || 'unknown'
          const key = productId || desc
          const existing = productMap.get(key) || {
            productId,
            name: productName || desc,
            totalAmount: 0,
            count: 0,
          }
          existing.totalAmount += (line.amount || 0) / 100
          existing.count += 1
          const ts = ((inv.status_transitions?.paid_at) || inv.created || 0) * 1000
          const tsIso = new Date(ts).toISOString()
          if (!existing.firstPaidAt || tsIso < existing.firstPaidAt) existing.firstPaidAt = tsIso
          if (!existing.lastPaidAt  || tsIso > existing.lastPaidAt)  existing.lastPaidAt  = tsIso
          productMap.set(key, existing)
        }
      }

      for (const sub of subs) {
        const item = sub.items?.data?.[0]
        const price = item?.price
        const productId = typeof price?.product === 'string' ? price?.product : (price?.product as { id?: string } | undefined)?.id
        const productName = typeof price?.product === 'object' ? (price?.product as { name?: string }).name : undefined
        const subWithPeriod = sub as Stripe.Subscription & { current_period_end?: number }
        subscriptions.push({
          id: sub.id,
          status: sub.status,
          productId,
          productName,
          amount: price?.unit_amount ? price.unit_amount / 100 : undefined,
          interval: price?.recurring?.interval,
          currentPeriodEnd: subWithPeriod.current_period_end
            ? new Date(subWithPeriod.current_period_end * 1000).toISOString()
            : undefined,
          cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
        })
      }
    }

    // Country from primary customer's billing address (Stripe always wins)
    const countryCode = primary.address?.country
    const country = countryCode ? isoCodeToName(countryCode) : undefined

    result.set(email, {
      email,
      customerIds,
      primaryCustomerId: primary.id,
      name: primary.name || undefined,
      country: country ? normalizeCountry(country) : undefined,
      lifetimeValueUsd: Math.round((totalCents / 100) * 100) / 100,
      products: Array.from(productMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
      subscriptions,
      firstChargeAt: firstChargeAt ? new Date(firstChargeAt).toISOString() : undefined,
      lastChargeAt:  lastChargeAt  ? new Date(lastChargeAt).toISOString()  : undefined,
      raw: { customers, chargeCount, invoiceCount },
    })
  }

  // Pool runner — process up to CONCURRENCY emails simultaneously,
  // respecting the wall-clock budget. Anything left over is returned as
  // `hasMore` so the caller can resume.
  const queue = [...entries]
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      if (Date.now() > deadline) { hasMore = true; return }
      const item = queue.shift()
      if (item) await processOne(item[0], item[1])
    }
  }))
  if (queue.length > 0) hasMore = true

  return { aggregated: result, totalEmails, hasMore }
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const x of it) out.push(x)
  return out
}

// ISO-3166 alpha-2 → human country name (minimum coverage matching
// lib/country-flags.ts). Anything unknown returns the code itself so
// normalizeCountry can still pass it through.
const A2_TO_NAME: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia',
  DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy', NL: 'Netherlands',
  BE: 'Belgium', CH: 'Switzerland', AT: 'Austria', SE: 'Sweden', NO: 'Norway',
  DK: 'Denmark', FI: 'Finland', IE: 'Ireland', PT: 'Portugal', PL: 'Poland',
  CZ: 'Czech Republic', RO: 'Romania', GR: 'Greece', HU: 'Hungary',
  IN: 'India', CN: 'China', JP: 'Japan', KR: 'South Korea', SG: 'Singapore',
  HK: 'Hong Kong', TW: 'Taiwan', TH: 'Thailand', ID: 'Indonesia',
  VN: 'Vietnam', PH: 'Philippines', MY: 'Malaysia', PK: 'Pakistan',
  BD: 'Bangladesh', AE: 'United Arab Emirates', SA: 'Saudi Arabia',
  IL: 'Israel', TR: 'Turkey', BR: 'Brazil', AR: 'Argentina', CL: 'Chile',
  CO: 'Colombia', MX: 'Mexico', ZA: 'South Africa', NG: 'Nigeria',
  KE: 'Kenya', EG: 'Egypt', MA: 'Morocco', NZ: 'New Zealand',
}
function isoCodeToName(code: string): string {
  return A2_TO_NAME[code.toUpperCase()] || code
}

// ─────────────────────────────────────────────────────────────────
// Step 2: upsert each aggregated customer into submissions
// ─────────────────────────────────────────────────────────────────

export interface UpsertCount {
  inserted: number
  updated: number
  errors: { email: string; error: string }[]
}

export async function importAggregatedToCRM(
  aggregated: Map<string, AggregatedCustomer>,
): Promise<UpsertCount> {
  const c = supabase()
  let inserted = 0
  let updated = 0
  const errors: { email: string; error: string }[] = []
  const importedAt = new Date().toISOString()

  for (const [email, a] of Array.from(aggregated.entries())) {
    try {
      // Find existing row (case-insensitive email)
      const { data: existing } = await c
        .from('submissions')
        .select('id, source')
        .ilike('email', email)
        .maybeSingle()

      // Stripe-derived columns — always overwrite (Stripe wins on conflict)
      const stripeFields: Record<string, unknown> = {
        stripe_customer_id: a.primaryCustomerId,
        stripe_customer_ids: a.customerIds,
        stripe_products: a.products,
        stripe_subscriptions: a.subscriptions,
        stripe_first_charge_at: a.firstChargeAt || null,
        stripe_last_charge_at: a.lastChargeAt || null,
        lifetime_value_usd: a.lifetimeValueUsd,
        stripe_imported_at: importedAt,
      }
      // Conflict-winning fields — also Stripe wins per the user's policy.
      if (a.name)    stripeFields.name = a.name
      if (a.country) stripeFields.country = a.country
      // Subscription tier: when there's an active subscription, set the
      // tier to that product name; otherwise leave whatever existed.
      const activeSub = a.subscriptions.find(s => s.status === 'active' || s.status === 'trialing')
      if (activeSub?.productName) stripeFields.subscription_tier = activeSub.productName

      if (existing) {
        const { error } = await c.from('submissions').update(stripeFields).eq('id', existing.id)
        if (error) throw new Error(error.message)
        updated++
      } else {
        // Stripe-only insert — minimal row, source='stripe', no quiz fields
        const id = randomUUID()
        const ts = a.firstChargeAt ? new Date(a.firstChargeAt).getTime() : Date.now()
        const insertPayload: Record<string, unknown> = {
          id,
          email,
          source: 'stripe',
          ts,
          ai_level: '', work_area: '', learning_style: '', time_commitment: '',
          main_goal: '', ai_tools: '', job_level: '',
          archetype: null,
          ...stripeFields,
        }
        const { error } = await c.from('submissions').insert(insertPayload)
        if (error) throw new Error(error.message)
        inserted++
      }
    } catch (err) {
      errors.push({ email, error: String(err) })
    }
  }

  return { inserted, updated, errors }
}
