// Revenue — the whole Stripe account, since inception, from charges.
//
// This page exists because every revenue number we had was assembled from a
// different place: per-person LTV aggregates on one screen, a spreadsheet on
// another, ad-hoc SQL on a third. They disagreed, and every disagreement cost
// an evening. So there is now ONE chain, and this page is its face:
//
//   stripe_charges  every charge since 2023-11-11, refunds flagged
//        ↓
//   payment_eras    the pricing eras, as data you can correct
//        ↓
//   trial_ledger    one row per trial: who, which era, did the quiz earn it,
//                   did it convert, what it grossed
//
// Rules encoded in the ledger, each learned the hard way:
//   · a $54.74 charge is a $4.99 trial + a $49.75 lifetime, and buying the
//     lifetime IS converting, at that moment
//   · a conversion is any $20+ charge after the trial, not a hardcoded price,
//     because this account has used eight different annual prices
//   · a second trial within 32 days is a duplicate subscription, not a trial;
//     a second trial a year later, in a new era, is a real second trial
//   · a trial younger than 32 days is NOT DUE yet, so it never counts against
//     a conversion rate — UNLESS it already converted, because a payment
//     proves the bill date arrived (renewals land at day 30-31, so without
//     that clause a conversion could sit outside the denominator on the very
//     day it happened)

import { createClient } from '@supabase/supabase-js'
import TrialState from '@/components/admin/TrialState.client'
import RevenueChart, { type ChartPoint } from '@/components/admin/RevenueChart.client'
import TrialsTable, { type TrialRow } from '@/components/admin/TrialsTable.client'
import MonthsTable, { type MonthRow, type MonthTotals } from '@/components/admin/MonthsTable.client'
import MultiTrialTable, { type MultiTrialRow } from '@/components/admin/MultiTrialTable.client'
import { fmtDay, fmtMonth } from '@/lib/dates'
import SyncCharges from '@/components/admin/SyncCharges.client'
import LedgerHealth from '@/components/admin/LedgerHealth'
import type { CheckResult } from '@/lib/ledger-invariants'

/** The Stripe account these dashboard links point at. Not a secret: it is the
 *  account id that appears in every dashboard URL the owner already uses. */
const STRIPE_ACCT = 'acct_1O98fMBLsgHOvWxy'
const stripeCustomer = (cus: string) => `https://dashboard.stripe.com/${STRIPE_ACCT}/customers/${cus}`
/** Opens the customer with Stripe's "create subscription" panel already open
 *  and the customer pre-selected — the link shape the owner uses to put someone
 *  onto a yearly plan by hand. */
const stripeNewSub = (cus: string) =>
  `${stripeCustomer(cus)}?create=subscription&subscription_default_customer=${cus}`

export const dynamic = 'force-dynamic'
export const revalidate = 60

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const LATTE = '#FEF7E7'
const GREEN = '#2E7D32'
const AMBER = '#B26A00'
const RED = '#B00020'

interface Era { era: number; code: string; name: string; starts_on: string; ends_on: string | null; notes: string | null; color: string; is_quiz_era: boolean }
interface Row {
  charge_id: string; person_key: string; customer_id: string | null; name: string | null; stage: string | null; country: string | null; utm_source: string | null
  trial_at: string; trial_cents: number; era: number; attribution: string
  converted: boolean; due: boolean; converted_at: string | null; converted_cents: number | null
  gross_cents: number; lifetime_bundle: boolean; trial_refunded: boolean
  submission_id: string | null
}

/** The states a trial can be in. Deliberately exhaustive: every trial is in
 *  exactly one of them, so the counts always sum to the trial total.
 *
 *  'lapsed' SPLIT IN TWO, 2026-08-13, owner's operating rule: the
 *  Did-not-convert segment is his RETRY-PAYMENTS worklist and must contain
 *  only people with ZERO $59.75 subscriptions. A lapsed trial belonging to a
 *  person who converted on another trial (tom, snedata) or bought the
 *  lifetime (msfried) is a different case entirely — maybe a team seat,
 *  maybe a double-buy, only he knows case by case — so it gets its own state
 *  and stays out of the retry list. The per-row manual override dropdown
 *  remains his case-by-case discretion on top. */
