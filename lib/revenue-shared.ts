// The one loader and state machinery behind the three revenue screens:
// /admin/revenue (the money), /admin/revenue/trials (every trial and its
// status), /admin/revenue/recovery (the retry queue).
//
// Split out 2026-08-16 when the owner restructured the revenue page. The
// three screens are three VIEWS of one dataset, so the dataset loads here,
// once, identically — the alternative is three pages that drift, which is
// the disease this project keeps being treated for.

import { createClient } from '@supabase/supabase-js'
import { keptUsdCents, eurAvgRate } from '@/lib/trial-entries'
import { STATE_LABEL, STATE_COLOR, OVERRIDE_BUCKET, liveState, type State } from '@/lib/revenue-states'
export { STATE_LABEL, STATE_COLOR, OVERRIDE_BUCKET, liveState, type State }

export interface Era { era: number; code: string; name: string; starts_on: string; ends_on: string | null; notes: string | null; color: string; is_quiz_era: boolean }
export interface Row {
  charge_id: string; person_key: string; customer_id: string | null; name: string | null; stage: string | null; country: string | null; utm_source: string | null
  trial_at: string; trial_cents: number; era: number; attribution: string
  converted: boolean; due: boolean; converted_at: string | null; converted_cents: number | null
  converted_charge_id: string | null; quiz_completed_at: string | null
  gross_cents: number; lifetime_bundle: boolean; trial_refunded: boolean
  submission_id: string | null
}

