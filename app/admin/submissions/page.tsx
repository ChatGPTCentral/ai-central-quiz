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
 * People (redesign 2c): hard-edge records table with view tabs, saved
 * filters, the ladder-mix strip and a column chooser. Same queries and
 * filter engine as before — this page only restyles and re-arranges.
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

  const q = searchParams.q || ''

  return (
    <div>
      <header className="flex items-end justify-between flex-wrap" style={{ padding: '26px 36px 18px', borderBottom: '2px solid #333333', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Records · quiz, Stripe and Beehiiv merged</div>
          <div className="flex items-baseline" style={{ gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>People</h1>
            <span style={{ border: '1px solid #333333', padding: '2px 9px', fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{total.toLocaleString()}</span>
          </div>
          {error && <p style={{ fontSize: 12.5, color: '#BE3B3B', marginTop: 6 }}>Error: {error}</p>}
        </div>
        <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
          <form action="/admin/submissions" method="GET" className="inline-flex items-center" style={{ width: 230, height: 34, border: '1px solid #333333', background: '#FFFFFF', padding: '0 10px', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9C9C9C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, email, company"
              style={{ fontSize: 12, color: '#1A1A1A', outline: 'none', border: 'none', background: 'transparent', width: '100%' }}
            />
          </form>
          <a href={exportHref} style={{ padding: '8px 15px', fontSize: 12, fontWeight: 700, background: '#333333', color: '#FFFDFA' }}>Export csv ↗</a>
        </div>
      </header>

      <div className="flex items-start" style={{ padding: '24px 36px 96px', gap: 20 }}>
        {!error && (
          <>
            <div className="flex-1 min-w-0">
              <SavedSearches searchParams={searchParams} />
              <PeopleTableAttio
                items={items}
                total={total}
                offset={offset}
                pageSize={PAGE_SIZE}
              />
            </div>
            {/* Same segment builder as the dashboard: build a segment, save it */}
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
          </>
        )}
      </div>
    </div>
  )
}
