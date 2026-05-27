import {
  filteredSubmissionsAll,
  parseFilters,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import { continentOf } from '@/lib/geo'
import { PALETTE } from '@/lib/palette'
import { COMPANY_SIZE_ORDER } from '@/lib/enrichment/standardize'
import StatCard from '@/components/admin/StatCard'
import HorizontalBarChart from '@/components/admin/HorizontalBarChart'
import VerticalBarChart from '@/components/admin/VerticalBarChart'
import CountryChart from '@/components/admin/CountryChart'
import LifetimeValueChart from '@/components/admin/LifetimeValueChart'
import RoleChart from '@/components/admin/RoleChart.client'
import AgeChart from '@/components/admin/AgeChart.client'
import AdvancedFilter from '@/app/admin/submissions/AdvancedFilter.client'

export const dynamic = 'force-dynamic'
// Edge-cache for 30s — the dataset doesn't change between rapid navigations
// and the dashboard's full-scan aggregations are the slowest page in the app.
// Filter changes hit a different URL so they're not cached together.
export const revalidate = 30

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const sp = new URLSearchParams(searchParams as Record<string, string>)
  const filters: DashboardFilters = parseFilters(sp)

  let error: string | null = null
  let allRows: Awaited<ReturnType<typeof filteredSubmissionsAll>> = []

  try {
    allRows = await filteredSubmissionsAll(filters)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  // ── Aggregate from filtered rows for the visualizations ──────────
  const uniqueEmails = new Set(allRows.map(r => r.email.toLowerCase())).size
  const uniqueCompanies = new Set(
    allRows.map(r => (r.companyName || '').toLowerCase().trim()).filter(Boolean),
  ).size
  const uniqueRoles = new Set(
    allRows.map(r => (r.jobTitle || r.jobLevel || '').trim()).filter(Boolean),
  ).size

  function countBy<T>(rows: T[], pick: (r: T) => string | undefined | null): { label: string; value: number }[] {
    const m = new Map<string, number>()
    for (const r of rows) {
      const v = pick(r)
      if (!v) continue
      m.set(v, (m.get(v) || 0) + 1)
    }
    return Array.from(m.entries()).map(([label, value]) => ({ label, value }))
  }

  // Exclude AI "uncertain" classifications from the chart — they're noise.
  const isUncertain = (v?: string | null) => !v || v.toLowerCase() === 'uncertain'

  // Acquisition attribution — three lenses on "where did they come from?"
  //   utmQuizData       — quiz utm_source (UTM that drove them to take the survey)
  //   utmNewsletterData — Beehiiv utm_source (UTM that drove their newsletter signup)
  //   utmPaidData       — coalesce(beehiiv, quiz, 'Direct') for PAYING customers only
  //                       → answers "where do paid conversions come from?"
  const cleanUtm = (s?: string) => (s || '').trim() || null
  const utmQuizData = countBy(allRows, r => cleanUtm(r.utmSource) || 'Direct / unknown')
  const utmNewsletterData = countBy(allRows, r => cleanUtm(r.utmSourceBeehiiv) || 'Direct / unknown')
  const utmPaidData = countBy(allRows, r => {
    if (!r.lifetimeValueUsd || r.lifetimeValueUsd <= 0) return undefined  // only paying customers
    return cleanUtm(r.utmSourceBeehiiv) || cleanUtm(r.utmSource) || 'Direct / unknown'
  })

  // Products bought (Stripe) — aggregate by stripe product_id, label with
  // canonical product name. CRITICAL: must include EVERY paying customer,
  // even those whose stripeProducts is empty (one-off charges without
  // invoice line items, or pre-re-import legacy data). Those go into an
  // "Other / unidentified product" bucket so N matches the LTV chart's N.
  const productAgg = new Map<string, { name: string; customers: number }>()
  const OTHER_KEY = '__other__'
  for (const r of allRows) {
    if (!r.lifetimeValueUsd || r.lifetimeValueUsd <= 0) continue  // only paying customers
    let matchedAnyProduct = false
    const seenInRow = new Set<string>()
    if (r.stripeProducts?.length) {
      for (const p of r.stripeProducts) {
        if (!p.productId) continue
        if (seenInRow.has(p.productId)) continue
        seenInRow.add(p.productId)
        matchedAnyProduct = true
        const existing = productAgg.get(p.productId) || { name: p.name || p.productId, customers: 0 }
        existing.customers += 1
        if (p.name) existing.name = p.name
        productAgg.set(p.productId, existing)
      }
    }
    if (!matchedAnyProduct) {
      const existing = productAgg.get(OTHER_KEY) || { name: 'Other / one-off charge', customers: 0 }
      existing.customers += 1
      productAgg.set(OTHER_KEY, existing)
    }
  }
  const productData = Array.from(productAgg.values())
    .map(p => ({ label: p.name, value: p.customers }))
    .sort((a, b) => b.value - a.value)
  const ageData      = countBy(allRows, r => {
    const v = r.ageBracket || r.ageAiEstimate
    return isUncertain(v) ? undefined : v
  })
  const sexData      = countBy(allRows, r => {
    const v = r.sexAiEstimate
    if (isUncertain(v)) return undefined
    return v!.charAt(0).toUpperCase() + v!.slice(1).toLowerCase()
  })
  const industryData = countBy(allRows, r => r.companyIndustry)
  const sizeData     = countBy(allRows, r => r.companySize)

  // Fixed ordering for ordinal axes (uncertain dropped)
  const AGE_ORDER = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+']
  const SEX_ORDER = ['Male', 'Female']

  // N = total observations counted per chart (after filtering uncertain/empty)
  const sumOf = (arr: { value: number }[]) => arr.reduce((a, b) => a + b.value, 0)
  const N = {
    age:      sumOf(ageData),
    sex:      sumOf(sexData),
    industry: sumOf(industryData),
    size:     sumOf(sizeData),
    utmQuiz: sumOf(utmQuizData),
    utmNewsletter: sumOf(utmNewsletterData),
    utmPaid: sumOf(utmPaidData),
    geo:      allRows.filter(r => r.country).length,
    products: sumOf(productData),
  }
  const n = (k: number) => `N = ${k.toLocaleString()}`

  // Country chart needs continent + region for grouping
  const geoRows = allRows.map(r => ({
    country: r.country,
    region: r.region,
    continent: continentOf(r.country),
  }))

  // Preserve filters for CSV export
  const exportParams = new URLSearchParams(searchParams as Record<string, string>)
  exportParams.delete('offset')
  const exportHref = `/api/admin/export.csv?${exportParams.toString()}`

  return (
    <div className="flex">
      {/* Main content */}
      <div className="flex-1 p-8 min-w-0">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-[#333333] mb-1">Dashboard</h1>
            <p className="text-sm text-[#9C9C9C]">
              {error ? <span className="text-[#BE3B3B]">Error: {error}</span> :
                <>Charting <strong className="text-[#333333]">{allRows.length.toLocaleString()}</strong> records · <a href="/admin/submissions" className="text-[#046BB1] hover:underline">view table →</a></>}
            </p>
          </div>
          <a
            href={exportHref}
            className="px-4 py-2 rounded-lg bg-[#333333] text-[#FFFDFA] text-sm font-bold hover:opacity-90"
          >
            Export filtered CSV
          </a>
        </div>

        {!error && (
          <>
            {/* Summary stats */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total records"     value={allRows.length}   accent="jetBlack" />
              <StatCard label="Unique emails"     value={uniqueEmails}     accent="azul" />
              <StatCard label="Unique companies"  value={uniqueCompanies}  accent="viridian" />
              <StatCard label="Unique roles"      value={uniqueRoles}      accent="fulvous" />
            </section>

            {/* Advanced filter — same UX as on /admin/submissions */}
            <AdvancedFilter />

            {/* ── MONEY / REVENUE ZONE (top of dashboard) ── */}
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mt-6 mb-2">Revenue</h2>
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
              <LifetimeValueChart values={allRows.map(r => r.lifetimeValueUsd)} />
              {/* Products chart takes 2/3 of the row so long product names aren't cut */}
              <div className="lg:col-span-2">
                <HorizontalBarChart
                  title="Products bought"
                  subtitle={n(N.products) + ' paying customers'}
                  data={productData}
                  maxRows={10}
                  uniformColor={PALETTE.viridian}
                  expandable
                />
              </div>
            </section>

            {/* ── DEMOGRAPHICS ZONE ── */}
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mt-6 mb-2">People</h2>
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
              <AgeChart rows={allRows.map(r => ({
                ageBracket: r.ageBracket,
                ageAiEstimate: r.ageAiEstimate,
              }))} />
              <VerticalBarChart
                title="Sex"
                subtitle={n(N.sex)}
                data={sexData}
                orderedLabels={SEX_ORDER}
                uniformColor={PALETTE.rosePompadour}
                showCurves={false}
              />
              <CountryChart rows={geoRows} subtitle={n(N.geo)} />

              <HorizontalBarChart
                title="Industry"
                subtitle={n(N.industry)}
                data={industryData}
                maxRows={8}
                uniformColor={PALETTE.asparagus}
                expandable
              />
              <RoleChart rows={allRows.map(r => ({
                jobTitle: r.jobTitle,
                jobTitleStandardized: r.jobTitleStandardized,
                jobLevel: r.jobLevel,
                seniority: r.seniority,
              }))} />
              <VerticalBarChart
                title="Company size"
                subtitle={n(N.size)}
                data={sizeData}
                orderedLabels={[...COMPANY_SIZE_ORDER]}
                uniformColor={PALETTE.xanthous}
              />
            </section>

            {/* ── ACQUISITION ZONE ── */}
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mt-6 mb-2">Acquisition</h2>
            <p className="text-[11px] text-[#9C9C9C] mb-3">
              Three lenses on where the audience comes from. <strong>Paid conversions</strong> is the most actionable — coalesces Beehiiv source with quiz UTM, filtered to customers who actually paid.
            </p>
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
              <HorizontalBarChart
                title="Paid conversions — channel"
                subtitle={n(N.utmPaid) + ' paying customers'}
                data={utmPaidData}
                maxRows={10}
                uniformColor={PALETTE.persianRed}
                expandable
              />
              <HorizontalBarChart
                title="Newsletter — Beehiiv UTM"
                subtitle={n(N.utmNewsletter) + ' subscribers'}
                data={utmNewsletterData}
                maxRows={10}
                uniformColor={PALETTE.marianBlue}
                expandable
              />
              <HorizontalBarChart
                title="Quiz — landing UTM"
                subtitle={n(N.utmQuiz) + ' quiz takers'}
                data={utmQuizData}
                maxRows={10}
                uniformColor={PALETTE.fulvous}
                expandable
              />
            </section>
          </>
        )}

      </div>

    </div>
  )
}