type State = 'converted' | 'lifetime' | 'lapsed' | 'lapsed_covered' | 'not_due' | 'refunded' | 'manual'
function stateOf(r: Row, personPaysElsewhere: boolean): State {
  if (r.trial_refunded) return 'refunded'
  // A $54.74 buyer took the library outright: nothing left to renew, so they
  // are neither converted nor lapsed. Their own state, per the owner's rule.
  if (r.lifetime_bundle) return 'lifetime'
  if (r.converted) return 'converted'
  if (!r.due) return 'not_due'
  return personPaysElsewhere ? 'lapsed_covered' : 'lapsed'
}
const STATE_LABEL: Record<State, string> = {
  converted: 'Converted',
  lifetime: 'Lifetime',
  lapsed: 'Did not convert',
  lapsed_covered: 'Person already pays',
  not_due: 'Trialing',
  refunded: 'Refunded / disputed',
  manual: 'Set aside by hand',
}
const STATE_COLOR: Record<State, string> = { converted: GREEN, lifetime: '#7E9BB5', lapsed: RED, lapsed_covered: '#6B7FA3', not_due: AMBER, refunded: MUTE, manual: '#8A7A5C' }

/** THE MANUAL OVERRIDE WINS EVERYWHERE (owner, 2026-08-16: refunded and
 *  disputed people were sitting in the retry filter). The dropdown's state is
 *  a human judgment, and the filter used to ignore it, reading only the
 *  derived state — so a row hand-marked "dispute" still filed under Did not
 *  convert and even wore a charge button. Overrides now map into effective
 *  buckets: money-came-back states join Refunded/disputed, paying states join
 *  Converted or Lifetime, and hold/cancel/no_payment get their own
 *  "Set aside by hand" bucket. A row with ANY override can never be lapsed,
 *  which means it can never be in the retry list and never chargeable. */
