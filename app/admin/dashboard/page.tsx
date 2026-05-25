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
import Filters from './Filters.client'
import { RightSidebar } from '@/components/admin/AdminShell.client'

export const dynamic = 'force-dynamic'

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

  const ageData      = countBy(allRows, r => r.ageBracket)
  const sexData      = countBy(allRows, r => r.sexAiEstimate)
  const roleData     = countBy(allRows, r => r.jobTitleStandardized || r.jobTitle || r.jobLevel)
  const industryData = countBy(allRows, r => r.companyIndustry)
  const sizeData     = countBy(allRows, r => r.companySize)

  // Fixed ordering for ordinal axes
  const AGE_ORDER = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+']
  const SEX_ORDER = ['male', 'female', 'uncertain']

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
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard label="Total records"     value={allRows.length}   accent="jetBlack" />
              <StatCard label="Unique emails"     value={uniqueEmails}     accent="azul" />
              <StatCard label="Unique companies"  value={uniqueCompanies}  accent="viridian" />
              <StatCard label="Unique roles"      value={uniqueRoles}      accent="fulvous" />
            </section>

            {/* Charts grid — row 1: Age · Sex · Country | row 2: Industry · Role · Company size */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
              <VerticalBarChart
                title="Age"
                subtitle="x = age bracket · y = count · density (red) vs normal (grey dashed)"
                data={ageData}
                orderedLabels={AGE_ORDER}
                uniformColor={PALETTE.marianBlue}
              />
              <VerticalBarChart
                title="Sex"
                subtitle="AI-estimated from profile photo"
                data={sexData}
                orderedLabels={SEX_ORDER}
                uniformColor={PALETTE.rosePompadour}
              />
              <CountryChart rows={geoRows} />

              <HorizontalBarChart
                title="Industry"
                subtitle="Self-reported + Apollo-enriched"
                data={industryData}
                maxRows={8}
                uniformColor={PALETTE.asparagus}
              />
              <HorizontalBarChart
                title="Role"
                subtitle="Standardized job titles"
                data={roleData}
                maxRows={8}
                uniformColor={PALETTE.azul}
              />
              <VerticalBarChart
                title="Company size"
                subtitle="x = # employees (small → big) · y = count · density (red) vs normal (grey dashed)"
                data={sizeData}
                orderedLabels={[...COMPANY_SIZE_ORDER]}
                uniformColor={PALETTE.xanthous}
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
