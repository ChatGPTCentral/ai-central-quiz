import Link from 'next/link'
import {
  filteredSubmissions,
  facetCounts,
  parseFilters,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import Filters from '../dashboard/Filters.client'
import ViewToggle from './ViewToggle.client'
import SavedSearches from './SavedSearches'
import AdvancedFilter from './AdvancedFilter.client'
import { RightSidebar } from '@/components/admin/AdminShell.client'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 100

const WORK_AREAS = [
  'Marketing', 'Sales', 'Coding', 'Data analytics', 'Finance', 'Legal',
  'Business operations', 'Consulting', 'Project management', 'Writing',
  'Research', 'Government', 'Reading/UX', 'Student',
]

/**
 * Pure-table submissions view. Same `PeopleTable` component as the dashboard
 * (column toggle, photo lightbox, row-level enrich), just without the chart
 * dashboard above it — for when you want max table real-estate.
 */
export default async function SubmissionsListPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const sp = new URLSearchParams(searchParams as Record<string, string>)
  const filters: DashboardFilters = parseFilters(sp)
  const offset = parseInt(searchParams.offset || '0', 10) || 0

  let error: string | null = null
  let items: Awaited<ReturnType<typeof filteredSubmissions>>['items'] = []
  let total = 0

  let sourceFacet: { value: string; count: number }[] = []
  let archetypeFacet: { value: string; count: number }[] = []
  let seniorityFacet: { value: string; count: number }[] = []
  let industryFacet: { value: string; count: number }[] = []
  let countryFacet: { value: string; count: number }[] = []
  let ageFacet: { value: string; count: number }[] = []
  let tierFacet: { value: string; count: number }[] = []
  let beehiivStatusFacet: { value: string; count: number }[] = []
  let sexFacet: { value: string; count: number }[] = []
  let enrichmentFacet: { value: string; count: number }[] = []
  let companySizeFacet: { value: string; count: number }[] = []

  try {
    const [list, fSrc, fA, fS, fI, fC, fAge, fT, fBS, fSex, fES, fCS] = await Promise.all([
      filteredSubmissions(filters, { offset, limit: PAGE_SIZE }),
      facetCounts(filters, 'source'),
      facetCounts(filters, 'archetype'),
      facetCounts(filters, 'seniority'),
      facetCounts(filters, 'company_industry'),
      facetCounts(filters, 'country'),
      facetCounts(filters, 'age_bracket'),
      facetCounts(filters, 'subscription_tier'),
      facetCounts(filters, 'beehiiv_status'),
      facetCounts(filters, 'sex_ai_estimate'),
      facetCounts(filters, 'enrichment_status'),
      facetCounts(filters, 'company_size'),
    ])
    items = list.items
    total = list.total
    sourceFacet = fSrc
    archetypeFacet = fA
    seniorityFacet = fS
    industryFacet = fI
    countryFacet = fC
    ageFacet = fAge
    tierFacet = fT
    beehiivStatusFacet = fBS
    sexFacet = fSex
    enrichmentFacet = fES
    companySizeFacet = fCS
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const exportParams = new URLSearchParams(searchParams as Record<string, string>)
  exportParams.delete('offset')
  const exportHref = `/api/admin/export.csv?${exportParams.toString()}`

  const nextOffset = offset + PAGE_SIZE
  const prevOffset = Math.max(0, offset - PAGE_SIZE)
  const hasNext = nextOffset < total
  const hasPrev = offset > 0
  const linkForPage = (newOffset: number) => {
    const u = new URLSearchParams(searchParams as Record<string, string>)
    u.set('offset', String(newOffset))
    return `/admin/submissions?${u.toString()}`
  }

  return (
    <div className="flex">
      <div className="flex-1 p-8 min-w-0">
        <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-[#333333] mb-1">Submissions</h1>
            <p className="text-sm text-[#9C9C9C]">
              {error ? <span className="text-[#BE3B3B]">Error: {error}</span> :
                <>Showing <strong className="text-[#333333]">{total.toLocaleString()}</strong> submissions</>}
            </p>
          </div>
          <a
            href={exportHref}
            className="px-4 py-2 rounded-lg bg-[#333333] text-[#FFFDFA] text-sm font-bold hover:opacity-90"
          >
            Export filtered CSV
          </a>
        </div>

        {error ? null : (
          <>
            <SavedSearches searchParams={searchParams} />
            <AdvancedFilter />
            <ViewToggle items={items} />
            <div className="flex items-center justify-between px-1 py-3 mt-2">
              <p className="text-xs text-[#9C9C9C]">
                Showing {offset + 1}–{Math.min(offset + items.length, total)} of {total.toLocaleString()}
              </p>
              <div className="flex gap-2">
                {hasPrev && (
                  <Link href={linkForPage(prevOffset)} className="px-3 py-1.5 rounded-md bg-white border border-[#E8E4DF] text-xs font-medium hover:bg-[#FFFDFA]">← Previous</Link>
                )}
                {hasNext && (
                  <Link href={linkForPage(nextOffset)} className="px-3 py-1.5 rounded-md bg-white border border-[#E8E4DF] text-xs font-medium hover:bg-[#FFFDFA]">Next →</Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <RightSidebar title="Filters" storageKey="admin_submissions_filters_collapsed">
        <Filters
          workAreas={WORK_AREAS}
          facets={[
            { key: 'source',           label: 'Source',           values: sourceFacet },
            { key: 'enrichmentStatus', label: 'Enrichment',       values: enrichmentFacet },
            { key: 'subscriptionTier', label: 'Subscription tier', values: tierFacet },
            { key: 'beehiivStatus',    label: 'Beehiiv status',   values: beehiivStatusFacet },
            { key: 'age',              label: 'Age bracket',      values: ageFacet },
            { key: 'sexAiEstimate',    label: 'Sex (AI)',         values: sexFacet },
            { key: 'archetype',        label: 'Archetype',        values: archetypeFacet },
            { key: 'seniority',        label: 'Seniority',        values: seniorityFacet },
            { key: 'industry',         label: 'Industry',         values: industryFacet },
            { key: 'companySize',      label: 'Company size',     values: companySizeFacet },
            { key: 'country',          label: 'Country',          values: countryFacet },
          ]}
        />
      </RightSidebar>
    </div>
  )
}
