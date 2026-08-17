// The one loader and state machinery behind the three revenue screens:
// /admin/revenue (the money), /admin/revenue/trials (every trial and its
// status), /admin/revenue/recovery (the retry queue).
//
// Split out 2026-08-16 when the owner restructured the revenue page. The
// three screens are three VIEWS of one dataset, so the dataset loads here,
// once, identically — the alternative is three pages that drift, which is
// the disease this project keeps being treated for.

import { createClient } from '@supabase/supabase-js'

export interface Era { era: number; code: string; name: string; starts_on: string; ends_on: string | null; notes: string | null; color: string; is_quiz_era: boolean }
export interface Row {
  charge_id: string; person_key: string; customer_id: string | null; name: string | null; stage: string | null; country: string | null; utm_source: string | null
  trial_at: string; trial_cents: number; era: number; attribution: string
  converted: boolean; due: boolean; converted_at: string | null; converted_cents: number | null
  gross_cents: number; lifetime_bundle: boolean; trial_refunded: boolean
  submission_id: string | null
}

/** The states a trial can be in. Deliberately exhaustive: every trial is in
 *  exactly one of them, so the counts always sum to the trial total. */
export type State = 'converted' | 'lifetime' | 'lapsed' | 'lapsed_covered' | 'not_due' | 'refunded' | 'manual'

export const STATE_LABEL: Record<State, string> = {
  converted: 'Converted',
  lifetime: 'Lifetime',
  lapsed: 'Did not convert',
  lapsed_covered: 'Person already pays',
  not_due: 'Trialing',
  refunded: 'Refunded / disputed',
  manual: 'Set aside by hand',
}
export const STATE_COLOR: Record<State, string> = { converted: '#2E7D32', lifetime: '#7E9BB5', lapsed: '#B00020', lapsed_covered: '#6B7FA3', not_due: '#B26A00', refunded: '#7A7A7A', manual: '#8A7A5C' }

export const ATTR_LABEL: Record<string, string> = {
  quiz_net_new: 'Quiz, new customer',
  quiz_existing: 'Quiz, existing customer',
  not_quiz: 'Not from the quiz',
}

/** THE MANUAL OVERRIDE WINS EVERYWHERE. The dropdown's state is a human
 *  judgment; a row with ANY override can never be lapsed, so it can never be
 *  in the retry queue and never chargeable. */
export const OVERRIDE_BUCKET: Record<string, State> = {
  yearly_subscriber: 'converted',
  recovered: 'converted',
  lifetime: 'lifetime',
  refunded: 'refunded',
  dispute: 'refunded',
  deleted: 'refunded',
  hold: 'manual',
  cancel: 'manual',
  no_payment: 'manual',
}

/** Trials sold in this window went through a flow that saved no card: they
 *  can never be one-click charged. The ledger keeps them; the trials and
 *  recovery screens hide them by default. */
export const NO_CARD_ERA_START = '2025-05-25'
export const NO_CARD_ERA_END = '2025-06-21'
export const inNoCardEra = (r: Row) => { const d = r.trial_at.slice(0, 10); return d >= NO_CARD_ERA_START && d <= NO_CARD_ERA_END }

function stateOf(r: Row, personPaysElsewhere: boolean): State {
  if (r.trial_refunded) return 'refunded'
  if (r.lifetime_bundle) return 'lifetime'
  if (r.converted) return 'converted'
  if (!r.due) return 'not_due'
  return personPaysElsewhere ? 'lapsed_covered' : 'lapsed'
}

export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

export type AdminAction = { at: string; action: string; person_key: string | null; detail: Record<string, unknown> | null }
export type ChargeLite = { amount_cents: number; refunded: boolean; charged_at: string; email: string | null; customer_email: string | null; customer_id: string | null }

