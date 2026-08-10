// Revenue — the whole Stripe account, since inception, from charges.
//
// This page exists because every revenue number we had was assembled from a
// different place: per-person LTV aggregates on one screen, a spreadsheet on
// another, ad-hoc SQL on a third. They disagreed, and every disagreement cost
// an evening. So there is now ONE chain, and this page is its face:
//
//   stripe_charges  every charge since 2023-11-11, refunds flagged
//        ↓
//   payment_eras    the five pricing eras, as data you can correct
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
//
// Attribution (quiz-era only): net-new = never paid before, existing = had
// paid before but the quiz earned this trial, not-quiz = never took it.

import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 60

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const LATTE = '#FEF7E7'
const GREEN = '#2E7D32'

interface Era { era: number; name: string; starts_on: string; ends_on: string | null; notes: string | null }
interface Row {
  trial_at: string; trial_cents: number; era: number; attribution: string
  converted: boolean; due: boolean; converted_cents: number | null
  gross_cents: number; lifetime_bundle: boolean; trial_refunded: boolean
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
  const [eras, ledger, charges, sheet] = await Promise.all([
    c.from('payment_eras').select('era, name, starts_on, ends_on, notes').order('era'),
    (async () => {
      const out: Row[] = []
      for (let o = 0; o < 20_000; o += 1000) {
        const { data, error } = await c
          .from('trial_ledger')
          .select('trial_at, trial_cents, era, attribution, converted, due, converted_cents, gross_cents, lifetime_bundle, trial_refunded')
          .order('trial_at')
          .range(o, o + 999)
        if (error || !data) break
        out.push(...(data as Row[]))
        if (data.length < 1000) break
      }
      return out
    })(),
    c.from('stripe_charges').select('amount_cents, refunded, charged_at').limit(20_000),
    c.from('sheet_trials').select('trial_date').not('trial_date', 'is', null).limit(5000),
  ])

  const chRows = (charges.data ?? []) as { amount_cents: number; refunded: boolean; charged_at: string }[]
  const grossAll = chRows.filter(r => !r.refunded).reduce((a, r) => a + r.amount_cents, 0) / 100
  const sheetByMonth = new Map<string, number>()
  for (const r of (sheet.data ?? []) as { trial_date: string }[]) {
    const m = r.trial_date.slice(0, 7)
    sheetByMonth.set(m, (sheetByMonth.get(m) || 0) + 1)
  }

  return {
    eras: (eras.data ?? []) as Era[],
    ledger,
    grossAll,
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

export default async function RevenuePage() {
  let d: Awaited<ReturnType<typeof load>> | null = null
  let err: string | null = null
  try { d = await load() } catch (e) { err = e instanceof Error ? e.message : String(e) }
  if (err || !d) {
    return <div style={{ padding: 26 }}><h1 style={{ fontWeight: 800, fontSize: 24 }}>Revenue</h1><p style={{ color: '#B00' }}>{err}</p></div>
  }

  const L = d.ledger
  const trials = L.length
  const converted = L.filter(r => r.converted).length
  const due = L.filter(r => r.due).length
  const convDue = L.filter(r => r.converted && r.due).length
  const trialCash = L.reduce((a, r) => a + (r.trial_refunded ? 0 : r.trial_cents), 0) / 100
  const convCash = L.reduce((a, r) => a + (r.converted_cents ?? 0), 0) / 100

  // Monthly series, newest first.
  const byMonth = new Map<string, { t: number; c: number; due: number; cdue: number; gross: number; era: number; q: number }>()
  for (const r of L) {
    const m = r.trial_at.slice(0, 7)
    const e = byMonth.get(m) || { t: 0, c: 0, due: 0, cdue: 0, gross: 0, era: r.era, q: 0 }
    e.t++
    if (r.converted) e.c++
    if (r.due) e.due++
    if (r.due && r.converted) e.cdue++
    e.gross += r.gross_cents / 100
    if (r.attribution !== 'not_quiz') e.q++
    e.era = Math.max(e.era, r.era)
    byMonth.set(m, e)
  }
  const months = Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  const byEra = new Map<number, { t: number; cdue: number; due: number; gross: number }>()
  for (const r of L) {
    const e = byEra.get(r.era) || { t: 0, cdue: 0, due: 0, gross: 0 }
    e.t++
    if (r.due) { e.due++; if (r.converted) e.cdue++ }
    e.gross += r.gross_cents / 100
    byEra.set(r.era, e)
  }

  const quizEra = L.filter(r => r.era === 5)
  const att = {
    net: quizEra.filter(r => r.attribution === 'quiz_net_new').length,
    existing: quizEra.filter(r => r.attribution === 'quiz_existing').length,
    none: quizEra.filter(r => r.attribution === 'not_quiz').length,
  }

  const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, textAlign: 'right', padding: '7px 8px' }
  const td: React.CSSProperties = { fontSize: 12, padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 1180 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Revenue</h1>
      <p style={{ fontSize: 13.5, color: MUTE, marginTop: 6, maxWidth: 780, lineHeight: 1.55 }}>
        Every charge in the Stripe account since {d.firstCharge.slice(0, 10)}, {d.chargeCount.toLocaleString()} of them,
        turned into one trial ledger. This is the single source of truth: the dashboard, the simulator and the ads page
        all price against it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 13, marginTop: 20 }}>
        <Stat label="Gross, all time" value={usd0(d.grossAll)} sub={`${d.chargeCount.toLocaleString()} charges, refunds excluded`} />
        <Stat label="Trials, all time" value={trials.toLocaleString()} sub="one per person per purchase" />
        <Stat label="Converted" value={converted.toLocaleString()} sub={`${pct(convDue, due)} of the ${due} that are due`} />
        <Stat label="Trial cash" value={usd0(trialCash)} sub="the $3.99 and $4.99 charges" />
        <Stat label="Conversion cash" value={usd0(convCash)} sub="annuals and lifetimes that followed" />
      </div>

