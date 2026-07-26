import { createClient } from '@supabase/supabase-js'
import { LAUNCH_ISO } from '@/lib/dashboard-queries'
import Simulator from './Simulator.client'

// Revenue simulator — "what is this funnel worth at X% conversion?"
// Seeds every input from the LIVE funnel so the baseline column is real, then
// lets the owner drag each step to a target and see trials, revenue and LTV.
export const dynamic = 'force-dynamic'
export const revalidate = 60

export interface Baseline {
  landing: number
  started: number
  completed: number
  checkout: number
  paid: number
  days: number
  renewalRate: number   // share of trial buyers who carry a subscription
  avgLtv: number        // observed $ per paying person
}

async function loadBaseline(): Promise<Baseline> {
  const fallback: Baseline = { landing: 0, started: 0, completed: 0, checkout: 0, paid: 0, days: 30, renewalRate: 0.25, avgLtv: 34.73 }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return fallback
  try {
    const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    // Unique actors per funnel event, same counting rule as the dashboard.
    const uniq = { landing: new Set<string>(), started: new Set<string>(), checkout: new Set<string>() }
    const PAGE = 1000
    for (let offset = 0; offset < 50_000; offset += PAGE) {
      const { data, error } = await c
        .from('funnel_events')
        .select('event, anon_id, session_id')
        .in('event', ['quiz_view', 'quiz_start', 'checkout_click'])
        .gte('ts', `${LAUNCH_ISO}T00:00:00Z`)
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

    // Submissions in the launch cohort + their payment state.
    const rows: { created_at: string | null; stripe_first_charge_at: string | null; lifetime_value_usd: number | null; stripe_subscriptions: unknown }[] = []
    for (let offset = 0; offset < 50_000; offset += PAGE) {
      const { data, error } = await c
        .from('submissions')
        .select('created_at, stripe_first_charge_at, lifetime_value_usd, stripe_subscriptions')
        .eq('source', 'quiz_v2')
        .is('archived_at', null)
        .range(offset, offset + PAGE - 1)
      if (error || !data) break
      rows.push(...(data as typeof rows))
      if (data.length < PAGE) break
    }

    const completed = rows.length
    const payers = rows.filter(r => r.stripe_first_charge_at && r.created_at && new Date(r.stripe_first_charge_at) > new Date(r.created_at))
    const everPaid = rows.filter(r => r.stripe_first_charge_at)
    const withSub = everPaid.filter(r => {
      const s = r.stripe_subscriptions
      if (!s) return false
      const t = typeof s === 'string' ? s : JSON.stringify(s)
      return t !== '' && t !== '[]' && t !== 'null' && t !== '{}'
    })
    const ltvs = everPaid.map(r => r.lifetime_value_usd || 0).filter(v => v > 0)

    // Observed window length, so we can turn totals into a per-month rate.
    const stamps = rows.map(r => (r.created_at ? new Date(r.created_at).getTime() : 0)).filter(Boolean)
    const spanDays = stamps.length > 1 ? Math.max(1, Math.round((Math.max(...stamps) - Math.min(...stamps)) / 86_400_000)) : 30

    return {
      landing: uniq.landing.size,
      started: uniq.started.size,
      completed,
      checkout: uniq.checkout.size,
      paid: payers.length,
      days: spanDays,
      renewalRate: everPaid.length > 0 ? withSub.length / everPaid.length : 0.25,
      avgLtv: ltvs.length > 0 ? ltvs.reduce((a, b) => a + b, 0) / ltvs.length : 34.73,
    }
  } catch (err) {
    console.error('[simulator] baseline load failed:', err)
    return fallback
  }
}

export default async function SimulatorPage() {
  const baseline = await loadBaseline()
  return <Simulator baseline={baseline} />
}
