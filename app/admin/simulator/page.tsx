import { createClient } from '@supabase/supabase-js'
import { LAUNCH_ISO } from '@/lib/dashboard-queries'
import Workbench from './Workbench.client'
import { getCashflow } from '@/lib/cashflow'
import { readLtvModel } from '@/lib/ltv-settings'

// Revenue simulator — the live funnel as the baseline, then drag each step rate
// to see what it is worth.
//
// The baseline MUST come from one coherent cohort. The first version filtered
// events by date but counted every quiz_v2 submission ever (back to 2023), so
// completed > started and a step rate could exceed 100%. Now every node is
// counted over the same window: from the first tracked event onward.
export const dynamic = 'force-dynamic'
export const revalidate = 60

export interface Baseline {
  landing: number
  started: number
  completed: number
  checkout: number
  paid: number
  revenue: number
  days: number
  windowStart: string
  /** Share of trial buyers who carry a subscription — the trial→annual rate. */
  renewalRate: number
}

async function loadBaseline(): Promise<Baseline> {
  const fallback: Baseline = { landing: 0, started: 0, completed: 0, checkout: 0, paid: 0, revenue: 0, days: 30, windowStart: '', renewalRate: 0.25 }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return fallback

  try {
    const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })

    // Same window as the dashboard (LAUNCH_ISO), so at default settings this
    // page reproduces the dashboard's "All" column exactly. If the two ever
    // disagree, one of them is wrong — and that is the whole point.
    const t0 = `${LAUNCH_ISO}T00:00:00Z`

    const uniq = { landing: new Set<string>(), started: new Set<string>(), checkout: new Set<string>() }
    const PAGE = 1000
    for (let offset = 0; offset < 80_000; offset += PAGE) {
      const { data, error } = await c
        .from('funnel_events')
        .select('event, anon_id, session_id')
        .in('event', ['quiz_view', 'quiz_start', 'checkout_click'])
        .gte('ts', t0)
        .range(offset, offset + PAGE - 1)
      if (error || !data) break
      for (const r of data as { event: string; anon_id: string | null; session_id: string | null }[]) {
        const who = r.anon_id || r.session_id
        if (!who) continue
        if (r.event === 'quiz_view') uniq.landing.add(who)
        else if (r.event === 'quiz_start') uniq.started.add(who)
        else uniq.checkout.add(who)
      }
      if (data.length < PAGE) break
    }

    // Submissions over the SAME window, real rows only.
    const subs: { created_at: string | null; stripe_first_charge_at: string | null; stripe_subscriptions: unknown; lifetime_value_usd: number | null }[] = []
    for (let offset = 0; offset < 80_000; offset += PAGE) {
      const { data, error } = await c
        .from('submissions')
        .select('created_at, stripe_first_charge_at, stripe_subscriptions, lifetime_value_usd')
        .eq('source', 'quiz_v2')
        .is('archived_at', null)
        .not('is_test', 'is', true)
        .gte('created_at', t0)
        .range(offset, offset + PAGE - 1)
      if (error || !data) break
      subs.push(...(data as typeof subs))
      if (data.length < PAGE) break
    }

    const paid = subs.filter(r => r.stripe_first_charge_at && r.created_at && new Date(r.stripe_first_charge_at) > new Date(r.created_at))

    // Trial to annual, from the SAME maturity-aware source /admin/ads uses.
    //
    // This used to be `withSub / paid`: the share of payers holding a
    // subscription, with no maturity filter at all. A trial bills the annual a
    // month later, so every trial younger than that counted as a FAILURE and
    // the rate was pushed toward zero by our own recent growth. The faster we
    // sold, the worse this looked. It read 25% while the maturity-aware
    // measure read 37%.
    //
    // Two pages disagreeing about the same business fact is the exact class of
    // bug that cost most of 2026-08-09, so it now reads one shared function.
    const { data: rr } = await c.rpc('trial_to_annual_rate')
    const measuredRenewal: number | null =
      rr && rr.length && rr[0].rate != null ? Number(rr[0].rate) : null

    const days = Math.max(1, Math.round((Date.now() - new Date(t0).getTime()) / 86_400_000))

    return {
      landing: uniq.landing.size,
      started: uniq.started.size,
      completed: subs.length,
      checkout: uniq.checkout.size,
      paid: paid.length,
      revenue: paid.reduce((a, r) => a + (r.lifetime_value_usd || 0), 0),
      days,
      windowStart: t0.slice(0, 10),
      renewalRate: measuredRenewal ?? 0.25,
    }
  } catch (err) {
    console.error('[simulator] baseline load failed:', err)
    return fallback
  }
}

export default async function SimulatorPage() {
  const baseline = await loadBaseline()

  // Server supplies FACTS only: sheet actuals, the measured mature rate, the
  // run rate, and the saved model. The forecast itself is computed in the
  // client Workbench, because it has to react live to the model fields and to
  // the funnel sliders — the disconnect between those three panels was the
  // owner's complaint about this page.
  const ltv = await readLtvModel()
  const cash = await getCashflow({
    trialUsd: ltv.trialUsd,
    annualUsd: ltv.annualUsd,
    year1Pct: ltv.year1Pct,
    forecastMonths: 0,
  })

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Simulator</h1>
        <p className="text-sm text-[#9C9C9C]">
          One model, three views: what a customer is worth, what the year looks like, and what the
          funnel produces. Change any panel and the others follow. The Ads page prices against the
          same saved model.
        </p>
      </div>
      <Workbench
        baseline={baseline}
        actuals={cash.points}
        maturedRate={cash.maturedRate}
        maturedTrials={cash.maturedTrials}
        runRate={cash.runRate}
        lastActualMonth={cash.lastActualMonth}
        cashflowError={cash.error}
        initialModel={ltv}
      />
    </div>
  )
}
