import { createClient } from '@supabase/supabase-js'
import {
  filteredSubmissionsAll,
  parseFilters,
  LAUNCH_ISO,
  LAUNCH_LABEL,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import DashboardArea from './DashboardArea.client'
import { type BentoRow, type FunnelEventCounts, type PlacementStat, type SeriesPoint, type Series } from './DashboardBento.client'

export const dynamic = 'force-dynamic'
export const revalidate = 30

type Gran = 'day' | 'week' | 'month'
const GRANS: Gran[] = ['day', 'week', 'month']

// Bucket an ISO timestamp for a given granularity → a sortable key.
//   day → YYYY-MM-DD · week → Monday YYYY-MM-DD · month → YYYY-MM
function bucketKey(iso: string, gran: Gran): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  if (gran === 'month') return d.toISOString().slice(0, 7)
  if (gran === 'week') { const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10) }
  return d.toISOString().slice(0, 10)
}

type EventBuckets = Record<Gran, Record<string, { views: number; starts: number; completed: number; checkout: number }>>

// Funnel + placement events, all in the ONE launch window (since Jul 5), bucketed
// by day / week / month so the progression charts can toggle granularity.
async function loadEventStats(): Promise<{ funnel: FunnelEventCounts; placements: PlacementStat[]; eventBuckets: EventBuckets }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  const emptyBuckets: EventBuckets = { day: {}, week: {}, month: {} }
  const empty = { funnel: { landing: 0, started: 0, checkout: 0 }, placements: [] as PlacementStat[], eventBuckets: emptyBuckets }
  if (!url || !key) return empty
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const uniq = { landing: new Set<string>(), started: new Set<string>(), checkout: new Set<string>() }
  const pl = new Map<string, { views: Set<string>; clicks: Set<string> }>()
  // Per-granularity unique-actor sets: gran → bucket → {views,starts,checkout}.
  const ev: Record<Gran, Map<string, { views: Set<string>; starts: Set<string>; completed: Set<string>; checkout: Set<string> }>> = { day: new Map(), week: new Map(), month: new Map() }
  const bump = (gran: Gran, bucket: string, kind: 'views' | 'starts' | 'completed' | 'checkout', who: string) => {
    if (!bucket) return
    const m = ev[gran]
    const e = m.get(bucket) || { views: new Set<string>(), starts: new Set<string>(), completed: new Set<string>(), checkout: new Set<string>() }
    e[kind].add(who); m.set(bucket, e)
  }
  const PAGE = 1000
  for (let offset = 0; offset < 50_000; offset += PAGE) {
    const { data, error } = await c
      .from('funnel_events')
      .select('event, anon_id, session_id, props, ts')
      .gte('ts', `${LAUNCH_ISO}T00:00:00Z`)
      .order('ts', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error || !data) break
    for (const r of data as { event: string; anon_id: string | null; session_id: string | null; props: Record<string, unknown> | null; ts: string }[]) {
      const who = r.anon_id || r.session_id || `row-${Math.random()}`
      const kind = r.event === 'quiz_view' ? 'views' : r.event === 'quiz_start' ? 'starts' : r.event === 'result_view' ? 'completed' : r.event === 'checkout_click' ? 'checkout' : null
      if (kind) { for (const g of GRANS) bump(g, bucketKey(r.ts, g), kind, who) }
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
  const eventBuckets: EventBuckets = { day: {}, week: {}, month: {} }
  for (const g of GRANS) for (const [bucket, s] of Array.from(ev[g])) eventBuckets[g][bucket] = { views: s.views.size, starts: s.starts.size, completed: s.completed.size, checkout: s.checkout.size }
  return {
    funnel: { landing: uniq.landing.size, started: uniq.started.size, checkout: uniq.checkout.size },
    placements: Array.from(pl.entries())
      .map(([placement, s]) => ({ placement, views: s.views.size, clicks: s.clicks.size }))
      .sort((a, b) => b.views - a.views || b.clicks - a.clicks),
    eventBuckets,
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
  let events = { funnel: { landing: 0, started: 0, checkout: 0 }, placements: [] as PlacementStat[], eventBuckets: { day: {}, week: {}, month: {} } as EventBuckets }
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

  // ── Weekly/daily/monthly progression series (since launch) ──
  // Completions + net-new bucket on the same immutable created_at as the KPIs;
  // event counts come from the one events read. Built for all three
  // granularities so each chart can toggle day / week / month.
  const nowIso = new Date().toISOString()
  const buildSeries = (gran: Gran): SeriesPoint[] => {
    const launchBucket = bucketKey(`${LAUNCH_ISO}T00:00:00Z`, gran)
    const nowBucket = bucketKey(nowIso, gran)
    const subs = new Map<string, { completed: number; netNew: number }>()
    for (const r of allRows) {
      const quizAt = r.createdAt || r.stagedAt
      if (!quizAt) continue
      const b = bucketKey(quizAt, gran)
      if (!b || b < launchBucket) continue
      const e = subs.get(b) || { completed: 0, netNew: 0 }
      e.completed++
      if (r.stripeFirstChargeAt && new Date(r.stripeFirstChargeAt).getTime() > new Date(quizAt).getTime()) e.netNew++
      subs.set(b, e)
    }
    const evb = events.eventBuckets[gran]
    const keys = Array.from(new Set([...Array.from(subs.keys()), ...Object.keys(evb)]))
      .filter(k => k >= launchBucket).sort()
    const cap = gran === 'day' ? 21 : gran === 'week' ? 12 : 12
    return keys.slice(-cap).map(bucket => ({
      bucket,
      views: evb[bucket]?.views || 0,
      starts: evb[bucket]?.starts || 0,
      completed: evb[bucket]?.completed || 0,   // result_view events (coherent, event-based)
      checkout: evb[bucket]?.checkout || 0,
      netNew: subs.get(bucket)?.netNew || 0,     // paid: from the CRM cohort (created_at)
      partial: bucket === nowBucket,
    }))
  }
  const series: Series = { day: buildSeries('day'), week: buildSeries('week'), month: buildSeries('month') }

  const exportParams = new URLSearchParams(searchParams as Record<string, string>)
  exportParams.delete('offset')
  exportParams.set('sample', sample)
  const exportHref = `/api/admin/export.csv?${exportParams.toString()}`

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const rangeLabel = sample === 'launch' ? `${LAUNCH_LABEL} - ${today}` : 'all data'

  return (
    <DashboardArea
      rows={rows}
      sample={sample}
      funnelEvents={events.funnel}
      placements={events.placements}
      series={series}
      exportHref={exportHref}
      launchLabel={LAUNCH_LABEL}
      rangeLabel={rangeLabel}
      searchParamsStr={sp.toString()}
      error={error}
    />
  )
}