export const ATTR_LABEL: Record<string, string> = {
  quiz_net_new: 'Quiz, new customer',
  quiz_existing: 'Quiz, existing customer',
  not_quiz: 'Not from the quiz',
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
/** Superset of the classifier's ChargeRow, so classifyLedger can consume the
 *  SAME rows every total is computed from — one read, one truth. */
export type ChargeLite = { id: string; description: string | null; amount_cents: number; refunded: boolean; amount_refunded_cents: number; disputed: boolean; dispute_lost_cents: number; dispute_fee_cents: number; dispute_open_cents: number; fee_cents: number; settled_cents: number | null; settled_currency: string | null; bt_exchange_rate: number | null; charged_at: string; email: string | null; customer_email: string | null; customer_id: string | null }

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
      .select('charge_id, person_key, customer_id, name, stage, country, utm_source, trial_at, trial_cents, era, attribution, converted, due, converted_at, converted_cents, converted_charge_id, quiz_completed_at, gross_cents, lifetime_bundle, trial_refunded, submission_id')
      .order('trial_at', { ascending: false })
      .order('charge_id', { ascending: true })
      .range(o, o + 999)
    if (error || !data) break
    ledger.push(...(data as Row[]))
    if (data.length < 1000) break
  }

  // PAGED, never one-shot: a single response caps at 1,000 rows and the
  // table holds ~3,000 charges. Ordered by (charged_at, id) so pagination is
  // deterministic even on timestamp ties, and read ONCE: the classifier and
  // every total on the revenue screens consume THIS list, because two reads
  // of a table the hourly sync rewrites can straddle the write and disagree
  // by a phantom penny difference (seen live 2026-08-17, a red identity of
  // $15.41 that no data state could explain).
  const chRows: ChargeLite[] = []
  for (let o = 0; o < 30_000; o += 1000) {
    const { data, error } = await c
      .from('stripe_charges')
      .select('id, description, amount_cents, refunded, amount_refunded_cents, disputed, dispute_lost_cents, dispute_fee_cents, dispute_open_cents, fee_cents, settled_cents, settled_currency, bt_exchange_rate, charged_at, email, customer_email, customer_id')
      .order('charged_at', { ascending: true })
      .order('id', { ascending: true })
      .range(o, o + 999)
    if (error || !data) break
    chRows.push(...(data as ChargeLite[]))
    if (data.length < 1000) break
  }

  // Every identity that has EVER paid anything that is not a trial price —
  // lifetimes at any amount, legacy monthly and annual subscriptions, on any
  // of the person's Stripe customer ids (rebert, wendy).
  const TRIAL_CENTS = new Set([399, 499, 1495, 5474])
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

  const grossAll = chRows.filter(r => !r.refunded).reduce((a, r) => a + r.amount_cents, 0) / 100
  // THE display total (owner's rule, 2026-08-17, final form: "net is 77K
  // not 83"): what the account actually KEPT — refunds, lost disputes,
  // open-dispute withholdings, Stripe's fees all out, euro era at day
  // rates — per charge through the ONE keptUsdCents formula the classifier
  // also nets with, so every money number shown anywhere sums to this and
  // to the Stripe home screen's Net volume within rounding.
  const avgRateAll = eurAvgRate(chRows)
  const netAll = chRows.reduce((a, r) => {
    const k = keptUsdCents(r, avgRateAll)
    // Mirror the classifier's guard: a refunded-flagged charge with missing
    // refund detail must not count its face value as kept money.
    if (r.refunded && k > 0) return a
    return a + k
  }, 0) / 100
  // TAKE-HOME, split by SETTLEMENT currency. Discovered 2026-08-17: card
  // charges settle into the USD balance, but the 2024 → Jul-2025 PayPal and
  // invoice era settled 1,147 charges into a EUR balance, so their
  // settled_cents / fee_cents / dispute_fee_cents are EURO cents. The first
  // version summed the two as one dollar number; the currencies stay
  // separate here. The USD-equivalent values each euro flow at ITS OWN
  // DAY's market rate (bt_exchange_rate carries Stripe's 2% conversion fee,
  // so market ≈ rate / 0.98) — which is how Stripe's own home screen
  // counts, verified against the owner's screen to ~$200 on $77k while
  // today's-rate conversion missed by $2,300.
  const settleKnown = chRows.some(r => !!r.settled_currency)
  const takeHome = settleKnown
    ? (() => {
        const usdRows = chRows.filter(r => r.settled_currency !== 'eur')
        const eurRows = chRows.filter(r => r.settled_currency === 'eur')
        const rated = eurRows.filter(r => r.bt_exchange_rate)
        // Charge-weighted average settlement rate: the fallback for the rare
        // native-EUR charge that never converted (one €250 charge).
        const avgRate = rated.length ? rated.reduce((a, r) => a + (r.settled_cents ?? 0), 0) / rated.reduce((a, r) => a + r.amount_cents, 0) : 1
        const usdGross = usdRows.reduce((a, r) => a + r.amount_cents, 0)
        const usdFees = usdRows.reduce((a, r) => a + (r.fee_cents || 0), 0)
        const usdDisputeFees = usdRows.reduce((a, r) => a + (r.dispute_fee_cents || 0), 0)
        const usdRefunds = usdRows.reduce((a, r) => a + (r.amount_refunded_cents || 0), 0)
        const usdLost = usdRows.reduce((a, r) => a + (r.dispute_lost_cents || 0), 0)
        const usdOpen = usdRows.reduce((a, r) => a + (r.dispute_open_cents || 0), 0)
        let eurNetEur = 0
        let eurNetUsdEquiv = 0
        let eurRevenueNetEur = 0
        let eurFees = 0
        let eurDisputeFees = 0
        let eurOpenEur = 0
        for (const r of eurRows) {
          // Money that left the balance again, in the charge's own currency:
          // refunds, lost disputes, and open-dispute withholdings.
          const faceOut = (r.amount_refunded_cents || 0) + (r.dispute_lost_cents || 0) + (r.dispute_open_cents || 0)
          const faceRate = r.bt_exchange_rate || 1
          const net = (r.settled_cents ?? 0) - (r.fee_cents || 0) - (r.dispute_fee_cents || 0) - Math.round(faceOut * faceRate)
          eurNetEur += net
          eurNetUsdEquiv += net / ((r.bt_exchange_rate || avgRate) / 0.98)
          // The slice's rule-6 net (refunds and lost disputes out, fees NOT):
          // the number the take-home chain STARTS from, so the page never
          // has to print a gross figure (owner, 2026-08-17, twice).
          eurRevenueNetEur += (r.settled_cents ?? 0) - Math.round(((r.amount_refunded_cents || 0) + (r.dispute_lost_cents || 0)) * faceRate)
          eurFees += r.fee_cents || 0
          eurDisputeFees += r.dispute_fee_cents || 0
          eurOpenEur += Math.round((r.dispute_open_cents || 0) * faceRate)
        }
        const usdNet = usdGross - usdFees - usdDisputeFees - usdRefunds - usdLost - usdOpen
        return {
          usdGross: usdGross / 100,
          usdFees: usdFees / 100,
          usdDisputeFees: usdDisputeFees / 100,
          usdRefunds: usdRefunds / 100,
          usdLost: usdLost / 100,
          usdOpen: usdOpen / 100,
          usdNet: usdNet / 100,
          // The dollar slice's rule-6 net, the chain's net-first start.
          usdRevenueNet: (usdGross - usdRefunds - usdLost) / 100,
          eurNetEur: eurNetEur / 100,
          eurNetUsdEquiv: eurNetUsdEquiv / 100,
          eurRevenueNetEur: eurRevenueNetEur / 100,
          eurFees: eurFees / 100,
          eurDisputeFees: eurDisputeFees / 100,
          eurOpenEur: eurOpenEur / 100,
          totalUsdEquiv: (usdNet + eurNetUsdEquiv) / 100,
          eurCharges: eurRows.length,
        }
      })()
    : null

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
    grossAll,
    netAll,
    takeHome,
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

