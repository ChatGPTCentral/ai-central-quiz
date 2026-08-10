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
//     a conversion rate

import { createClient } from '@supabase/supabase-js'
import TrialState from '@/components/admin/TrialState.client'

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

interface Era { era: number; name: string; starts_on: string; ends_on: string | null; notes: string | null }
interface Row {
  charge_id: string; person_key: string; customer_id: string | null; name: string | null; stage: string | null
  trial_at: string; trial_cents: number; era: number; attribution: string
  converted: boolean; due: boolean; converted_at: string | null; converted_cents: number | null
  gross_cents: number; lifetime_bundle: boolean; trial_refunded: boolean
  submission_id: string | null
}

/** The four states a trial can be in. This is the answer to "what happened to
 *  this person", and it is deliberately exhaustive: every trial is in exactly
 *  one of them, so the four counts always sum to the trial total. */
type State = 'converted' | 'lapsed' | 'not_due' | 'refunded'
function stateOf(r: Row): State {
  if (r.trial_refunded) return 'refunded'
  if (r.converted) return 'converted'
  return r.due ? 'lapsed' : 'not_due'
}
const STATE_LABEL: Record<State, string> = {
  converted: 'Converted',
  lapsed: 'Did not convert',
  not_due: 'Not due yet',
  refunded: 'Refunded',
}
const STATE_COLOR: Record<State, string> = { converted: GREEN, lapsed: RED, not_due: AMBER, refunded: MUTE }

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
  const [eras, charges, sheet, overrides] = await Promise.all([
    c.from('payment_eras').select('era, name, starts_on, ends_on, notes').order('era'),
    c.from('stripe_charges').select('amount_cents, refunded, charged_at').limit(20_000),
    c.from('sheet_trials').select('trial_date').not('trial_date', 'is', null).limit(5000),
    c.from('trial_state_overrides').select('charge_id, state').limit(20_000),
  ])
  const ledger: Row[] = []
  for (let o = 0; o < 20_000; o += 1000) {
    const { data, error } = await c
      .from('trial_ledger')
      .select('charge_id, person_key, customer_id, name, stage, trial_at, trial_cents, era, attribution, converted, due, converted_at, converted_cents, gross_cents, lifetime_bundle, trial_refunded, submission_id')
      .order('trial_at', { ascending: false })
      .range(o, o + 999)
    if (error || !data) break
    ledger.push(...(data as Row[]))
    if (data.length < 1000) break
  }

  const chRows = (charges.data ?? []) as { amount_cents: number; refunded: boolean; charged_at: string }[]
  const sheetByMonth = new Map<string, number>()
  for (const r of (sheet.data ?? []) as { trial_date: string }[]) {
    const m = r.trial_date.slice(0, 7)
    sheetByMonth.set(m, (sheetByMonth.get(m) || 0) + 1)
  }
  const overrideBy = new Map<string, string>()
  for (const o of (overrides.data ?? []) as { charge_id: string; state: string }[]) {
    overrideBy.set(o.charge_id, o.state)
  }
  return {
    eras: (eras.data ?? []) as Era[],
    ledger,
    overrideBy,
    grossAll: chRows.filter(r => !r.refunded).reduce((a, r) => a + r.amount_cents, 0) / 100,
    chargeCount: chRows.length,
    firstCharge: chRows.reduce((a, r) => (a && a < r.charged_at ? a : r.charged_at), ''),
    sheetByMonth,
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
  const convCash = L.reduce((a, r) => a + (r.lifetime_bundle ? 4975 : (r.converted_cents ?? 0)), 0) / 100

  const byMonth = new Map<string, { t: number; c: number; due: number; cdue: number; trial: number; conv: number; era: number; q: number }>()
  for (const r of L) {
    const m = r.trial_at.slice(0, 7)
    const e = byMonth.get(m) || { t: 0, c: 0, due: 0, cdue: 0, trial: 0, conv: 0, era: r.era, q: 0 }
    e.t++
    if (r.converted) e.c++
    if (r.due && !r.trial_refunded) { e.due++; if (r.converted) e.cdue++ }
    if (!r.trial_refunded) e.trial += r.trial_cents / 100
    e.conv += (r.lifetime_bundle ? 4975 : (r.converted_cents ?? 0)) / 100
    if (r.attribution !== 'not_quiz') e.q++
    e.era = Math.max(e.era, r.era)
    byMonth.set(m, e)
  }
  const months = Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  const byEra = new Map<number, { t: number; cdue: number; due: number; trial: number; conv: number }>()
  for (const r of L) {
    const e = byEra.get(r.era) || { t: 0, cdue: 0, due: 0, trial: 0, conv: 0 }
    e.t++
    if (r.due && !r.trial_refunded) { e.due++; if (r.converted) e.cdue++ }
    if (!r.trial_refunded) e.trial += r.trial_cents / 100
    e.conv += (r.lifetime_bundle ? 4975 : (r.converted_cents ?? 0)) / 100
    byEra.set(r.era, e)
  }

  const quizEra = L.filter(r => r.era === 4)
  const att = {
    net: quizEra.filter(r => r.attribution === 'quiz_net_new').length,
    existing: quizEra.filter(r => r.attribution === 'quiz_existing').length,
    none: quizEra.filter(r => r.attribution === 'not_quiz').length,
  }

  // ── People table, filtered by the query string ──────────────────────
  const fState = (searchParams.state || '') as State | ''
  const fEra = searchParams.era ? Number(searchParams.era) : 0
  const fAttr = searchParams.attr || ''
  const limit = Math.min(2000, Math.max(50, Number(searchParams.limit) || 200))
  const filtered = L.filter(r =>
    (!fState || stateOf(r) === fState) &&
    (!fEra || r.era === fEra) &&
    (!fAttr || r.attribution === fAttr))
  const people = filtered.slice(0, limit)
  const counts: Record<State, number> = { converted: 0, lapsed: 0, not_due: 0, refunded: 0 }
  for (const r of L) counts[stateOf(r)]++

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { state: fState || undefined, era: fEra ? String(fEra) : undefined, attr: fAttr || undefined, ...patch }
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
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Revenue</h1>
      <p style={{ fontSize: 13.5, color: MUTE, marginTop: 6, maxWidth: 800, lineHeight: 1.55 }}>
        Every charge in the Stripe account since {d.firstCharge.slice(0, 10)}, {d.chargeCount.toLocaleString()} of them,
        turned into one trial ledger. This is the single source of truth: the dashboard, the simulator and the ads page
        all price against it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 13, marginTop: 20 }}>
        <Stat label="Gross, all time" value={usd0(d.grossAll)} sub={`${d.chargeCount.toLocaleString()} charges, refunds excluded`} />
        <Stat label="Trials, all time" value={L.length.toLocaleString()} sub="one per person per purchase" />
        <Stat label="Converted" value={counts.converted.toLocaleString()} sub={`${pct(convDue, due)} of the ${due} that are due`} />
        <Stat label="Trial cash" value={usd0(trialCash)} sub="the $3.99 and $4.99 charges" />
        <Stat label="Conversion cash" value={usd0(convCash)} sub="annuals and lifetimes that followed" />
      </div>

      {/* ERAS */}
      <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 32, color: INK }}>The eras</h2>
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
          </tr>
        </thead>
        <tbody>
          {d.eras.map(e => {
            const s = byEra.get(e.era)
            return (
              <tr key={e.era} style={{ borderBottom: `1px solid ${HAIR}` }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>
                  {e.era}. {e.name}
                  {e.notes && <div style={{ fontSize: 10.5, color: MUTE, fontWeight: 400, marginTop: 2, maxWidth: 430, lineHeight: 1.4 }}>{e.notes}</div>}
                </td>
                <td style={{ ...td, textAlign: 'left', color: MUTE, fontSize: 11.5 }}>{e.starts_on} → {e.ends_on ?? 'now'}</td>
                <td style={td}>{s ? s.t.toLocaleString() : '–'}</td>
                <td style={{ ...td, color: MUTE }}>{s ? s.due.toLocaleString() : '–'}</td>
                <td style={td}>{s ? s.cdue.toLocaleString() : '–'}</td>
                <td style={{ ...td, fontWeight: 800, color: GREEN }}>{s ? pct(s.cdue, s.due) : '–'}</td>
                <td style={td}>{s ? usd0(s.trial) : '–'}</td>
                <td style={td}>{s ? usd0(s.conv) : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5, maxWidth: 800 }}>
        Era 1 has no trials by definition, it predates the product. Rates count only trials whose renewal date has
        passed, so the current month never drags the number down.
      </p>

      {/* QUIZ ERA ATTRIBUTION */}
      <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 32, color: INK }}>Since the quiz launched, who it earned</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 13, marginTop: 10 }}>
        <Stat label="Quiz, new customer" value={att.net.toLocaleString()} sub="never paid before, took the quiz, then bought" />
        <Stat label="Quiz, existing customer" value={att.existing.toLocaleString()} sub="had paid before, quiz earned another trial" />
        <Stat label="Not from the quiz" value={att.none.toLocaleString()} sub="never took it, or took it after paying" />
        <Stat label="Quiz share" value={pct(att.net + att.existing, quizEra.length)} sub={`${att.net + att.existing} of ${quizEra.length} trials since 5 Jul`} />
      </div>

      {/* MONTHLY */}
      <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 32, color: INK }}>Month by month</h2>
      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 4, maxWidth: 860, lineHeight: 1.6 }}>
        One row per month, on the date the TRIAL was bought. <strong style={{ color: INK }}>Trials</strong> is how many
        people started one. <strong style={{ color: INK }}>Due</strong> is how many of those are old enough to have been
        billed the annual (32+ days), and <strong style={{ color: INK }}>Converted / Rate</strong> count only those, which
        is why the newest months show a small denominator rather than a collapse.
        <strong style={{ color: INK }}> Trial cash</strong> is what those trials paid up front;
        <strong style={{ color: INK }}> conversion cash</strong> is what the same people paid when their annual or
        lifetime landed, credited back to the month they started. The last column is your spreadsheet, for checking.
      </p>
      <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${INK}` }}>
            <th style={{ ...th, textAlign: 'left' }}>Month</th>
            <th style={th}>Era</th>
            <th style={th}>Trials</th>
            <th style={th}>From quiz</th>
            <th style={th}>Due</th>
            <th style={th}>Converted</th>
            <th style={th}>Rate</th>
            <th style={th}>Trial cash</th>
            <th style={th}>Conversion cash</th>
            <th style={th}>Your sheet</th>
          </tr>
        </thead>
        <tbody>
          {months.map(([m, s]) => {
            const sh = d.sheetByMonth.get(m)
            const diff = sh === undefined ? null : s.t - sh
            return (
              <tr key={m} style={{ borderBottom: `1px solid ${HAIR}` }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{m}</td>
                <td style={{ ...td, color: MUTE }}>{s.era}</td>
                <td style={{ ...td, fontWeight: 700 }}>{s.t}</td>
                <td style={{ ...td, color: s.q > 0 ? GREEN : MUTE, fontWeight: s.q > 0 ? 700 : 400 }}>{s.q || '–'}</td>
                <td style={{ ...td, color: MUTE }}>{s.due}</td>
                <td style={td}>{s.cdue}</td>
                <td style={{ ...td, fontWeight: 700 }}>{s.due > 0 ? pct(s.cdue, s.due) : '–'}</td>
                <td style={td}>{usd0(s.trial)}</td>
                <td style={td}>{usd0(s.conv)}</td>
                <td style={{ ...td, color: diff === null ? MUTE : diff === 0 ? GREEN : Math.abs(diff) <= 3 ? AMBER : RED }}>
                  {sh === undefined || diff === null ? '–' : `${sh}${diff === 0 ? ' ✓' : ` (${diff > 0 ? '+' : ''}${diff})`}`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* PEOPLE */}
      <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 36, color: INK }}>Person by person</h2>
      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 4, maxWidth: 860, lineHeight: 1.6 }}>
        Every trial ever sold and what became of it. Each trial is in exactly one state, so the four counts below always
        add up to {L.length.toLocaleString()}.
      </p>
      <div className="flex flex-wrap items-center" style={{ gap: 7, marginTop: 12 }}>
        <a href={qs({ state: undefined })} style={chip(!fState)}>All {L.length}</a>
        {(['converted', 'lapsed', 'not_due', 'refunded'] as State[]).map(s => (
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
      </div>

      <div style={{ fontSize: 11.5, color: MUTE, marginTop: 10 }}>
        showing {people.length.toLocaleString()} of {filtered.length.toLocaleString()} matching
        {filtered.length > people.length && (
          <> · <a href={qs({ limit: String(Math.min(2000, limit + 300)) })} style={{ color: INK, fontWeight: 700 }}>show more</a></>
        )}
      </div>

      <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${INK}` }}>
            <th style={{ ...th, textAlign: 'left' }}>Person</th>
            <th style={{ ...th, textAlign: 'left' }}>Trial</th>
            <th style={th}>Paid</th>
            <th style={{ ...th, textAlign: 'left' }}>Source</th>
            <th style={{ ...th, textAlign: 'left' }}>State</th>
            <th style={{ ...th, textAlign: 'left' }}>Stripe</th>
            <th style={{ ...th, textAlign: 'left' }}>Converted on</th>
            <th style={th}>Then paid</th>
            <th style={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {people.map(r => {
            const st = stateOf(r)
            return (
              <tr key={r.charge_id} style={{ borderBottom: `1px solid ${HAIR}` }}>
                <td style={{ ...td, textAlign: 'left' }}>
                  <div style={{ fontWeight: 700 }}>{r.name || r.person_key}</div>
                  {r.name && <div style={{ fontSize: 10.5, color: MUTE }}>{r.person_key}</div>}
                </td>
                <td style={{ ...td, textAlign: 'left', color: MUTE }}>
                  {r.trial_at.slice(0, 10)}
                  <span style={{ marginLeft: 6, fontSize: 10 }}>era {r.era}</span>
                </td>
                <td style={td}>
                  ${(r.trial_cents / 100).toFixed(2)}
                  {r.lifetime_bundle && <span title="Paid $54.74: the $4.99 trial and the $49.75 lifetime in one charge" style={{ marginLeft: 4, color: AMBER, fontWeight: 700 }}>+LT</span>}
                </td>
                <td style={{ ...td, textAlign: 'left', fontSize: 11.5, color: r.attribution === 'not_quiz' ? MUTE : GREEN, fontWeight: r.attribution === 'not_quiz' ? 400 : 700 }}>
                  {ATTR_LABEL[r.attribution] ?? r.attribution}
                </td>
                <td style={{ ...td, textAlign: 'left' }}>
                  <TrialState
                    chargeId={r.charge_id}
                    derived={st}
                    derivedLabel={STATE_LABEL[st]}
                    derivedColor={STATE_COLOR[st]}
                    initial={d!.overrideBy.get(r.charge_id) ?? null}
                  />
                </td>
                <td style={{ ...td, textAlign: 'left', whiteSpace: 'nowrap' }}>
                  {r.customer_id ? (
                    <>
                      <a href={stripeCustomer(r.customer_id)} target="_blank" rel="noopener noreferrer"
                         title={`Open ${r.customer_id} in Stripe`}
                         style={{ fontSize: 11.5, fontWeight: 700, color: INK, textDecoration: 'underline' }}>profile</a>
                      <span style={{ color: HAIR, margin: '0 5px' }}>|</span>
                      <a href={stripeNewSub(r.customer_id)} target="_blank" rel="noopener noreferrer"
                         title="Open Stripe with the create-subscription panel, this customer preselected"
                         style={{ fontSize: 11.5, fontWeight: 700, color: GREEN, textDecoration: 'underline' }}>+ sub</a>
                    </>
                  ) : <span style={{ color: MUTE, fontSize: 11 }}>–</span>}
                </td>
                <td style={{ ...td, textAlign: 'left', color: MUTE }}>{r.converted_at ? r.converted_at.slice(0, 10) : '–'}</td>
                <td style={td}>{r.converted ? `$${((r.lifetime_bundle ? 4975 : (r.converted_cents ?? 0)) / 100).toFixed(2)}` : '–'}</td>
                <td style={{ ...td, fontWeight: 700 }}>${(r.gross_cents / 100).toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
