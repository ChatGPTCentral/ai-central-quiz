import { createClient } from '@supabase/supabase-js'
import {
  filteredSubmissionsAll,
  parseFilters,
  LAUNCH_ISO,
  LAUNCH_LABEL,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import AdvancedFilter from '@/app/admin/submissions/AdvancedFilter.client'
import DashboardBento, { type BentoRow, type FunnelEventCounts, type PlacementStat } from './DashboardBento.client'

export const dynamic = 'force-dynamic'
export const revalidate = 30

// Funnel + placement events, all in the ONE launch window (since Jul 5).
// Events only started accruing when tracking shipped, but the window is the
// same as the CRM cohort so every number on this page shares one clock.
async function loadEventStats(): Promise<{ funnel: FunnelEventCounts; placements: PlacementStat[] }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  const empty = { funnel: { landing: 0, started: 0, checkout: 0 }, placements: [] as PlacementStat[] }
  if (!url || !key) return empty
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const uniq = { landing: new Set<string>(), started: new Set<string>(), checkout: new Set<string>() }
  const pl = new Map<string, { views: Set<string>; clicks: Set<string> }>()
  const PAGE = 1000
  for (let offset = 0; offset < 50_000; offset += PAGE) {
    const { data, error } = await c
      .from('funnel_events')
      .select('event, anon_id, session_id, props')
      .gte('ts', `${LAUNCH_ISO}T00:00:00Z`)
      .order('ts', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error || !data) break
    for (const r of data as { event: string; anon_id: string | null; session_id: string | null; props: Record<string, unknown> | null }[]) {
      const who = r.anon_id || r.session_id || `row-${Math.random()}`
      if (r.event === 'quiz_view') uniq.landing.add(who)
      else if (r.event === 'quiz_start') uniq.started.add(who)
      else if (r.event === 'checkout_click') {
        uniq.checkout.add(who)
        const p = typeof r.props?.placement === 'string' ? (r.props.placement as string) : '(unknown)'
        const e = pl.get(p) || { views: new Set<string>(), clicks: new Set<string>() }
        e.clicks.add(who); pl.set(p, e)
      } else if (r.event === 'placement_view') {
        const p = typeof r.props?.placement === 'string' ? (r.props.placement as string) : '(unknown)'
        const e = pl.get(p) || { views: new Set<string>(), clicks: new Set<string>() }
        e.views.add(who); pl.set(p, e)
      }
    }
    if (data.length < PAGE) break
  }
  return {
    funnel: { landing: uniq.landing.size, started: uniq.started.size, checkout: uniq.checkout.size },
    placements: Array.from(pl.entries())
      .map(([placement, s]) => ({ placement, views: s.views.size, clicks: s.clicks.size }))
      .sort((a, b) => b.views - a.views || b.clicks - a.clicks),
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const sp = new URLSearchParams(searchParams as Record<string, string>)
  const filters: DashboardFilters = parseFilters(sp)
  if (!filters.sample) filters.sample = 'launch'
  const sample = filters.sample

  let error: string | null = null
  let allRows: Awaited<ReturnType<typeof filteredSubmissionsAll>> = []
  let events = { funnel: { landing: 0, started: 0, checkout: 0 }, placements: [] as PlacementStat[] }
  try {
    ;[allRows, events] = await Promise.all([filteredSubmissionsAll(filters), loadEventStats()])
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const isUncertain = (v?: string | null) => !v || v.toLowerCase() === 'uncertain'
  const cleanUtm = (s?: string) => (s || '').trim() || null

  // One projection per person. Net-new keys on immutable created_at.
  const rows: BentoRow[] = allRows.map(r => {
    const quizAt = r.createdAt || r.stagedAt
    const netNew = !!(r.stripeFirstChargeAt && quizAt &&
      new Date(r.stripeFirstChargeAt).getTime() > new Date(quizAt).getTime())
    const sexRaw = r.sexAiEstimate
    return {
      stage: r.stage || 'unknown',
      age: isUncertain(r.ageBracket || r.ageAiEstimate) ? null : (r.ageBracket || r.ageAiEstimate)!,
      sex: isUncertain(sexRaw) ? null : sexRaw!.charAt(0).toUpperCase() + sexRaw!.slice(1).toLowerCase(),
      country: r.country || null,
      industry: r.companyIndustry || null,
      role: r.jobTitleStandardized || r.seniority || r.jobLevel || null,
      size: r.companySize || null,
      utmQuiz: cleanUtm(r.utmSource),
      utmNewsletter: cleanUtm(r.utmSourceBeehiiv),
      ltv: r.lifetimeValueUsd || 0,
      netNew,
    }
  })

  const exportParams = new URLSearchParams(searchParams as Record<string, string>)
  exportParams.delete('offset')
  exportParams.set('sample', sample)
  const exportHref = `/api/admin/export.csv?${exportParams.toString()}`
  const sampleHref = (s: 'launch' | 'all') => {
    const p = new URLSearchParams(searchParams as Record<string, string>)
    p.set('sample', s)
    p.delete('offset')
    return `/admin/dashboard?${p.toString()}`
  }

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const rangeLabel = sample === 'launch' ? `${LAUNCH_LABEL} - ${today}` : 'all data'

  return (
    <div>
      <header className="flex items-end justify-between flex-wrap" style={{ padding: '26px 36px 20px', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>
            Overview · {sample === 'launch' ? 'launch cohort' : 'all records'} · {rangeLabel} · one datasource for every number
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Dashboard</h1>
          {error && <p style={{ fontSize: 12.5, color: '#BE3B3B', marginTop: 6 }}>Error: {error}</p>}
        </div>
        <div className="flex items-center" style={{ gap: 10 }}>
          <div className="inline-flex" style={{ border: '1px solid #333333' }}>
            <a href={sampleHref('launch')} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, background: sample === 'launch' ? '#333333' : 'transparent', color: sample === 'launch' ? '#FFFDFA' : '#6B6B6B' }}>Launch ({LAUNCH_LABEL}+)</a>
            <a href={sampleHref('all')} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, borderLeft: '1px solid #333333', background: sample === 'all' ? '#333333' : 'transparent', color: sample === 'all' ? '#FFFDFA' : '#6B6B6B' }}>All data</a>
          </div>
          <a href={exportHref} style={{ padding: '8px 15px', fontSize: 12, fontWeight: 700, background: '#333333', color: '#FFFDFA' }}>Export csv ↗</a>
        </div>
      </header>

      {/* Main bento + segment-builder rail */}
      <div className="flex items-start" style={{ padding: '0 36px 44px', gap: 20 }}>
        <div className="flex-1 min-w-0">
          <DashboardBento rows={rows} sample={sample} funnelEvents={events.funnel} placements={events.placements} />
        </div>
        <aside className="shrink-0" style={{ width: 300 }}>
          <div style={{ border: '1px solid #333333', background: '#FFFFFF' }}>
            <div style={{ padding: '10px 14px', background: '#FEF7E7', borderBottom: '1px solid #333333', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#1A1A1A' }}>
              Segments · build &amp; save
            </div>
            <div style={{ padding: '10px 12px' }}>
              <AdvancedFilter />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