      {/* ERAS */}
      <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 32, color: INK }}>The five eras</h2>
      <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${INK}` }}>
            <th style={{ ...th, textAlign: 'left' }}>Era</th>
            <th style={{ ...th, textAlign: 'left' }}>Dates</th>
            <th style={th}>Trials</th>
            <th style={th}>Due</th>
            <th style={th}>Converted</th>
            <th style={th}>Rate</th>
            <th style={th}>Gross</th>
          </tr>
        </thead>
        <tbody>
          {d.eras.map(e => {
            const s = byEra.get(e.era)
            return (
              <tr key={e.era} style={{ borderBottom: `1px solid ${HAIR}` }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>
                  {e.era}. {e.name}
                  {e.notes && <div style={{ fontSize: 10.5, color: MUTE, fontWeight: 400, marginTop: 2, maxWidth: 460, lineHeight: 1.4 }}>{e.notes}</div>}
                </td>
                <td style={{ ...td, textAlign: 'left', color: MUTE, fontSize: 11.5 }}>
                  {e.starts_on} → {e.ends_on ?? 'now'}
                </td>
                <td style={td}>{s ? s.t.toLocaleString() : '–'}</td>
                <td style={{ ...td, color: MUTE }}>{s ? s.due.toLocaleString() : '–'}</td>
                <td style={td}>{s ? s.cdue.toLocaleString() : '–'}</td>
                <td style={{ ...td, fontWeight: 800, color: GREEN }}>{s ? pct(s.cdue, s.due) : '–'}</td>
                <td style={td}>{s ? usd0(s.gross) : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5, maxWidth: 780 }}>
        Era 1 has no trials by definition, it predates the product. Rates count only trials whose renewal date has
        passed, so the current month never drags the number down.
      </p>

      {/* QUIZ ERA ATTRIBUTION */}
      <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 32, color: INK }}>Era 5, who the quiz earned</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 13, marginTop: 10 }}>
        <Stat label="Quiz, net-new" value={att.net.toLocaleString()} sub="never paid before, took the quiz, then bought" />
        <Stat label="Quiz, existing customer" value={att.existing.toLocaleString()} sub="had paid before, quiz earned another trial" />
        <Stat label="Not from the quiz" value={att.none.toLocaleString()} sub="never took it, or took it after paying" />
        <Stat label="Quiz share" value={pct(att.net + att.existing, quizEra.length)} sub={`${att.net + att.existing} of ${quizEra.length} trials since the quiz launched`} />
      </div>

      {/* MONTHLY */}
      <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 32, color: INK }}>Month by month</h2>
      <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${INK}` }}>
            <th style={{ ...th, textAlign: 'left' }}>Month</th>
            <th style={th}>Era</th>
            <th style={th}>Trials</th>
            <th style={th}>Quiz</th>
            <th style={th}>Due</th>
            <th style={th}>Converted</th>
            <th style={th}>Rate</th>
            <th style={th}>Gross</th>
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
                <td style={td}>{usd0(s.gross)}</td>
                <td style={{ ...td, color: diff === null ? MUTE : diff === 0 ? GREEN : Math.abs(diff) <= 3 ? '#B26A00' : '#B00' }}>
                  {sh === undefined || diff === null ? '–' : `${sh}${diff === 0 ? ' ✓' : ` (${diff > 0 ? '+' : ''}${diff})`}`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5, maxWidth: 800 }}>
        The last column is your trials spreadsheet, for reconciliation. Green means identical, amber means within three,
        red means look. Months before Aug 2025 differ because the sheet was not yet being kept; months after its last
        row differ because the sheet stops there.
      </p>
    </div>
  )
}
