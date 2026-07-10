import Link from 'next/link'
import { filteredSubmissionsAll, parseFilters, type DashboardFilters } from '@/lib/dashboard-queries'
import { STAGES, stageDef, personaDef } from '@/lib/segmentation-v2'
import type { StoredSubmission } from '@/lib/kv'
import Avatar from '@/components/admin/Avatar.client'

export const dynamic = 'force-dynamic'

// ── Board by adoption stage (design "Admin section redesign" 1e) ──
// Launch cohort grouped into ladder columns (Unknown → Builder), each a
// stack of person cards. Read-only v1 (drag-to-restage is a follow-up —
// stage is editable inline on the person record today).

// Column order: Unknown first, then the ladder up to Builder.
const COLUMN_ORDER = [
  STAGES.find(s => s.key === 'unknown')!,
  ...STAGES.filter(s => s.key !== 'unknown'),
]

function Card({ r }: { r: StoredSubmission }) {
  const pd = r.persona ? personaDef(r.persona) : null
  const paid = (r.lifetimeValueUsd ?? 0) > 0
  return (
    <Link
      href={`/admin/submissions/${r.id}`}
      className="block"
      style={{ background: '#FFFFFF', border: '1px solid #E8E4DF', borderRadius: 7, padding: '10px 11px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar name={r.name} email={r.email} photoUrl={r.photoUrl} size={24} />
        <span className="min-w-0 flex-1">
          <span className="block truncate" style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A' }}>{r.name || r.email}</span>
          {r.companyName && <span className="block truncate" style={{ fontSize: 11, color: '#9C9C9C' }}>{r.companyName}</span>}
        </span>
        {paid && <span className="shrink-0" style={{ fontSize: 11, fontWeight: 700, color: '#2E7D32', fontVariantNumeric: 'tabular-nums' }}>${Math.round(r.lifetimeValueUsd!)}</span>}
      </div>
      {pd && pd.key !== 'unknown' && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span style={{ width: 6, height: 6, borderRadius: 2, background: pd.color }} />
          <span style={{ fontSize: 10.5, color: '#9C9C9C' }}>{pd.label}</span>
        </div>
      )}
    </Link>
  )
}

export default async function BoardPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const sp = new URLSearchParams(searchParams as Record<string, string>)
  const filters: DashboardFilters = parseFilters(sp)
  if (!filters.sample) filters.sample = 'launch'

  let rows: StoredSubmission[] = []
  let error: string | null = null
  try {
    rows = await filteredSubmissionsAll(filters)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const byStage = new Map<string, StoredSubmission[]>()
  for (const r of rows) {
    const k = r.stage || 'unknown'
    const arr = byStage.get(k) || []
    arr.push(r)
    byStage.set(k, arr)
  }
  const sampleAll = filters.sample === 'all'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black text-[#333333]">Board</h1>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#9C9C9C', border: '1px solid #E8E4DF', borderRadius: 4, padding: '2px 8px', background: '#FAF7F1' }}>
            {rows.length.toLocaleString()} {sampleAll ? 'records' : 'launch people'}
          </span>
        </div>
        <div className="inline-flex rounded-lg border border-[#E8E4DF] overflow-hidden text-sm font-bold">
          <Link href="/admin/board?sample=launch" className={`px-4 py-2 ${!sampleAll ? 'bg-[#333333] text-[#FFFDFA]' : 'bg-white text-[#9C9C9C]'}`}>Launch</Link>
          <Link href="/admin/board?sample=all" className={`px-4 py-2 border-l border-[#E8E4DF] ${sampleAll ? 'bg-[#333333] text-[#FFFDFA]' : 'bg-white text-[#9C9C9C]'}`}>All data</Link>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-[#BE3B3B]">Error: {error}</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'thin' }}>
          {COLUMN_ORDER.map(def => {
            const people = byStage.get(def.key) || []
            return (
              <div key={def.key} className="shrink-0" style={{ width: 244 }}>
                {/* Column header */}
                <div className="flex items-center gap-2 mb-2.5" style={{ padding: '0 2px' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: def.color }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1A1A' }}>{def.label}</span>
                  <span className="ml-auto" style={{ fontSize: 11.5, fontWeight: 600, color: '#9C9C9C', fontVariantNumeric: 'tabular-nums' }}>{people.length}</span>
                </div>
                {/* Cards */}
                <div className="flex flex-col gap-2 rounded-lg" style={{ background: '#FAF7F1', border: '1px solid #EFEAE1', padding: 8, minHeight: 120 }}>
                  {people.length === 0 ? (
                    <p style={{ fontSize: 11.5, color: '#C4BDB2', textAlign: 'center', padding: '16px 0' }}>Empty</p>
                  ) : people.slice(0, 200).map(r => <Card key={r.id} r={r} />)}
                  {people.length > 200 && <p style={{ fontSize: 11, color: '#9C9C9C', textAlign: 'center' }}>+{people.length - 200} more</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