export async function loadRevenueData() {
  const c = db()
  const [eras, lastSync, sheet, overrides, layout, mLayout, health] = await Promise.all([
    c.from('payment_eras').select('era, code, name, starts_on, ends_on, notes, color, is_quiz_era').order('era'),
    c.from('stripe_charges').select('synced_at').order('synced_at', { ascending: false }).limit(1).maybeSingle(),
    c.from('sheet_trials').select('trial_date').not('trial_date', 'is', null).limit(5000),
    c.from('trial_state_overrides').select('charge_id, state').limit(20_000),
    c.from('app_settings').select('value').eq('key', 'table_layout:revenue_trials').maybeSingle(),
    c.from('app_settings').select('value').eq('key', 'table_layout:revenue_months').maybeSingle(),
    c.from('ledger_checks').select('ran_at, passed, results').order('ran_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const ledger: Row[] = []
  for (let o = 0; o < 20_000; o += 1000) {
    const { data, error } = await c
      .from('trial_ledger')
      .select('charge_id, person_key, customer_id, name, stage, country, utm_source, trial_at, trial_cents, era, attribution, converted, due, converted_at, converted_cents, gross_cents, lifetime_bundle, trial_refunded, submission_id')
      .order('trial_at', { ascending: false })
      .range(o, o + 999)
    if (error || !data) break
    ledger.push(...(data as Row[]))
    if (data.length < 1000) break
  }

  // PAGED, never one-shot: a single response caps at 1,000 rows and the
  // table holds ~3,000 charges.
  const chRows: ChargeLite[] = []
  for (let o = 0; o < 30_000; o += 1000) {
    const { data, error } = await c
      .from('stripe_charges')
      .select('amount_cents, refunded, charged_at, email, customer_email, customer_id')
      .order('charged_at', { ascending: true })
      .range(o, o + 999)
    if (error || !data) break
    chRows.push(...(data as ChargeLite[]))
    if (data.length < 1000) break
  }

  // Every identity that has EVER paid anything that is not a trial price —
  // lifetimes at any amount, legacy monthly and annual subscriptions, on any
  // of the person's Stripe customer ids (rebert, wendy).
  const TRIAL_CENTS = new Set([399, 499, 5474])
  const payingEmails = new Map<string, { cents: number; at: string }>()
  const payingCustomers = new Set<string>()
  for (const ch of chRows) {
    if (ch.refunded || TRIAL_CENTS.has(ch.amount_cents)) continue
    const em = (ch.email || ch.customer_email || '').toLowerCase().trim()
    if (em && !payingEmails.has(em)) payingEmails.set(em, { cents: ch.amount_cents, at: ch.charged_at })
    if (ch.customer_id) payingCustomers.add(ch.customer_id)
  }

  const overrideBy = new Map<string, string>()
  for (const o of (overrides.data ?? []) as { charge_id: string; state: string }[]) overrideBy.set(o.charge_id, o.state)

  // Every charge-button attempt ever made, newest first (recovery ordering).
  const adminActions: AdminAction[] = []
  for (let o = 0; o < 10_000; o += 1000) {
    const { data, error } = await c.from('admin_actions').select('at, action, person_key, detail').order('at', { ascending: false }).range(o, o + 999)
    if (error || !data) break
    adminActions.push(...(data as AdminAction[]))
    if (data.length < 1000) break
  }

  const sheetByMonth = new Map<string, number>()
  for (const r of (sheet.data ?? []) as { trial_date: string }[]) {
    const m = r.trial_date.slice(0, 7)
    sheetByMonth.set(m, (sheetByMonth.get(m) || 0) + 1)
  }
  const lay = (layout.data?.value ?? null) as { order?: string[]; hidden?: string[] } | null
  const mLay = (mLayout.data?.value ?? null) as { order?: string[]; hidden?: string[] } | null

  return {
    eras: (eras.data ?? []) as Era[],
    ledger,
    overrideBy,
    adminActions,
    payingEmails,
    payingCustomers,
    colOrder: lay?.order ?? null,
    colHidden: lay?.hidden ?? null,
    monthColOrder: mLay?.order ?? null,
    monthColHidden: mLay?.hidden ?? null,
    chargeRows: chRows,
    grossAll: chRows.filter(r => !r.refunded).reduce((a, r) => a + r.amount_cents, 0) / 100,
    chargeCount: chRows.length,
    firstCharge: chRows.reduce((a, r) => (a && a < r.charged_at ? a : r.charged_at), ''),
    sheetByMonth,
    lastSyncedAt: (lastSync.data?.synced_at as string | undefined) ?? null,
    checks: (health.data?.results ?? null) as unknown,
    checksRanAt: (health.data?.ran_at ?? null) as string | null,
  }
}

export type RevenueData = Awaited<ReturnType<typeof loadRevenueData>>

/** The per-row state machinery, identical on every screen that renders
 *  trials. effState is the only state any filter, count or button may use. */
export function buildStateMachinery(d: RevenueData) {
  const personOutcome = new Map<string, string>()
  for (const r of d.ledger) {
    if (r.trial_refunded) continue
    if (r.converted) personOutcome.set(r.person_key, `their ${r.trial_at.slice(0, 10)} trial converted on ${(r.converted_at || '').slice(0, 10)}`)
    else if (r.lifetime_bundle && !personOutcome.has(r.person_key)) personOutcome.set(r.person_key, `they bought the lifetime outright on ${r.trial_at.slice(0, 10)}`)
  }
  const paysOffLedger = (r: Row): string | null => {
    if (personOutcome.has(r.person_key)) return null
    const em = r.person_key.toLowerCase().trim()
    const hit = d.payingEmails.get(em)
    if (hit) return `they paid $${(hit.cents / 100).toFixed(2)} on ${hit.at.slice(0, 10)}, outside the trial plans (a lifetime or legacy subscription)`
    if (r.customer_id && d.payingCustomers.has(r.customer_id)) return 'they hold a non-trial payment on this Stripe customer (lifetime or legacy subscription)'
    return null
  }
  const personPays = (r: Row) => personOutcome.has(r.person_key) || paysOffLedger(r) !== null
  const effState = (r: Row): State => {
    const ov = d.overrideBy.get(r.charge_id)
    if (ov && ov !== 'auto') return OVERRIDE_BUCKET[ov] ?? 'manual'
    return stateOf(r, personPays(r))
  }
  return { personOutcome, paysOffLedger, personPays, effState }
}
