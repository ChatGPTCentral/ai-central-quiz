import { allSubmissionsForExport } from '@/lib/kv'
import { ARCHETYPES, type ArchetypeKey } from '@/lib/archetypes'
import { STAGES, PERSONAS } from '@/lib/segmentation-v2'

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
  const archCounts: Record<ArchetypeKey, number> = {
    executive_strategist: 0, growth_operator: 0, technical_pioneer: 0, practical_learner: 0,
  }
  items.forEach(s => { if (archCounts[s.archetype] !== undefined) archCounts[s.archetype]++ })

  // Score histogram (bins of 10)
  const bins = Array(10).fill(0)
  items.forEach(s => {
    const v = s.score ?? 0
    const idx = Math.min(9, Math.floor(v / 10))
    bins[idx]++
  })
  const maxBin = Math.max(...bins, 1)

  // Multi-provider enrichment coverage (NOT just Apollo)
  const hasLinkedin = items.filter(s => !!s.linkedinUrl).length
  const hasPhoto    = items.filter(s => !!s.photoUrl).length
  const hasCompany  = items.filter(s => !!s.companyName).length
  const hasBeehiiv  = items.filter(s => !!s.beehiivStatus).length
  const hasStripe   = items.filter(s => !!s.stripeCustomerId).length
  const hasFullV2   = items.filter(s => s.frequencyScore != null && s.depthScore != null && s.breadthScore != null).length
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-black text-black mb-1">Stats</h1>
      <p className="text-sm text-gray-500 mb-8">{total.toLocaleString()} submissions in storage</p>

      {/* Top counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Today',                  value: today },
          { label: '7 days',                 value: week },
          { label: 'All time',               value: total },
          { label: 'Survey v2 complete',     value: `${pct(hasFullV2)}%`, hint: `${hasFullV2.toLocaleString()} rows` },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#E0E0E0] rounded-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">{s.label}</p>
            <p className="text-3xl font-black text-black tabular-nums">{s.value}</p>
            {s.hint && <p className="text-[10px] text-gray-400 mt-1 tabular-nums">{s.hint}</p>}
          </div>
        ))}
      </div>

      {/* Stage ladder distribution (v2) */}
      <section className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">📈 AI adoption stage</h2>
        <p className="text-[11px] text-gray-400 mb-4">Where each person sits on the 6-rung ladder</p>
        <div className="space-y-3">
          {STAGES.map(def => {
            const n = items.filter(s => s.stage === def.key).length
            const p = total > 0 ? (n / total) * 100 : 0
            return (
              <div key={def.key}>
                <div className="flex items-center justify-between mb-1.5 text-sm">
                  <span className="font-medium text-black">{def.emoji} {def.label}</span>
                  <span className="tabular-nums text-gray-500">{n.toLocaleString()} ({p.toFixed(1)}%)</span>
                </div>
                <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, backgroundColor: def.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Persona facet distribution (v2) */}
      <section className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">👤 Persona facet</h2>
        <p className="text-[11px] text-gray-400 mb-4">Role context (mostly fixed)</p>
        <div className="space-y-3">
          {PERSONAS.map(def => {
            const n = items.filter(s => s.persona === def.key).length
            const p = total > 0 ? (n / total) * 100 : 0
            return (
              <div key={def.key}>
                <div className="flex items-center justify-between mb-1.5 text-sm">
                  <span className="font-medium text-black">{def.emoji} {def.label}</span>
                  <span className="tabular-nums text-gray-500">{n.toLocaleString()} ({p.toFixed(1)}%)</span>
                </div>
                <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, backgroundColor: def.color }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Archetype distribution */}
      <section className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">🧬 Archetype distribution</h2>
        <div className="space-y-3">
          {(Object.entries(archCounts) as [ArchetypeKey, number][]).map(([key, n]) => {
            const p = total > 0 ? (n / total) * 100 : 0
            const arc = ARCHETYPES[key]
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5 text-sm">
                  <span className="font-medium text-black">{arc.label}</span>
                  <span className="tabular-nums text-gray-500">{n} ({p.toFixed(1)}%)</span>
                </div>
                <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, backgroundColor: arc.accentColor }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Enrichment coverage by provider — replaces old Apollo-only metric */}
      <section className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">🔗 Enrichment coverage</h2>
        <p className="text-[11px] text-gray-400 mb-4">% of rows with each field populated. Run the v2 pipeline at <code className="bg-[#F5F5F5] px-1 rounded">/admin/lab</code> to fill gaps</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'LinkedIn',  n: hasLinkedin, color: '#046BB1' },
            { label: 'Photo',     n: hasPhoto,    color: '#E48715' },
            { label: 'Company',   n: hasCompany,  color: '#62A758' },
            { label: 'Beehiiv',   n: hasBeehiiv,  color: '#E26F8E' },
            { label: 'Stripe',    n: hasStripe,   color: '#3B4C99' },
          ].map(p => (
            <div key={p.label} className="text-center p-3 rounded-lg" style={{ backgroundColor: p.color + '11' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">{p.label}</p>
              <p className="text-2xl font-black tabular-nums" style={{ color: p.color }}>{pct(p.n)}%</p>
              <p className="text-[10px] text-gray-400 mt-1 tabular-nums">{p.n.toLocaleString()} / {total.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Score histogram */}
      <section className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">📊 Score distribution</h2>
        <p className="text-[11px] text-gray-400 mb-4">AI score (0-100). Computed from frequency · depth · breadth in v2 - - or from aiLevel · timeCommitment · aiTools count in legacy submissions</p>
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
