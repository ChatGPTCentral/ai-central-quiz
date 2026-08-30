// Insights — the funnel drawn as a flow, and which CTA gets clicked.
//
// Split out of /admin/dashboard (owner, 2026-08-29): "bring all non-critical
// insights to another section 'insights'". These two are illustrative, not
// the north-star numbers the matrix carries — ALL TRIALS, ALL REVENUE, and
// everything money-shaped stayed on the dashboard. Same data, same rules,
// just not fighting for space next to the numbers that decide things.

import XraySection from '@/components/admin/XraySection'
import CtaClickedTable from '@/components/admin/CtaClickedTable.client'
import { filteredSubmissionsAll, parseFilters, revenueCharges } from '@/lib/dashboard-queries'
import { loadEventStats } from '@/lib/dashboard-events'
import type { PlacementStat } from '@/app/admin/dashboard/DashboardBento.client'

export const dynamic = 'force-dynamic'

export default async function InsightsPage() {
  let placements: PlacementStat[] = []
  let error: string | null = null
  try {
    const filters = parseFilters(new URLSearchParams())
    filters.sample = 'launch'
    const [allRows, events, rev] = await Promise.all([
      filteredSubmissionsAll(filters),
      loadEventStats(),
      revenueCharges(),
    ])
    // "Which CTA gets clicked" becomes "which CTA gets PAID" — quizTrial
    // (net-new OR existing customer buying again), not netNew alone, the
    // same north-star definition the dashboard's KPI row uses. This table
    // used to key on netNew only, undercounting existing-customer buyers by
    // the same bug fixed today on "What a taker is worth, by source".
    const quizTrialById = new Map<string, { quizTrial: boolean; ltv: number }>()
    for (const r of allRows) {
      const emailKey = r.email?.trim().toLowerCase() || null
      const netNew = !!(emailKey && rev.netNewEmails.has(emailKey))
      const quizTrial = netNew || (!!emailKey && rev.quizExistingEmails.has(emailKey))
      if (r.id) quizTrialById.set(String(r.id), { quizTrial, ltv: r.lifetimeValueUsd || 0 })
    }
    placements = events.placements.map(p => {
      let sales = 0
      let revenue = 0
      for (const id of p.clickerIds ?? []) {
        const hit = quizTrialById.get(id)
        if (hit?.quizTrial) { sales++; revenue += hit.ltv }
      }
      return { placement: p.placement, views: p.views, clicks: p.clicks, sales, revenue }
    })
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  return (
    <div>
      <header style={{ padding: '22px 36px 6px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>
          Illustrative, not the numbers that decide things — those stay on the Dashboard
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Insights</h1>
        {error && <p style={{ fontSize: 12.5, color: '#BE3B3B', marginTop: 6 }}>Error: {error}</p>}
      </header>
      <XraySection />
      <div style={{ padding: '0 22px 40px' }}>
        <CtaClickedTable placements={placements} />
      </div>
    </div>
  )
}
