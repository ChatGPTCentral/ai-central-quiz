import {
  filteredSubmissionsAll,
  parseFilters,
  LAUNCH_LABEL,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import AdvancedFilter from '@/app/admin/submissions/AdvancedFilter.client'
import DashboardBento, { type BentoRow } from './DashboardBento.client'

export const dynamic = 'force-dynamic'
// Edge-cache for 30s — the dataset doesn't change between rapid navigations
// and the dashboard's full-scan aggregations are the slowest page in the app.
// Filter changes hit a different URL so they're not cached together.
export const revalidate = 30

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const sp = new URLSearchParams(searchParams as Record<string, string>)
  const filters: DashboardFilters = parseFilters(sp)
  // The dashboard defaults to the post-launch quiz sample so the legacy
  // Fillout + Stripe-import rows don't drown out the real funnel data.
  if (!filters.sample) filters.sample = 'launch'
  const sample = filters.sample

  let error: string | null = null
  let allRows: Awaited<ReturnType<typeof filteredSubmissionsAll>> = []
  try {
    allRows = await filteredSubmissionsAll(filters)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const isUncertain = (v?: string | null) => !v || v.toLowerCase() === 'uncertain'
  const cleanUtm = (s?: string) => (s || '').trim() || null

  // Minimal projection for the client bento — one small object per person.
  // Net-new keys on immutable created_at (staged_at gets re-stamped by
  // enrichment, which used to hide conversions).
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

  // Preserve filters for CSV export (carry the active sample scope through).
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
            Overview · {sample === 'launch' ? 'launch cohort' : 'all records'} · {rangeLabel}
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

      <div style={{ padding: '0 36px 44px' }}>
        {/* Advanced filter — same specs/UX as on /admin/submissions */}
        <div style={{ marginBottom: 14 }}>
          <AdvancedFilter />
        </div>
        <DashboardBento rows={rows} sample={sample} />
      </div>
    </div>
  )
}
