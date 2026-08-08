import { createClient } from '@supabase/supabase-js'
import { LAUNCH_ISO } from '@/lib/dashboard-queries'
import Simulator from './Simulator.client'

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
    const withSub = paid.filter(r => {
      const s = r.stripe_subscriptions
      if (!s) return false
      const t = typeof s === 'string' ? s : JSON.stringify(s)
      return t !== '' && t !== '[]' && t !== 'null' && t !== '{}'
    })

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
      renewalRate: paid.length > 0 ? withSub.length / paid.length : 0.25,
    }
  } catch (err) {
    console.error('[simulator] baseline load failed:', err)
    return fallback
  }
}

export default async function SimulatorPage() {
  return <Simulator baseline={await loadBaseline()} />
}
