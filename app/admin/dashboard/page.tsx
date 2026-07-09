import {
  filteredSubmissionsAll,
  parseFilters,
  LAUNCH_LABEL,
  type DashboardFilters,
} from '@/lib/dashboard-queries'
import { continentOf } from '@/lib/geo'
import { PALETTE } from '@/lib/palette'
import { COMPANY_SIZE_ORDER } from '@/lib/enrichment/standardize'
import StatCard from '@/components/admin/StatCard'
import HorizontalBarChart from '@/components/admin/HorizontalBarChart'
import VerticalBarChart from '@/components/admin/VerticalBarChart'
import CountryChart from '@/components/admin/CountryChart'
import RoleChart from '@/components/admin/RoleChart.client'
import AgeChart from '@/components/admin/AgeChart.client'
import AdvancedFilter from '@/app/admin/submissions/AdvancedFilter.client'
import { STAGES } from '@/lib/segmentation-v2'

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
  // The dashboard defaults to the post-launch quiz sample so the legacy
  // Fillout + Stripe-import rows don't drown out the real funnel data.
  if (!filters.sample) filters.sample = 'launch'
  const sample = filters.sample

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
  }
  const n = (k: number) => `N = ${k.toLocaleString()}`

  // Country chart needs continent + region for grouping
  const geoRows = allRows.map(r => ({
    country: r.country,
    region: r.region,
    continent: continentOf(r.country),
  }))

  // Two conversion rates, both on a UNIQUE-PEOPLE basis:
  //   1) CVR Quiz→Paid ("Quiz Effect") = net-new paid ÷ all quiz-takers.
  //      Net-new = people whose FIRST-ever Stripe charge came AFTER they took
  //      the quiz (stripe_first_charge_at > staged_at). This excludes anyone
  //      who was already paying, and anyone whose charge predates their
  //      quiz-take — the quiz can't have caused a purchase made before it. So
  //      it counts only people who upgraded after AND because of the quiz.
  //   2) CVR Revenue-associated = quiz-takers with ANY Stripe revenue > 0 ÷
  //      all quiz-takers (includes people who were already customers).
  const uniq = (rows: typeof allRows) => new Set(rows.map(r => r.email.toLowerCase())).size
  const revenueAssocPeople = uniq(allRows.filter(r => (r.lifetimeValueUsd ?? 0) > 0))
  const netNewPaidPeople = uniq(allRows.filter(r =>
    r.stripeFirstChargeAt && r.stagedAt &&
    new Date(r.stripeFirstChargeAt).getTime() > new Date(r.stagedAt).getTime(),
  ))
  const cvrRevenueAssoc = uniqueEmails > 0 ? (revenueAssocPeople / uniqueEmails) * 100 : 0
  const cvrQuizToPaid = uniqueEmails > 0 ? (netNewPaidPeople / uniqueEmails) * 100 : 0

  // Preserve filters for CSV export (carry the active sample scope through).
  const exportParams = new URLSearchParams(searchParams as Record<string, string>)
  exportParams.delete('offset')
  exportParams.set('sample', sample)
  const exportHref = `/api/admin/export.csv?${exportParams.toString()}`

  // Sample toggle links (preserve other params).
  const sampleHref = (s: 'launch' | 'all') => {
    const p = new URLSearchParams(searchParams as Record<string, string>)
    p.set('sample', s)
    p.delete('offset')
    return `/admin/dashboard?${p.toString()}`
  }

  return (
    <div className="flex">
      {/* Main content */}
      <div className="flex-1 p-8 min-w-0">
        <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-[#333333] mb-1">Dashboard</h1>
            <p className="text-sm text-[#9C9C9C]">
              {error ? <span className="text-[#BE3B3B]">Error: {error}</span> :
                <>Charting <strong className="text-[#333333]">{allRows.length.toLocaleString()}</strong> {sample === 'launch' ? 'launch submissions' : 'records'} · <a href="/admin/submissions" className="text-[#046BB1] hover:underline">view table →</a></>}
            </p>
          </div>
          <a
            href={exportHref}
            className="px-4 py-2 rounded-lg bg-[#333333] text-[#FFFDFA] text-sm font-bold hover:opacity-90"
          >
            Export filtered CSV
          </a>
        </div>

        {/* Sample scope toggle — launch quiz funnel vs everything */}
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-lg border border-[#E8E4DF] overflow-hidden text-sm font-bold">
            <a
              href={sampleHref('launch')}
              className={`px-4 py-2 ${sample === 'launch' ? 'bg-[#333333] text-[#FFFDFA]' : 'bg-white text-[#9C9C9C] hover:text-[#333333]'}`}
            >
              Launch ({LAUNCH_LABEL}+)
            </a>
            <a
              href={sampleHref('all')}
              className={`px-4 py-2 border-l border-[#E8E4DF] ${sample === 'all' ? 'bg-[#333333] text-[#FFFDFA]' : 'bg-white text-[#9C9C9C] hover:text-[#333333]'}`}
            >
              All data
            </a>
          </div>
          <p className="text-[11px] text-[#9C9C9C] max-w-[420px]">
            {sample === 'launch'
              ? 'Only the new quiz funnel. Excludes the legacy Fillout form and the imported Stripe customers.'
              : 'Everything, including 794 legacy Fillout rows and 1,989 imported Stripe customers.'}
          </p>
        </div>

        {!error && (
          <>
            {/* Summary stats — the two conversion rates lead */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
              <StatCard label={sample === 'launch' ? 'Quiz-takers' : 'Total records'} value={uniqueEmails} accent="jetBlack" hint={sample === 'launch' ? `unique people since ${LAUNCH_LABEL}` : `${allRows.length.toLocaleString()} rows`} />
              <StatCard label="CVR · Quiz → Paid" value={`${cvrQuizToPaid.toFixed(1)}%`} accent="persianRed" hint={`${netNewPaidPeople} paid first time AFTER their quiz`} />
              <StatCard label="CVR · Revenue-assoc." value={`${cvrRevenueAssoc.toFixed(1)}%`} accent="fulvous" hint={`${revenueAssocPeople} with any Stripe revenue`} />
              <StatCard label="Unique companies" value={uniqueCompanies} accent="azul" hint={`${uniqueRoles.toLocaleString()} unique roles`} />
            </section>
            <p className="text-[11px] text-[#9C9C9C] mb-6 max-w-[760px]">
              <strong className="text-[#333]">Quiz → Paid</strong> (the &quot;quiz effect&quot;) counts only people whose first-ever Stripe charge came AFTER they took the quiz, so it isolates conversions the quiz actually drove (existing customers and pre-quiz purchases are excluded).
              {' '}<strong className="text-[#333]">Revenue-associated</strong> counts every quiz-taker who has any Stripe revenue, including customers who were already paying before they took the quiz.
            </p>

            {/* Advanced filter — same UX as on /admin/submissions */}
            <AdvancedFilter />

            {/* ── STAGE LADDER ZONE (top of dashboard — the analytical lens) ── */}
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mt-6 mb-2">AI adoption ladder</h2>
            <p className="text-[11px] text-[#9C9C9C] mb-3">
              Where each person sits on the 6-rung ladder. Stage moves over time. Money is NOT an input - - it&apos;s what we measure per stage to find which rungs convert
            </p>
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Bar chart of stage counts */}
              <div className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
                <header className="px-5 pt-5 pb-3">
                  <h3 className="text-sm font-black text-[#333333]">Stage distribution</h3>
                  <p className="text-[11px] text-[#9C9C9C] mt-0.5">N = {allRows.length.toLocaleString()}</p>
                </header>
                {/* Vertical bars, ordered Unknown → Builder */}
                <div className="px-5 pb-6 pt-2">
                  <div className="flex items-end gap-1.5" style={{ height: 200 }}>
                    {[STAGES.find(s => s.key === 'unknown')!, ...STAGES.filter(s => s.key !== 'unknown')].map(def => {
                      const count = allRows.filter(r => r.stage === def.key).length
                      const pct = allRows.length > 0 ? (count / allRows.length) * 100 : 0
                      const max = Math.max(...STAGES.map(d => allRows.filter(r => r.stage === d.key).length), 1)
                      const barH = (count / max) * 100
                      return (
                        <div key={def.key} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
                          <div className="text-[11px] font-bold tabular-nums text-[#333333]">{count}</div>
                          <div
                            className="w-full mt-1 rounded-t transition-all duration-500"
                            style={{ height: `${count > 0 ? Math.max(barH, 2) : 0}%`, backgroundColor: def.color }}
                          />
                          <div className="mt-2 text-center leading-tight">
                            <div style={{ fontSize: 14 }}>{def.emoji}</div>
                            <div className="text-[9.5px] text-[#666] truncate">{def.label}</div>
                            <div className="text-[9.5px] tabular-nums text-[#9C9C9C]">{pct.toFixed(0)}%</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Cross-tab: stage × revenue */}
              <div className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
                <header className="px-5 pt-5 pb-3">
                  <h3 className="text-sm font-black text-[#333333]">Stage × Revenue</h3>
                  <p className="text-[11px] text-[#9C9C9C] mt-0.5">Which rung actually converts - - the analytical payoff</p>
                </header>
                <div className="px-1 pb-3 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-[#E8E4DF]">
                        <th className="text-left px-4 py-1.5 font-bold uppercase tracking-wider text-[10px] text-[#9C9C9C]">Stage</th>
                        <th className="text-right px-2 py-1.5 font-bold uppercase tracking-wider text-[10px] text-[#9C9C9C]">N</th>
                        <th className="text-right px-2 py-1.5 font-bold uppercase tracking-wider text-[10px] text-[#9C9C9C]">Paying</th>
                        <th className="text-right px-2 py-1.5 font-bold uppercase tracking-wider text-[10px] text-[#9C9C9C]">Conv %</th>
                        <th className="text-right px-2 py-1.5 font-bold uppercase tracking-wider text-[10px] text-[#9C9C9C]">ARPU</th>
                        <th className="text-right px-4 py-1.5 font-bold uppercase tracking-wider text-[10px] text-[#9C9C9C]">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STAGES.map(def => {
                        const rows = allRows.filter(r => r.stage === def.key)
                        if (rows.length === 0) return null
                        const paying = rows.filter(r => typeof r.lifetimeValueUsd === 'number' && r.lifetimeValueUsd > 0)
                        const revenue = paying.reduce((a, b) => a + (b.lifetimeValueUsd || 0), 0)
                        const arpu = rows.length > 0 ? revenue / rows.length : 0
                        const conv = rows.length > 0 ? (paying.length / rows.length) * 100 : 0
                        return (
                          <tr key={def.key} className="border-b border-[#F5F5F5]">
                            <td className="px-4 py-1.5 truncate" style={{ color: def.color }}><span className="font-bold">{def.emoji} {def.label}</span></td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{rows.length}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{paying.length}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-[#046BB1]">{conv.toFixed(1)}%</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">${arpu.toFixed(2)}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums font-bold text-[#62A758]">${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
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
