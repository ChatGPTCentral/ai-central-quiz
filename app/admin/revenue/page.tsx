// Revenue — the money, and only the money.
//
// Restructured 2026-08-16 on the owner's spec: the old page stacked five
// sections and three jobs; now each job has a screen:
//
//   /admin/revenue            the money   (this page)
//   /admin/revenue/trials     every trial and its status, plus the retry
//                             queue as a toggle (merged in 2026-08-23)
//
// THE RULE THIS PAGE LIVES BY: the matrix and this page are the same thing
// displayed two ways. Every dollar here comes from the SAME classified
// entries the dashboard's revenue rows sum — same six kinds, same clocks —
// and the table proves itself on screen: the kind columns sum to the row
// total, the rows sum to the account, and the identity line at the bottom
// compares that sum to raw Stripe to the penny, going red if they ever part.
//
//   stripe_charges  every charge since 2023-11-11, refunds flagged
//        ↓
//   payment_eras    the pricing eras, as data you can correct
//        ↓
//   trial_ledger    one row per trial: who, which era, did the quiz earn it,
//                   did it convert, what it earned
//        ↓
//   classifyLedger  every charge into exactly one of six kinds

import RevenueChart, { type ChartPoint } from '@/components/admin/RevenueChart.client'
import SyncCharges from '@/components/admin/SyncCharges.client'
import LedgerHealth from '@/components/admin/LedgerHealth'
import type { CheckResult } from '@/lib/ledger-invariants'
import { fmtDay } from '@/lib/dates'
import { loadRevenueData } from '@/lib/revenue-shared'
import { classifyLedger, keptUsdCents, eurAvgRate } from '@/lib/trial-entries'

export const dynamic = 'force-dynamic'
export const revalidate = 60

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const LATTE = '#FEF7E7'
const GREEN = '#2E7D32'
const RED = '#B00020'

const usd = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const usd0 = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`
const eur = (n: number) => `${n < 0 ? '−' : ''}€${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '–')

const navChip: React.CSSProperties = {
  padding: '6px 12px', fontSize: 11.5, fontWeight: 700,
  border: '2px solid #1A1A1A', background: '#FFFDFA', color: '#1A1A1A', textDecoration: 'none',
}

/** The matrix's six kinds, grouped the way its ALL REVENUE breakdown reads. */
const KIND_COLS = [
  { key: 'trialsQuiz', label: 'Trials · quiz', kinds: ['net', 'quizExisting'] },
  { key: 'trialsNot', label: 'Trials · not quiz', kinds: ['notQuiz'] },
  { key: 'wonQuiz', label: 'Won yearly · quiz', kinds: ['annualQuiz'] },
  { key: 'wonNot', label: 'Won yearly · no quiz', kinds: ['annualNotQuiz'] },
  { key: 'other', label: 'Other revenue', kinds: ['other'] },
] as const

