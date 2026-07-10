import Link from 'next/link'
import {
  filteredSubmissions,
  parseFilters,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import PeopleTableAttio from './PeopleTableAttio.client'
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
        <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black text-[#333333] flex items-center gap-2.5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333333" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              People
            </h1>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9C9C9C', border: '1px solid #E8E4DF', borderRadius: 4, padding: '2px 8px', background: '#FAF7F1' }}>
              {error ? 'error' : `${total.toLocaleString()} records`}
            </span>
          </div>
          <a
            href={exportHref}
            className="px-4 py-2 rounded-md bg-[#333333] text-[#FFFDFA] text-[13px] font-bold hover:opacity-90 inline-flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Export CSV
          </a>
        </div>

        {error ? <p className="text-sm text-[#BE3B3B]">Error: {error}</p> : (
          <>
            <SavedSearches searchParams={searchParams} />
            <AdvancedFilter />
            <PeopleTableAttio items={items} total={total} />
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
