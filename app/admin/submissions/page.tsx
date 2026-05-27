import Link from 'next/link'
import {
  filteredSubmissions,
  parseFilters,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import ViewToggle from './ViewToggle.client'
import SavedSearches from './SavedSearches'
import AdvancedFilter from './AdvancedFilter.client'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 100

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

  try {
    const list = await filteredSubmissions(filters, { offset, limit: PAGE_SIZE })
    items = list.items
    total = list.total
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

    </div>
  )
}
