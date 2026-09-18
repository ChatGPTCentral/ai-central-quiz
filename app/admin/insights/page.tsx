// Insights — REVIVED 2026-09-18 (owner: "which placement sells... mettiamolo
// in un luogo diverso" / "paid... luogo diverso"), a few hours after this
// route became a redirect stub into /admin/cohorts. That merge answered
// "why do we have 4 sections" (2026-09-13); this un-merge answers a
// different, later complaint — Cohorts had grown back into a wall of
// unrelated blocks and the owner wants the funnel-rate instrument (Cohorts)
// kept apart from conversion-attribution reading (this page). Same three
// sections that lived in Cohorts a few commits ago, same data, same
// components — moved, not rebuilt.

import CtaClickedTable from '@/components/admin/CtaClickedTable.client'
import { filteredSubmissionsAll, parseFilters, revenueCharges } from '@/lib/dashboard-queries'
import { loadEventStats } from '@/lib/dashboard-events'
import type { PlacementStat } from '@/app/admin/dashboard/DashboardBento.client'
import { getCheckoutDeclines, getPaidTrials, type DeclineRow, type PaidRow } from '@/lib/checkout-declines'
import { humanizePlacement, fmtDuration } from '@/lib/buyer-behavior'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const revalidate = 60

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const GREEN = '#2E7D32'
const AMBER = '#B26A00'

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, textAlign: 'right', padding: '7px 8px' }
const td: React.CSSProperties = { fontSize: 12.5, padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

export default async function InsightsPage() {
  // Which CTA gets clicked → which CTA gets PAID, same quizTrial definition
  // the dashboard's KPI row uses (net-new OR existing customer buying
  // again, never netNew alone).
  let placements: PlacementStat[] = []
  try {
    const filters = parseFilters(new URLSearchParams())
    filters.sample = 'launch'
    const [allSubs, events, rev] = await Promise.all([
      filteredSubmissionsAll(filters),
      loadEventStats(),
      revenueCharges(),
    ])
    const quizTrialById = new Map<string, { quizTrial: boolean; revenue: number }>()
    for (const r of allSubs) {
      const emailKey = r.email?.trim().toLowerCase() || null
      const netNew = !!(emailKey && rev.netNewEmails.has(emailKey))
      const quizTrial = netNew || (!!emailKey && rev.quizExistingEmails.has(emailKey))
      if (r.id) quizTrialById.set(String(r.id), { quizTrial, revenue: emailKey ? (rev.quizRevenueByEmail.get(emailKey) ?? 0) : 0 })
    }
    placements = events.placements.map(p => {
      let sales = 0, revenue = 0
      for (const id of p.clickerIds ?? []) {
        const hit = quizTrialById.get(id)
        if (hit?.quizTrial) { sales++; revenue += hit.revenue }
      }
      return { placement: p.placement, views: p.views, clicks: p.clicks, sales, revenue }
    })
  } catch { /* the section below degrades to empty, not a page error */ }

  // Both sides of the same board (owner, 2026-09-15, then again 2026-09-18).
  let declines: DeclineRow[] = []
  let paid: PaidRow[] = []
  try {
    ;[declines, paid] = await Promise.all([getCheckoutDeclines(14, 80), getPaidTrials()])
  } catch { /* degrades to empty */ }

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 1100 }}>
      <div className="flex items-baseline flex-wrap" style={{ gap: 10 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Insights</h1>
        <a href="/admin/cohorts" style={{ fontSize: 12.5, fontWeight: 700, color: '#046BB1' }}>funnel rates &amp; learnings →</a>
      </div>
      <p style={{ fontSize: 12, color: MUTE, marginTop: 4, maxWidth: 780 }}>
        Not funnel rates (that&rsquo;s Cohorts) — who actually converts, on which button, and why the ones who
        didn&rsquo;t probably didn&rsquo;t.
      </p>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: INK }}>Which placement actually sells</h2>
        <p style={{ fontSize: 12, color: MUTE, marginTop: 8, marginBottom: 10, maxWidth: 720 }}>
          For every button on the result page: how many people saw it, clicked it, and of those, how many
          went on to pay (quiz-earned, net-new or an existing customer buying again).
        </p>
        <CtaClickedTable placements={placements} />
      </section>

      <section style={{ marginTop: 34 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: INK }}>
          Paid <span style={{ color: MUTE, fontWeight: 600 }}>({paid.length})</span>
        </h2>
        <p style={{ fontSize: 12, color: MUTE, marginTop: 8, marginBottom: 10, maxWidth: 780 }}>
          Every quiz-earned trial ever, not a recent slice. &ldquo;Most likely reason&rdquo; is an inference, stated as
          one, built only from what actually happened — a click or its absence, same-visit or a return days later —
          never a story about how they felt. Timing and button sit in their own columns so it can be checked, not
          just trusted. Click a name for their full Behavior tab.
        </p>
        {paid.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTE }}>No qualifying rows, or the data failed to load.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 980 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${HAIR}` }}>
                  <th style={{ ...th, textAlign: 'left' }}>Person</th>
                  <th style={{ ...th, textAlign: 'left' }}>Country</th>
                  <th style={{ ...th, textAlign: 'left' }}>Stage</th>
                  <th style={{ ...th, textAlign: 'left' }}>Source</th>
                  <th style={th}>Landing dwell</th>
                  <th style={th}>Quiz fill</th>
                  <th style={th}>Trial</th>
                  <th style={{ ...th, textAlign: 'left' }}>Most likely reason</th>
                </tr>
              </thead>
              <tbody>
                {paid.map(p => (
                  <tr key={`${p.submissionId}-${p.trialAt}`} style={{ borderBottom: `1px solid ${HAIR}` }}>
                    <td style={{ ...td, textAlign: 'left' }}>
                      <Link href={`/admin/submissions/${p.submissionId}`} style={{ color: INK, fontWeight: 700, textDecoration: 'underline' }}>
                        {p.name || p.submissionId.slice(0, 8)}
                      </Link>
                    </td>
                    <td style={{ ...td, textAlign: 'left' }}>{p.country || '—'}</td>
                    <td style={{ ...td, textAlign: 'left' }}>{p.stage || '—'}</td>
                    <td style={{ ...td, textAlign: 'left' }}>{p.utmSource || 'direct'}</td>
                    <td style={td}>{fmtDuration(p.landingDwellSeconds)}</td>
                    <td style={td}>{fmtDuration(p.quizFillSeconds)}</td>
                    <td style={{ ...td, fontWeight: 800, color: GREEN }}>${(p.trialCents / 100).toFixed(2)} <span style={{ color: MUTE, fontWeight: 400 }}>{fmtDay(p.trialAt)}</span></td>
                    <td style={{ fontSize: 12, padding: '7px 8px', textAlign: 'left', color: !p.clickPlacement ? AMBER : INK, maxWidth: 320 }}>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: 34 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: INK }}>
          Reached checkout, didn&rsquo;t pay <span style={{ color: MUTE, fontWeight: 600 }}>({declines.length})</span>
        </h2>
        <p style={{ fontSize: 12, color: MUTE, marginTop: 8, marginBottom: 10, maxWidth: 720 }}>
          Last 14 days. &ldquo;Read then declined&rdquo; stayed 20s+ before leaving, a considered no. &ldquo;Quick bounce&rdquo;
          left under 5s, likely a misclick. Click a name for their full Behavior tab.
        </p>
        {declines.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTE }}>No qualifying rows in the last 14 days, or the data failed to load.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${HAIR}` }}>
                  <th style={{ ...th, textAlign: 'left' }}>Person</th>
                  <th style={{ ...th, textAlign: 'left' }}>Country</th>
                  <th style={{ ...th, textAlign: 'left' }}>Stage</th>
                  <th style={{ ...th, textAlign: 'left' }}>Last click</th>
                  <th style={{ ...th, textAlign: 'left' }}>Signal</th>
                </tr>
              </thead>
              <tbody>
                {declines.map(d => {
                  const signalLabel = d.signal === 'read_then_declined' ? 'Read then declined'
                    : d.signal === 'quick_bounce' ? 'Quick bounce'
                    : d.signal === 'unclear' ? 'Unclear'
                    : 'Never closed the modal'
                  const signalColor = d.signal === 'read_then_declined' ? AMBER : d.signal === 'quick_bounce' ? MUTE : INK
                  return (
                    <tr key={d.submissionId} style={{ borderBottom: `1px solid ${HAIR}` }}>
                      <td style={{ ...td, textAlign: 'left' }}>
                        <Link href={`/admin/submissions/${d.submissionId}`} style={{ color: INK, fontWeight: 700, textDecoration: 'underline' }}>
                          {d.name || d.email || d.submissionId.slice(0, 8)}
                        </Link>
                      </td>
                      <td style={{ ...td, textAlign: 'left' }}>{d.country || '—'}</td>
                      <td style={{ ...td, textAlign: 'left' }}>{d.stage || '—'}</td>
                      <td style={{ ...td, textAlign: 'left' }}>{d.lastClickPlacement ? humanizePlacement(d.lastClickPlacement) : '—'}<br /><span style={{ color: MUTE, fontSize: 10.5 }}>{fmtDay(d.lastClickAt)}</span></td>
                      <td style={{ ...td, textAlign: 'left', color: signalColor, fontWeight: d.signal === 'read_then_declined' ? 800 : 400 }}>
                        {signalLabel}
                        {d.closeDwellMs !== null && <span style={{ color: MUTE, fontWeight: 400 }}> &middot; {Math.round(d.closeDwellMs / 1000)}s</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
