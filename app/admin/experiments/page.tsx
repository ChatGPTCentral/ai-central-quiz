import { listExperiments, experimentResults, type VariantResult } from '@/lib/experiment-queries'
import { clarityUxByPage, type UxPageRow } from '@/lib/clarity'
import ClarityPullNow from '@/components/admin/ClarityPullNow.client'
import ExperimentsPanel from './ExperimentsPanel.client'

export const dynamic = 'force-dynamic'

/**
 * Experiments — create/manage A/B/n tests on the result page without
 * deploys. Variants are copy-only overrides of whitelisted slots; results
 * join exposures to checkout clicks and real net-new Stripe conversions.
 * The Clarity UX health table lives here too (moved from the retired
 * Funnel page): rage/dead clicks and JS errors are the qualitative side
 * of every experiment read.
 */
export default async function ExperimentsPage() {
  let experiments: Awaited<ReturnType<typeof listExperiments>> = []
  let results: Record<string, VariantResult[]> = {}
  let error: string | null = null
  try {
    experiments = await listExperiments()
    // Active tests first (running, then paused/draft), finished ones last, so
    // the live experiment is always the headline card.
    const rank = (s: string) => (s === 'running' ? 0 : s === 'paused' || s === 'draft' ? 1 : 2)
    experiments.sort((a, b) => rank(a.status) - rank(b.status))
    for (const row of experiments) {
      if (row.status === 'draft') continue
      try {
        results[row.key] = await experimentResults(row)
      } catch { /* per-experiment best effort */ }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  // Clarity UX snapshots (best-effort; empty until the first pull lands)
  let ux: Awaited<ReturnType<typeof clarityUxByPage>> = { rows: [], snapshotDays: 0, lastFetched: null }
  try { ux = await clarityUxByPage(7) } catch { /* table shows its empty state */ }
  const uxPath = (u: string) => { try { return new URL(u).pathname || '/' } catch { return u } }
  const uxRows: UxPageRow[] = ux.rows.slice(0, 8)

  const flagOn = process.env.NEXT_PUBLIC_EXPERIMENTS_ENABLED === 'true'

  const INK = '#1A1A1A'
  const MUTE = '#9C9C9C'
  const HAIR = '#E8E2D4'
  const ROWHAIR = '#F1ECE2'
  const LATTE = '#FEF7E7'
  const th = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B6B6B' } as const
  const tnum = { fontVariantNumeric: 'tabular-nums' } as const
  const fmt = (n: number) => n.toLocaleString()

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Experiments</h1>
        <p className="text-sm text-[#9C9C9C]">
          A/B/n tests on the result page, copy or structural. Split, exposures and conversion update live; changes and kills propagate in ≤30 seconds, no deploy.
        </p>
        {!flagOn && (
          <p className="mt-2 inline-block rounded-lg bg-[#FFF3E0] px-3 py-1.5 text-[12px] font-bold text-[#E65100]">
            Engine OFF — set NEXT_PUBLIC_EXPERIMENTS_ENABLED=true in Vercel to serve variants. You can still create drafts.
          </p>
        )}
        {error && <p className="text-sm text-[#BE3B3B] mt-2">Error: {error}</p>}
      </div>
      <ExperimentsPanel initialExperiments={experiments} initialResults={results} />

      {/* UX health · Clarity (moved from the retired Funnel page) */}
      <div style={{ border: '1px solid #333333', background: '#FFFFFF', marginTop: 28 }}>
        <div className="flex items-baseline justify-between flex-wrap" style={{ padding: '12px 16px', background: LATTE, borderBottom: '1px solid #333333', gap: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>UX health · Clarity</span>
          <span className="inline-flex items-center" style={{ gap: 10 }}>
            <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>
              {ux.snapshotDays || 0} daily snapshot{ux.snapshotDays === 1 ? '' : 's'}{ux.lastFetched ? ` · last pull ${new Date(ux.lastFetched).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
            </span>
            <ClarityPullNow />
          </span>
        </div>
        {uxRows.length === 0 ? (
          <p style={{ padding: '12px 16px', fontSize: 12.5, color: MUTE }}>
            No snapshots yet. The cron pulls daily at 06:30 UTC once CLARITY_API_TOKEN is set on Vercel, or hit Pull now for the trailing day.
          </p>
        ) : (
          <>
            <div className="grid" style={{ gridTemplateColumns: 'minmax(90px,1fr) 84px 100px 60px 60px 96px 84px', ...th, borderBottom: `1px solid ${HAIR}`, padding: '0 16px' }}>
              <span style={{ padding: '8px 0' }}>Page</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Sessions</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Scroll depth</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Rage</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Dead</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Quick-backs</span><span style={{ padding: '8px 0', textAlign: 'right' }}>JS errors</span>
            </div>
            {uxRows.map(r => (
              <div key={r.url} className="grid items-center hover:bg-[#FEF7E7]" style={{ gridTemplateColumns: 'minmax(90px,1fr) 84px 100px 60px 60px 96px 84px', fontSize: 12, borderBottom: `1px solid ${ROWHAIR}`, padding: '0 16px' }}>
                <span style={{ padding: '8px 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: INK }} title={r.url}>{uxPath(r.url)}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', ...tnum }}>{fmt(r.sessions)}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: '#046BB1', ...tnum }}>{r.scrollDepth === null ? '–' : `${r.scrollDepth}%`}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: r.rage > 0 ? 800 : 400, color: r.rage > 0 ? '#BE3B3B' : undefined, ...tnum }}>{r.rage}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: r.dead > 0 ? 800 : 400, color: r.dead > 0 ? '#BE593B' : undefined, ...tnum }}>{r.dead}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', ...tnum }}>{r.quickback}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: r.scriptErrors > 0 ? 800 : 400, color: r.scriptErrors > 0 ? '#BE3B3B' : undefined, ...tnum }}>{r.scriptErrors}</span>
              </div>
            ))}
            <p style={{ padding: '8px 16px 10px', fontSize: 10.5, color: MUTE }}>Recordings and heatmaps stay in the Clarity dashboard.</p>
          </>
        )}
      </div>
    </div>
  )
}
