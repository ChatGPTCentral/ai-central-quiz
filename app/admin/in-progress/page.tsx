import { listPartials, type PartialRow } from '@/lib/partials'
import DeletePartial from './DeletePartial.client'

export const dynamic = 'force-dynamic'

// Identity + the email step don't count as "progress" past contact capture —
// everything else is a real answered question.
const PROGRESS_KEYS = ['frequency', 'aiTools', 'depth', 'momentum', 'friction', 'workArea', 'jobLevel', 'intent_30d']

function answeredCount(answers: Record<string, unknown> | null): number {
  if (!answers) return 0
  return PROGRESS_KEYS.filter(k => {
    const v = answers[k]
    if (Array.isArray(v)) return v.length > 0
    return v !== undefined && v !== null && String(v).trim() !== ''
  }).length
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default async function InProgressPage() {
  let rows: PartialRow[] = []
  let error: string | null = null
  try {
    rows = await listPartials(500)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  return (
    <div>
      <header style={{ padding: '26px 36px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Records · started but not finished</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>In progress</h1>
        <p className="text-sm text-[#9C9C9C] mt-1">
          People who entered a name + email but haven&apos;t finished the quiz. A row disappears
          here the moment they complete (it becomes a real submission). No enrichment or emails run on these.
          The capture now live-updates as they type and advance; rows saved before Jul 18 were written once,
          early, so their email can be cut short and their progress reads 0.
        </p>
      </header>

      <div className="max-w-5xl mx-auto px-6 sm:px-8 pb-8 pt-1">
      {error && (
        <div className="mb-6 px-4 py-3 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-900">
          <div className="font-semibold mb-1">Couldn&apos;t load in-progress captures.</div>
          <div className="font-mono text-[10px] text-amber-700 break-all">{error}</div>
        </div>
      )}

      <div className="text-xs text-[#9C9C9C] mb-3">{rows.length} in progress</div>

      {rows.length === 0 && !error ? (
        <div className="bg-white border border-dashed border-[#E8E4DF] rounded-xl px-6 py-12 text-center">
          <p className="text-sm text-[#9C9C9C]">No in-progress captures right now. They show up here once someone enters their email and pauses.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#9C9C9C] border-b border-[#E8E4DF]">
                <th className="px-4 py-3 font-bold">Name</th>
                <th className="px-4 py-3 font-bold">Email</th>
                <th className="px-4 py-3 font-bold">Progress</th>
                <th className="px-4 py-3 font-bold">Source</th>
                <th className="px-4 py-3 font-bold">Last activity</th>
                <th className="px-2 py-3 w-10" aria-label="Delete" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const done = answeredCount(r.answers)
                return (
                  <tr key={r.id} className="border-b border-[#F0EDE7] last:border-0 hover:bg-[#FAF8F3]">
                    <td className="px-4 py-3 font-semibold text-[#333333]">{r.name || <span className="text-[#9C9C9C]">—</span>}</td>
                    <td className="px-4 py-3">
                      <a href={`mailto:${r.email}`} className="text-[#046BB1] hover:underline">{r.email}</a>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-20 h-1.5 rounded-full bg-[#EFEAE2] overflow-hidden align-middle">
                          <span className="block h-full rounded-full bg-[#62A758]" style={{ width: `${Math.round((done / PROGRESS_KEYS.length) * 100)}%` }} />
                        </span>
                        <span className="text-[11px] text-[#9C9C9C] tabular-nums">{done}/{PROGRESS_KEYS.length}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#555]">
                      {r.utm_source || <span className="text-[#C9C7BF]">direct</span>}
                      {r.ip_city || r.ip_country ? (
                        <span className="text-[#9C9C9C]"> · {[r.ip_city, r.ip_region, r.ip_country].filter(Boolean).join(', ')}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#9C9C9C]" title={r.updated_at}>{timeAgo(r.updated_at)}</td>
                    <td className="px-2 py-3 text-right">
                      <DeletePartial id={r.id} email={r.email} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  )
}
