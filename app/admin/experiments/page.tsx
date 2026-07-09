import { listExperiments, experimentResults, type VariantResult } from '@/lib/experiment-queries'
import ExperimentsPanel from './ExperimentsPanel.client'

export const dynamic = 'force-dynamic'

/**
 * Experiments — create/manage A/B/n tests on the result page without
 * deploys. Variants are copy-only overrides of whitelisted slots; results
 * join exposures to checkout clicks and real net-new Stripe conversions.
 */
export default async function ExperimentsPage() {
  let experiments: Awaited<ReturnType<typeof listExperiments>> = []
  let results: Record<string, VariantResult[]> = {}
  let error: string | null = null
  try {
    experiments = await listExperiments()
    for (const row of experiments) {
      if (row.status === 'draft') continue
      try {
        results[row.key] = await experimentResults(row)
      } catch { /* per-experiment best effort */ }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const flagOn = process.env.NEXT_PUBLIC_EXPERIMENTS_ENABLED === 'true'

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Experiments</h1>
        <p className="text-sm text-[#9C9C9C]">
          A/B/n copy tests on the result page. Changes and kills propagate in ≤30 seconds, no deploy.
        </p>
        {!flagOn && (
          <p className="mt-2 inline-block rounded-lg bg-[#FFF3E0] px-3 py-1.5 text-[12px] font-bold text-[#E65100]">
            Engine OFF — set NEXT_PUBLIC_EXPERIMENTS_ENABLED=true in Vercel to serve variants. You can still create drafts.
          </p>
        )}
        {error && <p className="text-sm text-[#BE3B3B] mt-2">Error: {error}</p>}
      </div>
      <ExperimentsPanel initialExperiments={experiments} initialResults={results} />
    </div>
  )
}