// ── The ONE retry rule ──────────────────────────────────────────────────
// Owner, 2026-08-22: "la tabella dei trial e dei trial da recuperare devono
// parlare." They did not: the trials table's charge button used its own
// inline eligibility (which knew nothing of outreach graduation) and the
// recovery queue used another. Same class of bug as every two-derivations
// incident in CLAUDE.md. This is now the only place that decides whether a
// trial may be auto-retried, and every screen renders from its verdict.

export type RetryVerdict =
  | 'eligible'        // show the charge button
  | 'graduated'       // owned by a human outreach sequence, auto-billing must not touch
  | 'india'           // standing exclusion: 0 of 43 due India trials ever renewed
  | 'no_card_era'     // 2025-05-25..06-21 saved no card, nothing to charge
  | 'not_lapsed'      // only a lapsed trial is a debt to retry
  | 'no_customer'     // no Stripe customer on the charge
  | 'unmapped_price'  // trial amount maps to no annual plan

export function retryVerdict(r: Row, st: State, graduated: Set<string>): RetryVerdict {
  if (r.country === 'India') return 'india'
  if (inNoCardEra(r)) return 'no_card_era'
  if (graduated.has(r.person_key.toLowerCase())) return 'graduated'
  if (st !== 'lapsed') return 'not_lapsed'
  if (!r.customer_id) return 'no_customer'
  if (r.trial_cents !== 399 && r.trial_cents !== 499 && r.trial_cents !== 1495) return 'unmapped_price'
  return 'eligible'
}

/** Latest charge-annual attempt per person, from the audit trail (the loader
 *  returns admin_actions newest first, so first-seen per person wins).
 *  Filtered to charge_annual_* actions on purpose: admin_actions now carries
 *  other kinds (verification_set and friends), and the recovery page's old
 *  inline loop would have displayed those as "failed:" attempts. */
export function lastChargeAttempts(actions: AdminAction[]): Map<string, { at: string; outcome: string }> {
  const m = new Map<string, { at: string; outcome: string }>()
  for (const a of actions) {
    if (!a.action.startsWith('charge_annual')) continue
    const pk = (a.person_key || '').toLowerCase()
    if (!pk || m.has(pk)) continue
    const det = (a.detail || {}) as Record<string, unknown>
    const outcome =
      a.action === 'charge_annual_created' ? `created ${String(det.subscription ?? '')}`
      : a.action === 'charge_annual_invoiced' ? `invoiced ${String(det.subscription ?? '')}`
      : a.action === 'charge_annual_refused' ? `refused: ${String(det.reason ?? '')}`
      : `failed: ${String(det.error ?? '').slice(0, 80)}`
    m.set(pk, { at: a.at, outcome })
  }
  return m
}

/** The outreach graduation set — people owned by human sequences, invisible
 *  to every auto-billing surface. One fetch, shared by both screens. */
export async function loadGraduatedSet(): Promise<Set<string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return new Set()
  try {
    const c = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
    })
    const { data } = await c.from('revenue_recovery_members').select('person_key')
    return new Set((data ?? []).map(r => String((r as { person_key: string }).person_key).toLowerCase()))
  } catch {
    return new Set()
  }
}
