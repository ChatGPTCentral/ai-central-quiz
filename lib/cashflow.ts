// Monthly cash: what actually happened, then what we expect.
//
// Actuals come from the owner's trials sheet, mirrored in sheet_trials and
// refreshed daily. That sheet is the source of truth for trials sold, and it
// disagrees with every internal estimate we had: it reports 54.3% of 694 trials
// converting to yearly, against 37% from our Stripe-derived RPC and a 66.7%
// I measured on twelve trials. The sheet wins on sample size and on the fact
// that the owner reconciles it against invoices.
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
  const { data, error } = await c
    .from('sheet_trials')
    .select('trial_date, status, total')
    .not('trial_date', 'is', null)
  if (error) return { ...empty, error: error.message }

  const rows = (data || []) as { trial_date: string; status: string | null; total: number | null }[]
  if (rows.length === 0) {
    return { ...empty, error: 'sheet_trials is empty — run /api/admin/sheet-sync' }
  }

  const byMonth = new Map<string, { trials: number; revenue: number; yearly: number }>()
  for (const r of rows) {
    const month = r.trial_date.slice(0, 7)
    const e = byMonth.get(month) || { trials: 0, revenue: 0, yearly: 0 }
    e.trials++
    e.revenue += Number(r.total) || 0
    // The two statuses that mean "paid the annual". Recovered counts: the money
    // arrived, and excluding it would understate what a trial is worth.
    if (r.status === 'Yearly Subscriber' || r.status === 'Yearly Subscriber / Recovered') e.yearly++
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
