import { listExperiments, experimentResults, type VariantResult } from '@/lib/experiment-queries'
import ExperimentsPanel from './ExperimentsPanel.client'
import ExperimentArms from '@/components/admin/ExperimentArms'

export const dynamic = 'force-dynamic'

/**
 * Experiments — create/manage A/B/n tests on the result page without
 * deploys. Variants are copy-only overrides of whitelisted slots; results
 * join exposures to checkout clicks and real net-new Stripe conversions.
 *
 * REMOVED 2026-09-18 (owner: "non si capisce più nulla"): a page-level
 * PostHog rage/dead-click table used to live here too, under a "UX health"
 * label that collided with a DIFFERENT, unrelated "UX health" widget on
 * /admin/dashboard (a product-outage banner) — same name, two different
 * things, on top of having nothing to do with managing a test. The
 * underlying read (lib/ux-by-page.ts's uxByPage()) still exists for a
 * dedicated look when one is actually wanted; it just does not belong on
 * the page for creating and reading a test's own result.
 */
export default async function ExperimentsPage({ searchParams }: { searchParams: { exp?: string; w?: string } }) {
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

  const flagOn = process.env.NEXT_PUBLIC_EXPERIMENTS_ENABLED === 'true'

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-baseline flex-wrap gap-2.5">
          <h1 className="text-2xl font-black text-[#333333] mb-1">Experiments</h1>
          <a href="/admin/cohorts" className="text-[12.5px] font-bold text-[#046BB1]">verdicts and every other learning →</a>
        </div>
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

      <div className="mt-8">
        <h2 className="text-base font-black text-[#333333] mb-1">What&rsquo;s actually different</h2>
        <p className="text-sm text-[#9C9C9C] mb-3">
          Control and the variant, live, side by side — the results above say how it&rsquo;s doing, this says what it IS.
        </p>
        <ExperimentArms expKey={searchParams.exp} phone={searchParams.w === 'phone'} />
      </div>
    </div>
  )
}
