// Monthly cash: what actually happened, then what we expect.
//
// Actuals come from `trial_ledger`, the single source of truth built from
// EVERY Stripe charge since inception (see /admin/revenue). This used to read
// the owner's spreadsheet mirror, which was the best source available until
// the ledger existed and is now strictly worse for two reasons: it is hand
// maintained, so it lags (on 2026-08-10 it stopped at Jul 25 and had no
// August at all, showing 63 July trials against 86 real ones), and it cannot
// see attribution. The ledger is rebuilt from Stripe daily and agrees with the
// sheet within ±3 trials a month wherever the sheet is current.
//
// THE MATURITY PROBLEM, which is the whole reason this file is careful. A trial
// bills its annual a month later, so the most recent months ALWAYS look weak:
// July 2026 reads 27% converted purely because most of those trials are not due
// yet. Treating them as finished would drag every forecast down, permanently,
// and the error would look like a trend. So recent months are marked `partial`
// and are excluded from the rate the forecast is built on.

import { createClient } from '@supabase/supabase-js'

/** Months younger than this cannot have finished converting. */
export const MATURITY_MONTHS = 2

export interface CashPoint {
  /** YYYY-MM */
  month: string
  trials: number
  revenue: number
  /** actual = settled · partial = still filling in · forecast = projected */
  kind: 'actual' | 'partial' | 'forecast'
}

export interface CashflowData {
  points: CashPoint[]
  /** Trial→yearly rate from MATURE months only. */
  maturedRate: number | null
  maturedTrials: number
  /** Trials a month, averaged over the mature window, used for the forecast. */
  runRate: number
  lastActualMonth: string | null
  error?: string
}

function monthsAgo(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function addMonths(iso: string, n: number): string {
  return monthsAgo(iso, -n)
}

export async function getCashflow(opts: {
  trialUsd: number
  annualUsd: number
  year1Pct: number
  forecastMonths?: number
}): Promise<CashflowData> {
  const empty: CashflowData = { points: [], maturedRate: null, maturedTrials: 0, runRate: 0, lastActualMonth: null }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return { ...empty, error: 'Supabase env vars missing' }

  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
  const rows: { trial_at: string; converted: boolean; gross_cents: number; trial_refunded: boolean }[] = []
  for (let o = 0; o < 20_000; o += 1000) {
    const { data, error } = await c
      .from('trial_ledger')
      .select('trial_at, converted, gross_cents, trial_refunded')
      .order('trial_at')
      .range(o, o + 999)
    if (error) return { ...empty, error: error.message }
    if (!data) break
    rows.push(...(data as typeof rows))
    if (data.length < 1000) break
  }
  if (rows.length === 0) {
    return { ...empty, error: 'trial_ledger is empty — run /api/admin/stripe-charges-sync' }
  }

  const byMonth = new Map<string, { trials: number; revenue: number; yearly: number }>()
  for (const r of rows) {
    if (r.trial_refunded) continue   // refunded money was never ours
    const month = r.trial_at.slice(0, 7)
    const e = byMonth.get(month) || { trials: 0, revenue: 0, yearly: 0 }
    e.trials++
    // Real dollars this cohort produced: the trial plus whatever conversion
    // followed it, at whatever price that era charged.
    e.revenue += (r.gross_cents || 0) / 100
    if (r.converted) e.yearly++
    byMonth.set(month, e)
  }

  const months = Array.from(byMonth.keys()).sort()
  const lastMonth = months[months.length - 1]
  const maturityCutoff = monthsAgo(lastMonth, MATURITY_MONTHS - 1)

  const points: CashPoint[] = months.map(m => {
    const e = byMonth.get(m)!
    return { month: m, trials: e.trials, revenue: e.revenue, kind: m >= maturityCutoff ? 'partial' : 'actual' }
  })

  // The rate and the run rate come from MATURE months only.
  let maturedTrials = 0
  let maturedYearly = 0
  let recentTrials = 0
  let recentMonths = 0
  for (const m of months) {
    const e = byMonth.get(m)!
    if (m < maturityCutoff) { maturedTrials += e.trials; maturedYearly += e.yearly }
    // Run rate uses the last six months INCLUDING partial ones, because trial
    // volume is known immediately even when conversion is not.
    if (m >= monthsAgo(lastMonth, 5)) { recentTrials += e.trials; recentMonths++ }
  }
  const maturedRate = maturedTrials > 0 ? maturedYearly / maturedTrials : null
  const runRate = recentMonths > 0 ? Math.round(recentTrials / recentMonths) : 0

  // Forecast: trials at the run rate, each cohort's annual landing a month
  // later at the rate the mature data actually shows, not at an assumption,
  // unless there is no mature data to lean on.
  const rate = maturedRate ?? opts.year1Pct
  const horizon = opts.forecastMonths ?? 12
  for (let i = 1; i <= horizon; i++) {
    points.push({
      month: addMonths(lastMonth, i),
      trials: runRate,
      revenue: runRate * opts.trialUsd + runRate * rate * opts.annualUsd,
      kind: 'forecast',
    })
  }

  return { points, maturedRate, maturedTrials, runRate, lastActualMonth: lastMonth }
}