const OVERRIDE_BUCKET: Record<string, State> = {
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

const navChip: React.CSSProperties = {
  padding: '6px 12px', fontSize: 11.5, fontWeight: 700,
  border: '2px solid #1A1A1A', background: '#FFFDFA', color: '#1A1A1A', textDecoration: 'none',
}

const ATTR_LABEL: Record<string, string> = {
  quiz_net_new: 'Quiz, new customer',
  quiz_existing: 'Quiz, existing customer',
  not_quiz: 'Not from the quiz',
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

async function load() {
  const c = db()
  const [eras, charges, lastSync, sheet, overrides, layout, mLayout, health] = await Promise.all([
    c.from('payment_eras').select('era, code, name, starts_on, ends_on, notes, color, is_quiz_era').order('era'),
    c.from('stripe_charges').select('amount_cents, refunded, charged_at, email, customer_email, customer_id').limit(20_000),
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

  const chRows = (charges.data ?? []) as { amount_cents: number; refunded: boolean; charged_at: string; email: string | null; customer_email: string | null; customer_id: string | null }[]
  // Every identity that has EVER paid us anything that is not a trial price —
  // lifetimes at any amount, legacy monthly and annual subscriptions, the lot,
  // on ANY of the person's Stripe customer ids. The ledger's converted and
  // lifetime_bundle flags only see post-trial pairings and the $54.74 bundle;
  // rebert (owner, 2026-08-13) bought a $49.87 lifetime in April 2025 under
  // one customer id and a $3.99 trial in July under another, so the ledger
  // called him lapsed while his profile rightly showed the lifetime. The
  // retry list must be people who pay us NOTHING, so the test is money
  // anywhere, not flags in one view. 29 rows across 27 people moved when
  // this shipped.
  const TRIAL_CENTS = new Set([399, 499, 5474])
  const payingEmails = new Map<string, { cents: number; at: string }>()
  const payingCustomers = new Set<string>()
  for (const ch of chRows) {
    if (ch.refunded || TRIAL_CENTS.has(ch.amount_cents)) continue
    const em = (ch.email || ch.customer_email || '').toLowerCase().trim()
    if (em && !payingEmails.has(em)) payingEmails.set(em, { cents: ch.amount_cents, at: ch.charged_at })
    if (ch.customer_id) payingCustomers.add(ch.customer_id)
  }
  const sheetByMonth = new Map<string, number>()
  for (const r of (sheet.data ?? []) as { trial_date: string }[]) {
    const m = r.trial_date.slice(0, 7)
    sheetByMonth.set(m, (sheetByMonth.get(m) || 0) + 1)
  }
  const lay = (layout.data?.value ?? null) as { order?: string[]; hidden?: string[] } | null
  const mLay = (mLayout.data?.value ?? null) as { order?: string[]; hidden?: string[] } | null
  const overrideBy = new Map<string, string>()
  for (const o of (overrides.data ?? []) as { charge_id: string; state: string }[]) {
    overrideBy.set(o.charge_id, o.state)
  }
  return {
    eras: (eras.data ?? []) as Era[],
    ledger,
    overrideBy,
    colOrder: lay?.order ?? null,
    colHidden: lay?.hidden ?? null,
    monthColOrder: mLay?.order ?? null,
    monthColHidden: mLay?.hidden ?? null,
    chargeRows: chRows,
    payingEmails,
    payingCustomers,
    grossAll: chRows.filter(r => !r.refunded).reduce((a, r) => a + r.amount_cents, 0) / 100,
    chargeCount: chRows.length,
    firstCharge: chRows.reduce((a, r) => (a && a < r.charged_at ? a : r.charged_at), ''),
    sheetByMonth,
    lastSyncedAt: (lastSync.data?.synced_at as string | undefined) ?? null,
    checks: ((health.data?.results ?? null) as CheckResult[] | null),
    checksRanAt: ((health.data?.ran_at ?? null) as string | null),
  }
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString()}`
const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '–')

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ border: `2px solid ${INK}`, background: LATTE, padding: '13px 15px' }}>
      <div className="font-mono uppercase" style={{ fontSize: 9.5, letterSpacing: '.14em', color: MUTE, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, lineHeight: 1.1, marginTop: 5, color: INK, letterSpacing: '-0.03em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTE, marginTop: 3, lineHeight: 1.35 }}>{sub}</div>}
    </div>
  )
}

export default async function RevenuePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  let d: Awaited<ReturnType<typeof load>> | null = null
  let err: string | null = null
  try { d = await load() } catch (e) { err = e instanceof Error ? e.message : String(e) }
  if (err || !d) {
    return <div style={{ padding: 26 }}><h1 style={{ fontWeight: 800, fontSize: 24 }}>Revenue</h1><p style={{ color: '#B00' }}>{err}</p></div>
  }

  const L = d.ledger
  const due = L.filter(r => r.due && !r.trial_refunded).length
  const convDue = L.filter(r => r.converted && r.due).length
  const trialCash = L.reduce((a, r) => a + (r.trial_refunded ? 0 : r.trial_cents), 0) / 100
  const convCash = L.reduce((a, r) => a + (r.converted_cents ?? 0), 0) / 100

  const byMonth = new Map<string, { t: number; c: number; due: number; cdue: number; trial: number; conv: number; era: number; q: number }>()
  for (const r of L) {
    const m = r.trial_at.slice(0, 7)
    const e = byMonth.get(m) || { t: 0, c: 0, due: 0, cdue: 0, trial: 0, conv: 0, era: r.era, q: 0 }
    e.t++
    if (r.converted) e.c++
    if (r.due && !r.trial_refunded) { e.due++; if (r.converted) e.cdue++ }
    if (!r.trial_refunded) e.trial += r.trial_cents / 100
    e.conv += (r.converted_cents ?? 0) / 100
    if (r.attribution !== 'not_quiz') e.q++
    e.era = Math.max(e.era, r.era)
    byMonth.set(m, e)
  }
  const months = Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  const monthRows: MonthRow[] = months.map(([m, v]) => ({
    month: m, era: v.era, trials: v.t, quiz: v.q, due: v.due, converted: v.cdue,
    trialCash: v.trial, convCash: v.conv,
    sheet: d!.sheetByMonth.has(m) ? d!.sheetByMonth.get(m)! : null,
  }))
  const monthTotals: MonthTotals = {
    trials: L.length,
    quiz: months.reduce((a, [, v]) => a + v.q, 0),
    due, converted: convDue, trialCash, convCash,
    sheet: Array.from(d.sheetByMonth.values()).reduce((a, b) => a + b, 0),
  }

  // Every dollar the account took inside each era's window. Eras 1a and 1b
  // have no trials at all — the product did not exist — so a trial-only table
  // showed them empty, which read as "no revenue" when they in fact carry the
  // subscription and lifetime-deal money.
  const eraCash = new Map<number, number>()
  for (const ch of d.chargeRows) {
    if (ch.refunded) continue
    const day = ch.charged_at.slice(0, 10)
    const e = d.eras.find(x => day >= x.starts_on && (!x.ends_on || day <= x.ends_on))
    if (!e) continue
    eraCash.set(e.era, (eraCash.get(e.era) ?? 0) + ch.amount_cents / 100)
  }

  const byEra = new Map<number, { t: number; cdue: number; due: number; trial: number; conv: number }>()
  for (const r of L) {
    const e = byEra.get(r.era) || { t: 0, cdue: 0, due: 0, trial: 0, conv: 0 }
    e.t++
    if (r.due && !r.trial_refunded) { e.due++; if (r.converted) e.cdue++ }
    if (!r.trial_refunded) e.trial += r.trial_cents / 100
    e.conv += (r.converted_cents ?? 0) / 100
    byEra.set(r.era, e)
  }

  // Never hardcode which era is the quiz one: merging two eras renumbered it
  // once already. payment_eras carries the flag.
  const quizEraNo = d.eras.find(e => e.is_quiz_era)?.era ?? -1
  const quizEra = L.filter(r => r.era === quizEraNo)

  // Chart series: one point per month since inception, with the era it fell in
  // and what that cohort has earned.
  const chartPoints: ChartPoint[] = Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, v]) => ({ month: m, trials: v.t, gross: v.trial + v.conv, era: v.era }))
  const chartEras = d.eras.map(e => ({ era: e.era, code: e.code, name: e.name, color: e.color }))
  const att = {
    net: quizEra.filter(r => r.attribution === 'quiz_net_new').length,
    existing: quizEra.filter(r => r.attribution === 'quiz_existing').length,
    none: quizEra.filter(r => r.attribution === 'not_quiz').length,
  }

  // ── People table, filtered by the query string ──────────────────────
  // Which people pay us through ANOTHER trial (a conversion or a lifetime).
  // Built from the SAME ledger rows, before any filtering, because both the
  // state derivation and the row note read it. This is what keeps the
  // Did-not-convert segment a clean retry worklist: a lapsed trial of a
  // paying person files under "Person already pays" instead (tom, snedata,
  // msfried — the three the owner caught on 2026-08-13).
  const personOutcome = new Map<string, string>()
  for (const r of L) {
    if (r.trial_refunded) continue
    if (r.converted) personOutcome.set(r.person_key, `their ${r.trial_at.slice(0, 10)} trial converted on ${(r.converted_at || '').slice(0, 10)}`)
    else if (r.lifetime_bundle && !personOutcome.has(r.person_key)) personOutcome.set(r.person_key, `they bought the lifetime outright on ${r.trial_at.slice(0, 10)}`)
  }
  // Off-ledger money: lifetimes bought BEFORE the trial, legacy monthly and
  // annual subscribers, any customer id under the same email (rebert's
  // $49.87 lifetime from April 2025). See the payingEmails build in load().
  const paysOffLedger = (r: Row): string | null => {
    if (personOutcome.has(r.person_key)) return null
    const em = r.person_key.toLowerCase().trim()
    const hit = d!.payingEmails.get(em)
    if (hit) return `they paid $${(hit.cents / 100).toFixed(2)} on ${hit.at.slice(0, 10)}, outside the trial plans (a lifetime or legacy subscription)`
    if (r.customer_id && d!.payingCustomers.has(r.customer_id)) return 'they hold a non-trial payment on this Stripe customer (lifetime or legacy subscription)'
    return null
  }
  const personPays = (r: Row) => personOutcome.has(r.person_key) || paysOffLedger(r) !== null
  // Effective state: the hand-set override when one exists, the derived state
  // otherwise. Every filter, count and button decision below uses THIS.
  const effState = (r: Row): State => {
    const ov = d!.overrideBy.get(r.charge_id)
    if (ov && ov !== 'auto') return OVERRIDE_BUCKET[ov] ?? 'manual'
    return stateOf(r, personPays(r))
  }
  const fState = (searchParams.state || '') as State | ''
  const fEra = searchParams.era ? Number(searchParams.era) : 0
  const fAttr = searchParams.attr || ''
  // India is EXCLUDED from this table by default (owner, 2026-08-13): their
  // trials do not renew (0 of 43 measured, which is why India is sold the
  // lifetime instead), so retrying annual charges there is noise at best.
  // The toggle chip brings them back for the case-by-case look. Section 3
  // only — the money sections above stay complete, excluding a country from
  // revenue reporting would falsify it.
  const includeIndia = searchParams.india === '1'
  const L3 = includeIndia ? L : L.filter(r => r.country !== 'India')
  const limit = Math.min(2000, Math.max(50, Number(searchParams.limit) || 200))
  const filtered = L3.filter(r =>
    (!fState || effState(r) === fState) &&
    (!fEra || r.era === fEra) &&
    (!fAttr || r.attribution === fAttr))
  const people = [...filtered].sort((a, b) => b.trial_at.localeCompare(a.trial_at)).slice(0, limit)
  const tableRows: TrialRow[] = people.map(r => {
    const st = effState(r)
    return {
      personNote: st === 'lapsed_covered' ? personOutcome.get(r.person_key) ?? paysOffLedger(r) : null,
      charge_id: r.charge_id, person_key: r.person_key, customer_id: r.customer_id,
      name: r.name, country: r.country, utm_source: r.utm_source,
      trial_at: r.trial_at, trial_cents: r.trial_cents, era: r.era, attribution: r.attribution,
      converted: r.converted, converted_at: r.converted_at, converted_cents: r.converted_cents,
      gross_cents: r.gross_cents, lifetime_bundle: r.lifetime_bundle,
      derivedState: st, derivedLabel: STATE_LABEL[st], derivedColor: STATE_COLOR[st],
      override: d!.overrideBy.get(r.charge_id) ?? null,
    }
  })
  const counts: Record<State, number> = { converted: 0, lifetime: 0, lapsed: 0, lapsed_covered: 0, not_due: 0, refunded: 0, manual: 0 }
  for (const r of L3) counts[effState(r)]++

  // Per-person rollup for section 4. Built from the SAME ledger rows the table
  // above renders, never a second query: "how many trials does this person
  // have" must have one answer on this page.
  const byPerson = new Map<string, MultiTrialRow>()
  for (const r of L) {
    if (r.trial_refunded) continue
    const e = byPerson.get(r.person_key) || {
      personKey: r.person_key, name: r.name, customerId: r.customer_id,
      trials: 0, renewals: 0, gap: 0, lifetimes: 0, notDue: 0,
      firstTrial: r.trial_at, lastTrial: r.trial_at, paidUsd: 0, quizEarned: false,
    }
    e.trials++
    e.paidUsd += r.gross_cents / 100
    if (r.converted) e.renewals++
    if (r.lifetime_bundle) e.lifetimes++
    if (!r.due) e.notDue++
    // A gap is a trial that is DUE, did not convert, and is not a lifetime.
    // Those three exclusions are what make the number actionable rather than
    // alarming: a trial from last week is not a missing subscription.
    if (r.due && !r.converted && !r.lifetime_bundle) e.gap++
    if (r.attribution === 'quiz_net_new' || r.attribution === 'quiz_existing') e.quizEarned = true
    if (r.trial_at < e.firstTrial) e.firstTrial = r.trial_at
    if (r.trial_at > e.lastTrial) e.lastTrial = r.trial_at
    if (!e.name && r.name) e.name = r.name
    if (!e.customerId && r.customer_id) e.customerId = r.customer_id
    byPerson.set(r.person_key, e)
  }
  const multiRows: MultiTrialRow[] = Array.from(byPerson.values()).filter(p => p.trials > 1)

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { state: fState || undefined, era: fEra ? String(fEra) : undefined, attr: fAttr || undefined, india: includeIndia ? '1' : undefined, ...patch }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    const s = p.toString()
    return `/admin/revenue${s ? `?${s}` : ''}`
  }

  const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, textAlign: 'right', padding: '7px 8px' }
  const td: React.CSSProperties = { fontSize: 12, padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const chip = (active: boolean): React.CSSProperties => ({
    display: 'inline-block', padding: '5px 10px', fontSize: 11.5, fontWeight: 700,
    border: `2px solid ${INK}`, background: active ? INK : '#FFFDFA', color: active ? LATTE : INK,
    textDecoration: 'none',
  })

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 1240 }}>
      <LedgerHealth checks={d.checks} ranAt={d.checksRanAt} />
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Revenue</h1>
      <p style={{ fontSize: 13.5, color: MUTE, marginTop: 6, maxWidth: 800, lineHeight: 1.55 }}>
        Every charge in the Stripe account since {fmtDay(d.firstCharge)}, {d.chargeCount.toLocaleString()} of them,
        turned into one trial ledger. This is the single source of truth: the dashboard, the simulator and the ads page
        all price against it.
      </p>

      {/* ERAS */}
      <div style={{ marginTop: 12 }}>
        <SyncCharges lastSyncedAt={d.lastSyncedAt} />
      </div>

      <h2 id="eras" style={{ fontSize: 15, fontWeight: 800, marginTop: 34, color: INK, scrollMarginTop: 16 }}>1 &middot; Eras and totals</h2>
      <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${INK}` }}>
            <th style={{ ...th, textAlign: 'left' }}>Era</th>
            <th style={{ ...th, textAlign: 'left' }}>Dates</th>
            <th style={th}>Trials</th>
            <th style={th}>Due</th>
            <th style={th}>Converted</th>
            <th style={th}>Rate</th>
            <th style={th}>Trial cash</th>
            <th style={th}>Conversion cash</th>
            <th style={th}>All revenue</th>
          </tr>
        </thead>
        <tbody>
          {d.eras.map(e => {
            const s = byEra.get(e.era)
            return (
              <tr key={e.era} style={{ borderBottom: `1px solid ${HAIR}` }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>
                  <span style={{ color: e.color }}>&#9632;</span> {e.code} &middot; {e.name}
                  {e.notes && <div style={{ fontSize: 10.5, color: MUTE, fontWeight: 400, marginTop: 2, maxWidth: 430, lineHeight: 1.4 }}>{e.notes}</div>}
                </td>
                <td style={{ ...td, textAlign: 'left', color: MUTE, fontSize: 11.5 }}>{fmtDay(e.starts_on)} → {e.ends_on ? fmtDay(e.ends_on) : 'now'}</td>
                <td style={td}>{s ? s.t.toLocaleString() : '–'}</td>
                <td style={{ ...td, color: MUTE }}>{s ? s.due.toLocaleString() : '–'}</td>
                <td style={td}>{s ? s.cdue.toLocaleString() : '–'}</td>
                <td style={{ ...td, fontWeight: 800, color: GREEN }}>{s ? pct(s.cdue, s.due) : '–'}</td>
                <td style={td}>{s ? usd0(s.trial) : '–'}</td>
                <td style={td}>{s ? usd0(s.conv) : '–'}</td>
                <td style={{ ...td, fontWeight: 800 }}>{usd0(eraCash.get(e.era) ?? 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5, maxWidth: 800 }}>
        Eras 1a and 1b have no trials because the trial product did not exist yet, so their trial and conversion cash
        are empty by definition. <strong style={{ color: INK }}>All revenue</strong> is every dollar the account took in
        that window, which is where their subscription and lifetime-deal money shows up. Rates count only trials whose
        renewal date has passed, so the current month never drags the number down.
      </p>

      {/* SECTION 2 */}
      <h2 id="over-time" style={{ fontSize: 15, fontWeight: 800, marginTop: 34, color: INK, scrollMarginTop: 16 }}>2 &middot; Trials over time</h2>
      <div style={{ marginTop: 10 }}>
        <RevenueChart points={chartPoints} eras={chartEras} />
      </div>
      <h3 style={{ fontSize: 13, fontWeight: 800, marginTop: 22, color: INK }}>The same months, as numbers</h3>
      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 4, maxWidth: 860, lineHeight: 1.6 }}>
        One row per month, on the date the TRIAL was bought. <strong style={{ color: INK }}>Trials</strong> is how many
        people started one. <strong style={{ color: INK }}>Due</strong> is how many of those are old enough to have been
        billed the annual (32+ days), and <strong style={{ color: INK }}>Converted / Rate</strong> count only those, which
        is why the newest months show a small denominator rather than a collapse.
        <strong style={{ color: INK }}> Trial cash</strong> is what those trials paid up front;
        <strong style={{ color: INK }}> conversion cash</strong> is what the same people paid when their annual or
        lifetime landed, credited back to the month they started. The last column is your spreadsheet, for checking.
      </p>
      <MonthsTable rows={monthRows} totals={monthTotals} initialOrder={d.monthColOrder} initialHidden={d.monthColHidden} />

      {/* SECTION 3 — the piece that matters most: the owner's CSV, live */}
      <h2 id="trials" style={{ fontSize: 15, fontWeight: 800, marginTop: 38, color: INK, scrollMarginTop: 16 }}>3 &middot; Every trial and its status</h2>
      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 4, maxWidth: 860, lineHeight: 1.6 }}>
        Every trial ever sold and what became of it, laid out like your trials spreadsheet: date, email, name, status,
        channel, source, country, first payment, second payment, total. Status is editable and saves as you change it,
        &ldquo;Auto&rdquo; means the charges decide. Drag any column header to move it, or × to remove it — the layout
        saves to your account, not to this browser. Each trial is in exactly one state, so the counts below always add up
        to {L3.length.toLocaleString()}{includeIndia ? '' : ' (India hidden)'}.
      </p>
      <div className="flex flex-wrap items-center" style={{ gap: 7, marginTop: 12 }}>
        <a href={qs({ state: undefined })} style={chip(!fState)}>All {L3.length}</a>
        {(['converted', 'lifetime', 'lapsed', 'lapsed_covered', 'not_due', 'refunded', 'manual'] as State[]).map(s => (
          <a key={s} href={qs({ state: fState === s ? undefined : s })} style={chip(fState === s)}>
            {STATE_LABEL[s]} {counts[s]}
          </a>
        ))}
        <span style={{ width: 12 }} />
        {d.eras.filter(e => byEra.has(e.era)).map(e => (
          <a key={e.era} href={qs({ era: fEra === e.era ? undefined : String(e.era) })} style={chip(fEra === e.era)}>
            Era {e.era}
          </a>
        ))}
        <span style={{ width: 12 }} />
        {Object.entries(ATTR_LABEL).map(([k, v]) => (
          <a key={k} href={qs({ attr: fAttr === k ? undefined : k })} style={chip(fAttr === k)}>{v}</a>
        ))}
        <span style={{ width: 12 }} />
        <a href={qs({ india: includeIndia ? undefined : '1' })} style={chip(includeIndia)}
          title="India is hidden by default: 0 of 43 due trials there ever renewed, which is why India is sold the lifetime. Toggle to look case by case.">
          {includeIndia ? 'India: shown' : `India: hidden (${L.length - L3.length})`}
        </a>
      </div>

      <div style={{ fontSize: 11.5, color: MUTE, marginTop: 10 }}>
        showing {people.length.toLocaleString()} of {filtered.length.toLocaleString()} matching
        {filtered.length > people.length && (
          <> · <a href={qs({ limit: String(Math.min(2000, limit + 300)) })} style={{ color: INK, fontWeight: 700 }}>show more</a></>
        )}
      </div>

      <TrialsTable rows={tableRows} initialOrder={d.colOrder} initialHidden={d.colHidden} />

      {/* SECTION 4 — the people who bought more than one trial.
          Only possible to see since trials started counting gross: the old
          rule threw the second one away, so this whole section was a blind
          spot with money in it. */}
      <h2 id="multi" style={{ fontSize: 15, fontWeight: 800, marginTop: 38, color: INK, scrollMarginTop: 16 }}>4 &middot; Customers with more than one trial</h2>
      <p style={{ fontSize: 12.5, color: MUTE, marginTop: 6, lineHeight: 1.55, maxWidth: 780 }}>
        Every $4.99 is a paid trial and a person may buy several, so somebody with two trials should end up with
        two yearlies. Where they have not, this says so. Read the gap column: that is a subscription to create or
        a duplicate to cancel.
      </p>
      <MultiTrialTable rows={multiRows} />
    </div>
  )
}
