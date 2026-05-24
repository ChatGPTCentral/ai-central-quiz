import { allSubmissionsForExport } from '@/lib/kv'
import { ARCHETYPES, type ArchetypeKey } from '@/lib/archetypes'

export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000

export default async function StatsPage() {
  let items: Awaited<ReturnType<typeof allSubmissionsForExport>> = []
  let error: string | null = null
  try {
    items = await allSubmissionsForExport()
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-black text-black mb-1">Stats</h1>
        <p className="text-sm text-red-600 mt-2">Storage error: {error}</p>
      </div>
    )
  }

  const now = Date.now()
  const today = items.filter(s => now - s.ts < DAY).length
  const week = items.filter(s => now - s.ts < 7 * DAY).length
  const total = items.length

  // Archetype distribution
  const counts: Record<ArchetypeKey, number> = {
    executive_strategist: 0, growth_operator: 0, technical_pioneer: 0, practical_learner: 0,
  }
  items.forEach(s => { if (counts[s.archetype] !== undefined) counts[s.archetype]++ })

  // Score histogram (bins of 10)
  const bins = Array(10).fill(0)
  items.forEach(s => {
    const v = s.score ?? 0
    const idx = Math.min(9, Math.floor(v / 10))
    bins[idx]++
  })
  const maxBin = Math.max(...bins, 1)

  // Apollo hit rate
  const apolloHits = items.filter(s => s.apolloData?.success).length
  const apolloRate = total > 0 ? Math.round((apolloHits / total) * 100) : 0

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-black text-black mb-1">Stats</h1>
      <p className="text-sm text-gray-500 mb-8">{total.toLocaleString()} submissions in storage</p>

      {/* Top counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Today', value: today },
          { label: '7 days', value: week },
          { label: 'All time', value: total },
          { label: 'Apollo hit rate', value: `${apolloRate}%` },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#E0E0E0] rounded-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">{s.label}</p>
            <p className="text-3xl font-black text-black tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Archetype distribution */}
      <section className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Archetype distribution</h2>
        <div className="space-y-3">
          {(Object.entries(counts) as [ArchetypeKey, number][]).map(([key, n]) => {
            const pct = total > 0 ? (n / total) * 100 : 0
            const arc = ARCHETYPES[key]
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5 text-sm">
                  <span className="font-medium text-black">{arc.label}</span>
                  <span className="tabular-nums text-gray-500">{n} ({pct.toFixed(1)}%)</span>
                </div>
                <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: arc.accentColor }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Score histogram */}
      <section className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Score distribution</h2>
        <div className="flex items-end gap-2 h-40 mb-2">
          {bins.map((count, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end">
              <span className="text-[10px] text-gray-400 mb-1 tabular-nums">{count > 0 ? count : ''}</span>
              <div
                className="w-full bg-black rounded-t transition-all"
                style={{ height: `${(count / maxBin) * 100}%`, minHeight: count > 0 ? 4 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 text-[10px] text-gray-400">
          {bins.map((_, i) => (
            <div key={i} className="flex-1 text-center tabular-nums">{i * 10}-{i * 10 + 9}</div>
          ))}
        </div>
      </section>
    </div>
  )
}
