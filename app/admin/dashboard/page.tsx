import {
  filteredSubmissionsAll,
  facetCounts,
  parseFilters,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import { continentOf } from '@/lib/geo'
import { PALETTE } from '@/lib/palette'
import { COMPANY_SIZE_ORDER } from '@/lib/enrichment/standardize'
import StatCard from '@/components/admin/StatCard'
import HorizontalBarChart from '@/components/admin/HorizontalBarChart'
import VerticalBarChart from '@/components/admin/VerticalBarChart'
import CountryChart from '@/components/admin/CountryChart'
import LifetimeValueChart from '@/components/admin/LifetimeValueChart'
import RoleChart from '@/components/admin/RoleChart.client'
import AgeChart from '@/components/admin/AgeChart.client'
import AdvancedFilter from '@/app/admin/submissions/AdvancedFilter.client'
import Filters from './Filters.client'
import { RightSidebar } from '@/components/admin/AdminShell.client'

export const dynamic = 'force-dynamic'
// Edge-cache for 30s — the dataset doesn't change between rapid navigations
// and the dashboard's full-scan aggregations are the slowest page in the app.
// Filter changes hit a different URL so they're not cached together.
export const revalidate = 30

const WORK_AREAS = [
  'Marketing', 'Sales', 'Coding', 'Data analytics', 'Finance', 'Legal',
  'Business operations', 'Consulting', 'Project management', 'Writing',
  'Research', 'Government', 'Reading/UX', 'Student',
]

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const sp = new URLSearchParams(searchParams as Record<string, string>)
  const filters: DashboardFilters = parseFilters(sp)

  let error: string | null = null
  let allRows: Awaited<ReturnType<typeof filteredSubmissionsAll>> = []

  // Sidebar facet groups (live counts based on current filters)
  let sourceFacet: { value: string; count: number }[] = []
  let archetypeFacet: { value: string; count: number }[] = []
  let seniorityFacet: { value: string; count: number }[] = []
  let industryFacet: { value: string; count: number }[] = []
  let countryFacet: { value: string; count: number }[] = []
  let ageFacet: { value: string; count: number }[] = []

  try {
    const [all, fSrc, fA, fS, fI, fC, fAge] = await Promise.all([
      filteredSubmissionsAll(filters),
      facetCounts(filters, 'source'),
      facetCounts(filters, 'archetype'),
      facetCounts(filters, 'seniority'),
      facetCounts(filters, 'company_industry'),
      facetCounts(filters, 'country'),
      facetCounts(filters, 'age_bracket'),
    ])
    allRows = all
    sourceFacet = fSrc
    archetypeFacet = fA
    seniorityFacet = fS
    industryFacet = fI
    countryFacet = fC
    ageFacet = fAge
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  // ── Aggregate from filtered rows for the visualizations ──────────
  const uniqueEmails = new Set(allRows.map(r => r.email.toLowerCase())).size
  const uniqueCompanies = new Set(
    allRows.map(r => (r.companyName || '').toLowerCase().trim()).filter(Boolean),
  ).size
  const uniqueRoles = new Set(
    allRows.map(r => (r.jobTitle || r.jobLevel || '').trim()).filter(Boolean),
  ).size

  function countBy<T>(rows: T[], pick: (r: T) => string | undefined | null): { label: string; value: number }[] {
    const m = new Map<string, number>()
    for (const r of rows) {
      const v = pick(r)
      if (!v) continue
      m.set(v, (m.get(v) || 0) + 1)
    }
    return Array.from(m.entries()).map(([label, value]) => ({ label, value }))
  }

  // Exclude AI "uncertain" classifications from the chart — they're noise.
  const isUncertain = (v?: string | null) => !v || v.toLowerCase() === 'uncertain'

  const utmData      = countBy(allRows, r => (r.utmSource || '').trim() || 'Direct / unknown')
  const tierData     = countBy(allRows, r => r.subscriptionTier)

  // Products bought (Stripe) — aggregate by stripe product_id, label with
  // canonical product name. Skips lines without a productId (trial-period
  // rows, manual adjustments, etc. — they're noise, not real products).
  const productAgg = new Map<string, { name: string; customers: number }>()
  for (const r of allRows) {
    if (!r.stripeProducts?.length) continue
    const seenInRow = new Set<string>()
    for (const p of r.stripeProducts) {
      if (!p.productId) continue
      if (seenInRow.has(p.productId)) continue  // count one customer per product, not one per purchase
      seenInRow.add(p.productId)
      const existing = productAgg.get(p.productId) || { name: p.name || p.productId, customers: 0 }
      existing.customers += 1
      if (p.name) existing.name = p.name
      productAgg.set(p.productId, existing)
    }
  }
  const productData = Array.from(productAgg.values())
    .map(p => ({ label: p.name, value: p.customers }))
    .sort((a, b) => b.value - a.value)
  const ageData      = countBy(allRows, r => {
    const v = r.ageBracket || r.ageAiEstimate
    return isUncertain(v) ? undefined : v
  })
  const sexData      = countBy(allRows, r => {
    const v = r.sexAiEstimate
    if (isUncertain(v)) return undefined
    return v!.charAt(0).toUpperCase() + v!.slice(1).toLowerCase()
  })
  const industryData = countBy(allRows, r => r.companyIndustry)
  const sizeData     = countBy(allRows, r => r.companySize)

  // Fixed ordering for ordinal axes (uncertain dropped)
  const AGE_ORDER = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+']
  const SEX_ORDER = ['Male', 'Female']

  // N = total observations counted per chart (after filtering uncertain/empty)
  const sumOf = (arr: { value: number }[]) => arr.reduce((a, b) => a + b.value, 0)
  const N = {
    age:      sumOf(ageData),
    sex:      sumOf(sexData),
    industry: sumOf(industryData),
    size:     sumOf(sizeData),
    utm:      sumOf(utmData),
    geo:      allRows.filter(r => r.country).length,
    tier:     sumOf(tierData),
    products: sumOf(productData),
  }
  const n = (k: number) => `N = ${k.toLocaleString()}`

  // Country chart needs continent + region for grouping
  const geoRows = allRows.map(r => ({
    country: r.country,
    region: r.region,
    continent: continentOf(r.country),
  }))

  // Preserve filters for CSV export
  const exportParams = new URLSearchParams(searchParams as Record<string, string>)
  exportParams.delete('offset')
  const exportHref = `/api/admin/export.csv?${exportParams.toString()}`

  return (
    <div className="flex">
      {/* Main content */}
      <div className="flex-1 p-8 min-w-0">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-[#333333] mb-1">Dashboard</h1>
            <p className="text-sm text-[#9C9C9C]">
              {error ? <span className="text-[#BE3B3B]">Error: {error}</span> :
                <>Charting <strong className="text-[#333333]">{allRows.length.toLocaleString()}</strong> records · <a href="/admin/submissions" className="text-[#046BB1] hover:underline">view table →</a></>}
            </p>
          </div>
          <a
            href={exportHref}
            className="px-4 py-2 rounded-lg bg-[#333333] text-[#FFFDFA] text-sm font-bold hover:opacity-90"
          >
            Export filtered CSV
          </a>
        </div>

        {!error && (
          <>
            {/* Summary stats */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total records"     value={allRows.length}   accent="jetBlack" />
              <StatCard label="Unique emails"     value={uniqueEmails}     accent="azul" />
              <StatCard label="Unique companies"  value={uniqueCompanies}  accent="viridian" />
              <StatCard label="Unique roles"      value={uniqueRoles}      accent="fulvous" />
            </section>

            {/* Advanced filter — same UX as on /admin/submissions */}
            <AdvancedFilter />

            {/* ── MONEY / REVENUE ZONE (top of dashboard) ── */}
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mt-6 mb-2">Revenue</h2>
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <LifetimeValueChart values={allRows.map(r => r.lifetimeValueUsd)} />
              <div className="flex flex-col gap-4">
                <HorizontalBarChart
                  title="Products bought"
                  subtitle={n(N.products) + ' paying customers'}
                  data={productData}
                  maxRows={8}
                  uniformColor={PALETTE.viridian}
                  expandable
                />
                <HorizontalBarChart
                  title="Subscription tier"
                  subtitle={n(N.tier)}
                  data={tierData}
                  maxRows={8}
                  uniformColor={PALETTE.marianBlue}
                />
              </div>
            </section>

            {/* ── DEMOGRAPHICS ZONE ── */}
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mt-6 mb-2">People</h2>
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
              <AgeChart rows={allRows.map(r => ({
                ageBracket: r.ageBracket,
                ageAiEstimate: r.ageAiEstimate,
              }))} />
              <VerticalBarChart
                title="Sex"
                subtitle={n(N.sex)}
                data={sexData}
                orderedLabels={SEX_ORDER}
                uniformColor={PALETTE.rosePompadour}
                showCurves={false}
              />
              <CountryChart rows={geoRows} subtitle={n(N.geo)} />

              <HorizontalBarChart
                title="Industry"
                subtitle={n(N.industry)}
                data={industryData}
                maxRows={8}
                uniformColor={PALETTE.asparagus}
                expandable
              />
              <RoleChart rows={allRows.map(r => ({
                jobTitle: r.jobTitle,
                jobTitleStandardized: r.jobTitleStandardized,
                jobLevel: r.jobLevel,
                seniority: r.seniority,
              }))} />
              <VerticalBarChart
                title="Company size"
                subtitle={n(N.size)}
                data={sizeData}
                orderedLabels={[...COMPANY_SIZE_ORDER]}
                uniformColor={PALETTE.xanthous}
              />
            </section>

            {/* ── ACQUISITION ZONE ── */}
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mt-6 mb-2">Acquisition</h2>
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <HorizontalBarChart
                title="UTM source"
                subtitle={n(N.utm)}
                data={utmData}
                maxRows={10}
                uniformColor={PALETTE.fulvous}
              />
            </section>
          </>
        )}

      </div>

      {/* Right collapsible filter sidebar */}
      <RightSidebar title="Filters">
        <Filters
          workAreas={WORK_AREAS}
          facets={[
            { key: 'source',    label: 'Source',     values: sourceFacet },
            { key: 'age',       label: 'Age bracket', values: ageFacet },
            { key: 'archetype', label: 'Archetype',  values: archetypeFacet },
            { key: 'seniority', label: 'Seniority',  values: seniorityFacet },
            { key: 'industry',  label: 'Industry',   values: industryFacet },
            { key: 'country',   label: 'Country',    values: countryFacet },
          ]}
        />
      </RightSidebar>
    </div>
  )
}