export default async function RevenuePage() {
  let d: Awaited<ReturnType<typeof loadRevenueData>> | null = null
  let entries: { kind: string; at: string; usd: number }[] = []
  let err: string | null = null
  try {
    d = await loadRevenueData()
    // The SAME classification the matrix sums, over the whole account
    // history — computed from the SAME single read as every other number on
    // this page. Never a second fetch: the hourly sync's chunked upsert can
    // land between two reads of the charge table, and the identity would
    // then compare two different worlds (a red $15.41 no data state could
    // explain, 2026-08-17). Epoch start makes every era in-window.
    entries = classifyLedger(d.ledger, d.chargeRows, '2023-01-01').entries as { kind: string; at: string; usd: number }[]
  } catch (e) { err = e instanceof Error ? e.message : String(e) }
  if (err || !d) {
    return <div style={{ padding: 26 }}><h1 style={{ fontWeight: 800, fontSize: 24 }}>Revenue</h1><p style={{ color: RED }}>{err}</p></div>
  }

  const L = d.ledger

  // ── The unified month table: counts from the ledger, money from the
  //    classified entries, each on the clock the matrix uses. ──
  const kindOf = (k: string) => KIND_COLS.find(c => (c.kinds as readonly string[]).includes(k))?.key ?? 'other'
  type MonthMoney = { trialsQuiz: number; trialsNot: number; wonQuiz: number; wonNot: number; other: number; total: number }
  const emptyMoney = (): MonthMoney => ({ trialsQuiz: 0, trialsNot: 0, wonQuiz: 0, wonNot: 0, other: 0, total: 0 })
  const moneyByMonth = new Map<string, MonthMoney>()
  for (const e of entries) {
    const m = e.at.slice(0, 7)
    const row = moneyByMonth.get(m) ?? emptyMoney()
    row[kindOf(e.kind) as keyof MonthMoney] += e.usd
    row.total += e.usd
    moneyByMonth.set(m, row)
  }

  const countByMonth = new Map<string, { t: number; q: number; due: number; cdue: number; era: number }>()
  for (const r of L) {
    const m = r.trial_at.slice(0, 7)
    const e = countByMonth.get(m) || { t: 0, q: 0, due: 0, cdue: 0, era: r.era }
    e.t++
    if (r.attribution !== 'not_quiz') e.q++
    if (r.due && !r.trial_refunded) { e.due++; if (r.converted) e.cdue++ }
    e.era = Math.max(e.era, r.era)
    countByMonth.set(m, e)
  }

  const allMonths = Array.from(new Set([...Array.from(moneyByMonth.keys()), ...Array.from(countByMonth.keys())])).sort().reverse()
  const grand = emptyMoney()
  for (const m of Array.from(moneyByMonth.values())) {
    grand.trialsQuiz += m.trialsQuiz; grand.trialsNot += m.trialsNot; grand.wonQuiz += m.wonQuiz
    grand.wonNot += m.wonNot; grand.other += m.other; grand.total += m.total
  }
  // THE IDENTITY, on screen: classified total vs NET (gross of successful
  // charges minus refunds minus lost disputes), to the penny. Net is the
  // owner's display rule for every money number (2026-08-17).
  const identityOk = Math.abs(grand.total - d.netAll) < 0.005

  // Chart: per-month NET money from the SAME entries (penny-perfect by
  // construction), trials count and era from the ledger.
  const chartPoints: ChartPoint[] = allMonths.slice().reverse().map(m => ({
    month: m,
    trials: countByMonth.get(m)?.t ?? 0,
    money: moneyByMonth.get(m)?.total ?? 0,
    era: countByMonth.get(m)?.era ?? d!.eras.find(e => m >= e.starts_on.slice(0, 7) && (!e.ends_on || m <= e.ends_on.slice(0, 7)))?.era ?? 1,
  }))
  const chartEras = d.eras.map(e => ({ era: e.era, code: e.code, name: e.name, color: e.color }))

  // Era summary: counts from the ledger, all-revenue per era from charges —
  // kept-money NET per charge through the ONE formula (rule 6, final form),
  // so the era column sums to the identity line's number.
  const eraAvgRate = eurAvgRate(d.chargeRows)
  const eraCash = new Map<number, number>()
  for (const ch of d.chargeRows) {
    const day = ch.charged_at.slice(0, 10)
    const e = d.eras.find(x => day >= x.starts_on && (!x.ends_on || day <= x.ends_on))
    if (e) eraCash.set(e.era, (eraCash.get(e.era) ?? 0) + keptUsdCents(ch, eraAvgRate) / 100)
  }
  const byEra = new Map<number, { t: number; cdue: number; due: number }>()
  for (const r of L) {
    const e = byEra.get(r.era) || { t: 0, cdue: 0, due: 0 }
    e.t++
    if (r.due && !r.trial_refunded) { e.due++; if (r.converted) e.cdue++ }
    byEra.set(r.era, e)
  }

  const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, textAlign: 'right', padding: '7px 8px' }
  const td: React.CSSProperties = { fontSize: 12, padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 1240 }}>
      <LedgerHealth checks={d.checks as CheckResult[] | null} ranAt={d.checksRanAt} />
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Revenue</h1>
      <p style={{ fontSize: 13.5, color: MUTE, marginTop: 6, maxWidth: 820, lineHeight: 1.55 }}>
        Every charge since {fmtDay(d.firstCharge)}, {d.chargeCount.toLocaleString()} of them, classified into the same six
        kinds the dashboard&rsquo;s matrix sums — same source, same clocks, two displays. <strong style={{ color: INK }}>All
        money is NET, meaning what the bank actually kept</strong>: refunds, lost disputes, money withheld on open disputes,
        and Stripe&rsquo;s own fees are already out of every figure, per charge, and the euro-settled era is counted at each
        day&rsquo;s dollar rate — the same net your Stripe home screen calls Net volume. Quiz-earned
        money sits in the month of the QUIZ; everything else in the month of the charge.
      </p>
      <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 12 }}>
        <SyncCharges lastSyncedAt={d.lastSyncedAt} />
        <a href="/admin/revenue/trials" style={navChip}>Every trial &amp; status →</a>
        <a href="/admin/revenue/trials?nonpaying=1#top" style={navChip}>Trial recovery →</a>
      </div>

      {/* THE CHART FIRST: net money per month from the classified entries, so
          the bars are the table are the matrix, to the penny. */}
      <div style={{ marginTop: 22 }}>
        <RevenueChart points={chartPoints} eras={chartEras} />
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 26, color: INK }}>The same months, as money that sums</h2>
      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 4, maxWidth: 880, lineHeight: 1.6 }}>
        Five money columns, one per kind, and they PARTITION the total: every dollar the account actually kept
        is in exactly one, so each row sums across and the bottom row sums down to the account. Counts are trial counts
        (quiz-earned per the ledger); Due and Converted count only trials whose bill date has passed; Sheet is your
        spreadsheet&rsquo;s count of that month, for reconciliation.
      </p>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${INK}` }}>
              <th style={{ ...th, textAlign: 'left' }}>Month</th>
              <th style={th}>Trials</th>
              <th style={th}>Quiz</th>
              <th style={th}>Sheet</th>
              <th style={th}>Due</th>
              <th style={th}>Conv</th>
              <th style={th}>Rate</th>
              {KIND_COLS.map(c => <th key={c.key} style={th}>{c.label}</th>)}
              <th style={{ ...th, borderLeft: `2px solid ${INK}` }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {allMonths.map(m => {
              const money = moneyByMonth.get(m) ?? emptyMoney()
              const cnt = countByMonth.get(m)
              return (
                <tr key={m} style={{ borderBottom: `1px solid ${HAIR}` }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{m}</td>
                  <td style={td}>{cnt ? cnt.t : '–'}</td>
                  <td style={{ ...td, color: GREEN, fontWeight: 700 }}>{cnt ? cnt.q : '–'}</td>
                  <td style={{ ...td, color: MUTE }}>{d!.sheetByMonth.get(m) ?? '–'}</td>
                  <td style={{ ...td, color: MUTE }}>{cnt ? cnt.due : '–'}</td>
                  <td style={td}>{cnt ? cnt.cdue : '–'}</td>
                  <td style={{ ...td, fontWeight: 800, color: GREEN }}>{cnt ? pct(cnt.cdue, cnt.due) : '–'}</td>
                  {KIND_COLS.map(c => {
                    const v = money[c.key as keyof MonthMoney]
                    return <td key={c.key} style={{ ...td, color: v ? INK : MUTE }}>{v ? usd(v) : '–'}</td>
                  })}
                  <td style={{ ...td, fontWeight: 800, borderLeft: `2px solid ${INK}` }}>{usd(money.total)}</td>
                </tr>
              )
            })}
            <tr style={{ borderTop: `2px solid ${INK}`, background: LATTE }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>ALL TIME</td>
              <td style={{ ...td, fontWeight: 800 }}>{L.length.toLocaleString()}</td>
              <td style={{ ...td, fontWeight: 800, color: GREEN }}>{L.filter(r => r.attribution !== 'not_quiz').length.toLocaleString()}</td>
              <td style={{ ...td, color: MUTE, fontWeight: 800 }}>{Array.from(d.sheetByMonth.values()).reduce((a, b) => a + b, 0).toLocaleString()}</td>
              <td style={{ ...td, color: MUTE, fontWeight: 800 }}>{L.filter(r => r.due && !r.trial_refunded).length.toLocaleString()}</td>
              <td style={{ ...td, fontWeight: 800 }}>{L.filter(r => r.converted && r.due).length.toLocaleString()}</td>
              <td style={{ ...td, fontWeight: 800, color: GREEN }}>{pct(L.filter(r => r.converted && r.due).length, L.filter(r => r.due && !r.trial_refunded).length)}</td>
              {KIND_COLS.map(c => <td key={c.key} style={{ ...td, fontWeight: 800 }}>{usd(grand[c.key as keyof MonthMoney])}</td>)}
              <td style={{ ...td, fontWeight: 800, borderLeft: `2px solid ${INK}` }}>{usd(grand.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* THE PENNY PROOF. If this line is ever red, the classification and
          the raw account disagree and NOTHING above it should be trusted
          until the hourly ledger checks say why. NET here is the owner's
          final definition (2026-08-17, "net is 77K not 83"): money the bank
          kept, after refunds, disputes, AND Stripe's cut — the Stripe home
          screen's own Net volume. No gross figure renders here. */}
      <p style={{ fontSize: 11.5, marginTop: 8, fontWeight: 700, color: identityOk ? GREEN : RED }}>
        {identityOk
          ? `✓ Penny-perfect NET: the five kinds sum to ${usd(grand.total)} — money actually kept, after refunds, disputes, and Stripe's cut: the same net your Stripe home screen shows.`
          : `✕ IDENTITY BROKEN: kinds sum to ${usd(grand.total)} but the mirror's kept-money total is ${usd(d.netAll)} — trust nothing above until the ledger checks explain the difference.`}
      </p>
      {/* THE BRIDGE to the number the owner can see in Stripe itself: his
          home screen's "Net volume" additionally subtracts Stripe's fees and
          settles part of the history in euros. Both are true; this block
          converts one into the other so they can be compared without a
          conversation (owner, 2026-08-16: "you say 83k but Stripe says Net
          volume $77,464.56"). NET-FIRST, NO GROSS FIGURES: every chain here
          starts from a net number (owner, 2026-08-17, twice). */}
      {(() => {
        // Every subtraction the kept-money net is made of, itemized so the
        // headline can be checked without any pre-fee or gross figure ever
        // rendering (owner, 2026-08-17: "net is 77K not 83").
        const refundsAll = d!.chargeRows.reduce((a, c) => a + (c.amount_refunded_cents || 0), 0) / 100
        const lostAll = d!.chargeRows.reduce((a, c) => a + (c.dispute_lost_cents || 0), 0) / 100
        const hasDetail = d!.chargeRows.some(c => (c.amount_refunded_cents || 0) > 0 || c.disputed)
        if (!hasDetail) {
          return (
            <p style={{ fontSize: 11, color: MUTE, marginTop: 4, lineHeight: 1.5 }}>
              Refund, dispute, and fee detail lands with the next hourly sync (:20); the itemized subtractions render here
              from then on.
            </p>
          )
        }
        return (
          <div style={{ fontSize: 11, color: MUTE, marginTop: 4, lineHeight: 1.6 }}>
            <p>
              <strong style={{ color: INK }}>Already out of every number above:</strong>{' '}
              {usd(refundsAll)} refunds and {usd(lostAll)} lost disputes
              {d!.takeHome && (
                <>
                  ; Stripe&rsquo;s processing fees ({usd(d!.takeHome.usdFees)} dollar-side, {eur(d!.takeHome.eurFees)} on the
                  euro era) and dispute fees ({usd(d!.takeHome.usdDisputeFees)} and {eur(d!.takeHome.eurDisputeFees)})
                  {d!.takeHome.usdOpen + d!.takeHome.eurOpenEur >= 0.005 && (
                    <>; {usd(d!.takeHome.usdOpen)} withheld on disputes still open, returned here the day they are won</>
                  )}
                  ; and the euro-settled era ({d!.takeHome.eurCharges.toLocaleString()} PayPal and invoice charges through
                  Jul 2025) counted at each charge&rsquo;s own day rate, not face value
                </>
              )}
              . Nothing on this page is gross, and nothing is before Stripe&rsquo;s cut. A lost dispute counts BELOW zero
              (fee plus the $15 penalty, on top of the clawed-back money) and a refunded charge&rsquo;s kept fee counts
              against us — exactly as Stripe counts them.
            </p>
            <p style={{ marginTop: 2 }}>
              {d!.takeHome ? (
                <>
                  <strong style={{ color: INK }}>Check it against Stripe:</strong> the home screen&rsquo;s{' '}
                  <strong style={{ color: INK }}>Net volume</strong> is this same figure and sits within a few dozen dollars of{' '}
                  <strong style={{ color: INK }}>{usd(d!.netAll)}</strong> — the only difference left is that Stripe rounds
                  each day&rsquo;s euro rate its own way.
                </>
              ) : (
                <>Until the fee sync lands, the figures above are net of refunds and disputes only.</>
              )}
            </p>
          </div>
        )
      })()}

      <h2 style={{ fontSize: 15, fontWeight: 800, marginTop: 34, color: INK }}>The eras</h2>
      <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${INK}` }}>
            <th style={{ ...th, textAlign: 'left' }}>Era</th>
            <th style={{ ...th, textAlign: 'left' }}>Dates</th>
            <th style={th}>Trials</th>
            <th style={th}>Due</th>
            <th style={th}>Converted</th>
            <th style={th}>Rate</th>
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
                <td style={{ ...td, fontWeight: 800 }}>{usd0(eraCash.get(e.era) ?? 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5, maxWidth: 800 }}>
        Eras 1a and 1b predate the trial product, so their trials are empty by definition and their money lives in
        Other revenue above. Rates count only trials whose renewal date has passed.
      </p>
    </div>
  )
}
