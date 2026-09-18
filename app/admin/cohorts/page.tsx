// The cohort instrument — the owner's spec, verbatim (2026-08-18): "track
// for each cohort the funnel stats and conversion rates across stages...
// at the end of each cycle you measure the funnel stats and adjust
// accordingly to maximising."
//
// Every 100 landers, in arrival order, is a numbered cohort (100, not 10:
// at ten people a single trial swings a rate by ten points and every read
// is noise; at a hundred, a cohort is roughly a day of traffic and each
// stage carries enough people for its rate to mean something). Assignment
// runs inside the bandit cron every 15 minutes, append-only. Rates are
// same-person by construction: a cohort member counts at a stage only if
// THEY reached it, so no ratio here can exceed 100 and nobody is credited
// to a landing they never made.
//
// The watcher's cohort_regression check reads the same view and names the
// stage that moved, so the retrain cycle aims at a seam, not an anecdote.
//
// REBUILT 2026-09-18 (owner: "10 moduli diversi con un sacco di testo
// difficile da leggere"). This page had grown to 10 always-open sections —
// Insights (08-30) and Learnings (09-12) merged in, then a funnel diagram,
// a placement table and a non-payer board each landed as one more section,
// each with its own intro paragraph, none of it ever cut back. Fixed the
// way the daily digest fixed the same complaint on 09-12: one thing stays
// always open (the table itself, the one instrument), the "what changed
// and did it work" learnings still show as their own list because that IS
// the point of collecting cohorts, and the four things read rarely (the
// funnel diagram, live experiment list, placement table, non-payer board)
// collapse behind a <details> toggle — same data, one click away, not
// gone. "What we changed" (kind=experiment) and "Every other finding"
// (kind=analysis/infra_fix) used to be two sections with two intros for
// what is the same list read two ways; now one list, one intro, a kind
// badge per card.

import { db } from '@/lib/revenue-shared'
import { probBetter, nNeededPerArm } from '@/lib/bayes'
import XraySection from '@/components/admin/XraySection'
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
const LATTE = '#FEF7E7'
const GREEN = '#2E7D32'
const RED = '#B00020'
const AMBER = '#B26A00'

type CohortRow = {
  cohort_n: number
  opened_at: string
  last_arrival_at: string
  landed: number
  started: number
  completed: number
  clicked: number
  trials: number
}

const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : 0)
const fmtPct = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(0)}%` : '–')
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** The bar, translated to cohort scale: 10 trials/day at the trailing
 *  landing volume. Recomputed from the data so it tracks traffic. */
function trialsNeededPerCohort(rows: CohortRow[]): number {
  const closed = rows.filter(r => r.landed >= 100).slice(0, 14)
  if (closed.length < 2) return 8.5
  const first = new Date(closed[closed.length - 1].opened_at).getTime()
  const last = new Date(closed[0].last_arrival_at).getTime()
  const days = Math.max(1, (last - first) / 864e5)
  const landersPerDay = closed.reduce((s, r) => s + r.landed, 0) / days
  return landersPerDay > 0 ? (10 * 100) / landersPerDay : 8.5
}

interface LearningRow {
  id: number
  title: string
  hypothesis: string | null
  step: string
  applied_at_cohort: number
  predicted_delta_pts: number | null
  status: string
  notes: string | null
  links: { label: string; url: string }[] | null
  created_at: string
  before_cohorts: number | null
  before_num: number | null
  before_den: number | null
  after_cohorts: number | null
  after_num: number | null
  after_den: number | null
}

interface GeneralLearningRow {
  id: number
  title: string
  hypothesis: string | null
  kind: 'experiment' | 'analysis' | 'infra_fix'
  status: 'open' | 'confirmed' | 'refuted' | 'abandoned'
  step: string | null
  applied_at_cohort: number | null
  notes: string | null
  links: { label: string; url: string }[] | null
  created_at: string
}

const METRIC_LABEL: Record<string, string> = {
  checkout_click: 'checkout clicks (fast)',
  quiz_completed: 'quiz completion',
  net_new_paid: 'paid trials (ground truth, slow)',
}

const STEP_LABEL: Record<string, string> = {
  landed_to_started: 'landing → start',
  started_to_completed: 'start → finish',
  completed_to_clicked: 'finish → checkout',
  clicked_to_trial: 'checkout → trial',
  landed_to_trial: 'landing → trial',
}

const KIND_LABEL: Record<GeneralLearningRow['kind'], string> = {
  experiment: 'EXPERIMENT',
  analysis: 'ANALYSIS',
  infra_fix: 'DATA FIX',
}
const KIND_NOTE: Record<GeneralLearningRow['kind'], string> = {
  experiment: 'an on-page test with a variant, verdict from the cohort pool',
  analysis: 'a pattern found in the data, nothing shipped yet to act on it',
  infra_fix: 'a correction to how a number itself was computed',
}
const STATUS_COLOR: Record<string, string> = { open: AMBER, confirmed: GREEN, refuted: RED, abandoned: MUTE, WAITING: MUTE, CONFIRMED: GREEN, REFUTED: RED, OPEN: AMBER }

// One shared shape so "what changed" (has a Bayesian verdict) and "every
// other finding" (a plain status) render as ONE list, one card component,
// instead of two sections that used to each explain themselves.
type Finding = {
  id: string
  kind: GeneralLearningRow['kind']
  title: string
  hypothesis: string | null
  notes: string | null
  links: { label: string; url: string }[] | null
  createdAt: string
  step: string | null
  appliedAtCohort: number | null
  verdictBadge: string
  verdictColor: string
  verdictDetail: string | null
  evidence: string | null
}

const summaryStyle: React.CSSProperties = { cursor: 'pointer', fontSize: 17, fontWeight: 800, color: INK, listStyle: 'none' }

export default async function CohortsPage() {
  let rows: CohortRow[] = []
  let learnings: LearningRow[] = []
  let general: GeneralLearningRow[] = []
  let runningExps: { key: string; name: string; page: string; primary_metric: string; variants: { key: string; weight?: number; approved?: boolean }[] }[] = []
  let err: string | null = null
  try {
    const [cohorts, learn, all, exps] = await Promise.all([
      db().from('funnel_cohort_stats').select('*').order('cohort_n', { ascending: false }).limit(30),
      db().from('cohort_learning_evidence').select('*').order('applied_at_cohort', { ascending: false }),
      db().from('cohort_learnings').select('id, title, hypothesis, kind, status, step, applied_at_cohort, notes, links, created_at')
        .in('kind', ['analysis', 'infra_fix']).order('created_at', { ascending: false }),
      db().from('experiments').select('key, name, page, primary_metric, variants').eq('status', 'running'),
    ])
    if (cohorts.error) throw new Error(cohorts.error.message)
    if (learn.error) throw new Error(learn.error.message)
    if (all.error) throw new Error(all.error.message)
    rows = (cohorts.data ?? []) as CohortRow[]
    learnings = (learn.data ?? []) as LearningRow[]
    general = (all.data ?? []) as GeneralLearningRow[]
    runningExps = (exps.data ?? []) as typeof runningExps
  } catch (e) { err = e instanceof Error ? e.message : String(e) }

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

  // Both sides of the same board (owner, 2026-09-15, then again 2026-09-18:
  // "abbiamo bisogno sia di chi non paga sia di chi paga"). Reached
  // checkout, no charge — the one non-paying segment where "why" is
  // answerable at all. Paired with who DID pay, same shape.
  let declines: DeclineRow[] = []
  let paid: PaidRow[] = []
  try {
    ;[declines, paid] = await Promise.all([getCheckoutDeclines(14, 80), getPaidTrials(14, 60)])
  } catch { /* degrades to empty */ }

  if (err) {
    return <div style={{ padding: 26 }}><h1 style={{ fontWeight: 800, fontSize: 24 }}>Cohorts</h1><p style={{ color: RED }}>{err}</p></div>
  }

  const closed = rows.filter(r => r.landed >= 100)
  const baseline = closed.slice(1, 11)
  const avg = (f: (r: CohortRow) => number) => (baseline.length ? baseline.reduce((s, r) => s + f(r), 0) / baseline.length : 0)
  const base = {
    start: avg(r => pct(r.started, r.landed)),
    complete: avg(r => pct(r.completed, r.started)),
    click: avg(r => pct(r.clicked, r.completed)),
    pay: avg(r => pct(r.trials, r.clicked)),
    trials: avg(r => r.trials),
  }
  const needed = trialsNeededPerCohort(rows)

  // One list, one card, whichever of the two tables it came from.
  const findings: Finding[] = [
    ...learnings.map((l): Finding => {
      const bN = Number(l.before_den || 0), bK = Number(l.before_num || 0)
      const aN = Number(l.after_den || 0), aK = Number(l.after_num || 0)
      const bPct = bN > 0 ? (bK / bN) * 100 : 0
      const aPct = aN > 0 ? (aK / aN) * 100 : 0
      const hasEvidence = bN > 0 && aN > 0
      const p = hasEvidence ? probBetter(aK, aN, bK, bN) : 0.5
      const verdict = !hasEvidence ? 'WAITING' : p >= 0.95 ? 'CONFIRMED' : p <= 0.05 ? 'REFUTED' : 'OPEN'
      const target = Number(l.predicted_delta_pts || 5)
      const need = nNeededPerArm(bN > 0 ? bK / bN : 0.5, target)
      const shortBy = Math.max(0, need - aN)
      const evidence = bN > 0 || aN > 0
        ? `before ${bN > 0 ? `${bPct.toFixed(1)}%` : '—'} (${bK}/${bN}) · after ${aN > 0 ? `${aPct.toFixed(1)}%` : '—'} (${aK}/${aN})`
          + (hasEvidence ? ` · ${(aPct - bPct) >= 0 ? '+' : ''}${(aPct - bPct).toFixed(1)}pts · P(better) ${(p * 100).toFixed(0)}%` : '')
        : null
      return {
        id: `exp-${l.id}`, kind: 'experiment', title: l.title, hypothesis: l.hypothesis, notes: l.notes,
        links: l.links, createdAt: l.created_at, step: l.step, appliedAtCohort: l.applied_at_cohort,
        verdictBadge: verdict, verdictColor: STATUS_COLOR[verdict],
        verdictDetail: verdict !== 'CONFIRMED' && verdict !== 'REFUTED'
          ? (aN === 0 ? `No completed cohort since cohort ${l.applied_at_cohort} yet.` : `Needs ~${need.toLocaleString()} on this step for ${target}pts, ${shortBy.toLocaleString()} short.`)
          : null,
        evidence,
      }
    }),
    ...general.map((r): Finding => ({
      id: `gen-${r.id}`, kind: r.kind, title: r.title, hypothesis: r.hypothesis, notes: r.notes,
      links: r.links, createdAt: r.created_at, step: r.step, appliedAtCohort: r.applied_at_cohort,
      verdictBadge: r.status.toUpperCase(), verdictColor: STATUS_COLOR[r.status], verdictDetail: null, evidence: null,
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, textAlign: 'right', padding: '7px 8px' }
  const td: React.CSSProperties = { fontSize: 12.5, padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  // A rate cell colors against the trailing-ten baseline: 10+ points up is
  // green, 10+ down is red — the same movement the watcher alarms on at 20.
  const rateCell = (now: number, baseVal: number) => {
    const delta = now - baseVal
    const color = delta >= 10 ? GREEN : delta <= -10 ? RED : INK
    return { ...td, color, fontWeight: Math.abs(delta) >= 10 ? 800 : 400 }
  }

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 1100 }}>
      <div className="flex items-baseline flex-wrap" style={{ gap: 10 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Cohorts &amp; learnings</h1>
        <a href="/admin/experiments" style={{ fontSize: 12.5, fontWeight: 700, color: '#046BB1' }}>manage a test →</a>
      </div>
      <p style={{ fontSize: 12, color: MUTE, marginTop: 4, maxWidth: 860 }}>
        The bar: 10 trials/day = <strong style={{ color: AMBER }}>{needed.toFixed(1)}</strong> per cohort at current traffic,
        trailing ten average <strong style={{ color: INK }}>{base.trials.toFixed(1)}</strong>. Green/red cells run 10+ points
        off that baseline.
      </p>

      <div style={{ overflowX: 'auto', marginTop: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${INK}` }}>
              <th style={{ ...th, textAlign: 'left' }}>Cohort</th>
              <th style={{ ...th, textAlign: 'left' }}>Window</th>
              <th style={th}>Landed</th>
              <th style={th}>Started</th>
              <th style={th}>Start %</th>
              <th style={th}>Done</th>
              <th style={th}>Done %</th>
              <th style={th}>Clicked</th>
              <th style={th}>Click %</th>
              <th style={th}>Trials</th>
              <th style={th}>Pay %</th>
              <th style={{ ...th, borderLeft: `2px solid ${INK}` }}>vs bar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const open = r.landed < 100
              const gap = r.trials - needed
              return (
                <tr key={r.cohort_n} style={{ borderBottom: `1px solid ${HAIR}`, background: open ? LATTE : undefined }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>#{r.cohort_n}{open ? ' · filling' : ''}</td>
                  <td style={{ ...td, textAlign: 'left', color: MUTE, whiteSpace: 'nowrap' }}>{fmtDay(r.opened_at)} → {fmtDay(r.last_arrival_at)}</td>
                  <td style={td}>{r.landed}</td>
                  <td style={td}>{r.started}</td>
                  <td style={rateCell(pct(r.started, r.landed), base.start)}>{fmtPct(r.started, r.landed)}</td>
                  <td style={td}>{r.completed}</td>
                  <td style={rateCell(pct(r.completed, r.started), base.complete)}>{fmtPct(r.completed, r.started)}</td>
                  <td style={td}>{r.clicked}</td>
                  <td style={rateCell(pct(r.clicked, r.completed), base.click)}>{fmtPct(r.clicked, r.completed)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{r.trials}</td>
                  <td style={rateCell(pct(r.trials, r.clicked), base.pay)}>{fmtPct(r.trials, r.clicked)}</td>
                  <td style={{ ...td, borderLeft: `2px solid ${INK}`, color: open ? MUTE : gap >= 0 ? GREEN : RED, fontWeight: 700 }}>
                    {open ? '–' : gap >= 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 10.5, color: MUTE, marginTop: 8, maxWidth: 860 }}>
        Same-person rates, quiz-earned trials only (not-quiz sales are on the revenue screens). The cream row is still filling.
      </p>

      {/* THE LEARNING ENGINE. A cohort is an increment of evidence, never a
          test on its own — 100 landers yields 0-3 trials, so N vs N-1
          resolves nothing. Evidence pools from the change forward against a
          bounded ten-cohort control; the verdict reads the pool. One list
          for both a shipped test's Bayesian verdict and a plain finding
          with no variant to ship (a data pattern, a fix to what a number
          meant) — same card, the kind badge says which. */}
      <section style={{ marginTop: 30 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: INK }}>
          Learnings <span style={{ color: MUTE, fontWeight: 600 }}>({findings.length})</span>
        </h2>
        {findings.length === 0 ? (
          <p style={{ fontSize: 12.5, color: MUTE, marginTop: 10 }}>Nothing recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {findings.map(f => (
              <div key={f.id} style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '12px 14px' }}>
                <div className="flex flex-wrap items-baseline" style={{ gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: f.verdictColor, border: `2px solid ${f.verdictColor}`, padding: '1px 6px' }}>
                    {f.verdictBadge}
                  </span>
                  <span title={KIND_NOTE[f.kind]} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: MUTE, background: LATTE, border: `1px solid ${HAIR}`, padding: '2px 6px' }}>
                    {KIND_LABEL[f.kind]}
                  </span>
                  <strong style={{ fontSize: 14, color: INK }}>{f.title}</strong>
                  <span style={{ fontSize: 11, color: MUTE, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    {fmtDate(f.createdAt)}{f.step && ` · ${STEP_LABEL[f.step] ?? f.step}`}
                  </span>
                </div>
                {f.hypothesis && <p style={{ fontSize: 12, color: '#4A4A4A', marginTop: 6, lineHeight: 1.55, maxWidth: 860 }}>{f.hypothesis}</p>}
                {f.evidence && <p style={{ fontSize: 12.5, color: INK, marginTop: 8 }}>{f.evidence}</p>}
                {f.verdictDetail && <p style={{ fontSize: 11.5, color: AMBER, marginTop: 7, fontWeight: 600 }}>{f.verdictDetail}</p>}
                {f.notes && <p style={{ fontSize: 11, color: MUTE, marginTop: 6 }}>{f.notes}</p>}
                {f.links && f.links.length > 0 && (
                  <div className="flex flex-wrap" style={{ gap: 12, marginTop: 6 }}>
                    {f.links.map(l => <a key={l.url} href={l.url} style={{ fontSize: 11, color: '#046BB1', fontWeight: 700 }}>{l.label} ↗</a>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Everything below is read rarely — collapsed by default, one click
          away, same data as before. Not deleted, just not always open. */}

      <details style={{ marginTop: 30 }}>
        <summary style={summaryStyle}>Funnel diagram</summary>
        <div style={{ marginTop: 14 }}><XraySection /></div>
      </details>

      <details style={{ marginTop: 18 }}>
        <summary style={summaryStyle}>Running right now ({runningExps.length})</summary>
        <p style={{ fontSize: 12, color: MUTE, marginTop: 8, marginBottom: 4, maxWidth: 720 }}>
          A quick pointer, not the tool for managing a test — that's still /admin/experiments. Each variant
          shows the SHARE of that test's traffic it gets, not its own conversion rate.
        </p>
        {runningExps.length === 0 ? (
          <p style={{ fontSize: 12.5, color: MUTE, marginTop: 10 }}>Nothing running. Ship-and-watch instead, or start one on /admin/experiments.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {runningExps.map(e => (
              <div key={e.key} style={{ border: `1px solid ${HAIR}`, padding: '9px 12px', fontSize: 12.5 }}>
                <strong style={{ color: INK }}>{e.name}</strong>
                <span style={{ color: MUTE, marginLeft: 6 }}>on {e.page}, decided by {METRIC_LABEL[e.primary_metric] ?? e.primary_metric}</span>
                <div className="flex flex-wrap" style={{ gap: 12, marginTop: 4 }}>
                  {(e.variants ?? []).map(v => (
                    <span key={v.key} style={{ color: MUTE }}>
                      <strong style={{ color: INK }}>{v.key}</strong>{typeof v.weight === 'number' ? ` · gets ${Math.round(v.weight * 100)}% of traffic` : ''}
                      {v.approved === false ? ' · not approved yet' : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </details>

      <details style={{ marginTop: 18 }}>
        <summary style={summaryStyle}>Which placement actually sells</summary>
        <p style={{ fontSize: 12, color: MUTE, marginTop: 8, marginBottom: 4, maxWidth: 720 }}>
          For every button on the result page: how many people saw it, clicked it, and of those, how many
          went on to pay (quiz-earned, net-new or an existing customer buying again).
        </p>
        <div style={{ marginTop: 10 }}><CtaClickedTable placements={placements} /></div>
      </details>

      {/* Owner, 2026-09-18: "abbiamo bisogno sia di chi non paga sia di chi
          paga" — the declines board below only ever showed half the
          picture. Same per-person shape, same source (lib/buyer-behavior.ts's
          anon_id resolution, run for many people instead of one dossier at
          a time): source, country, quiz level, timing, which button. */}
      <details style={{ marginTop: 18 }}>
        <summary style={summaryStyle}>Paid ({paid.length})</summary>
        <p style={{ fontSize: 12, color: MUTE, marginTop: 8, marginBottom: 10, maxWidth: 720 }}>
          Last 14 days, quiz-earned trials. &ldquo;No click&rdquo; means no on-site checkout button precedes the charge —
          a real pattern (about 1 in 7), most often a direct or held-rate email link. Click a name for their full Behavior tab.
        </p>
        {paid.length === 0 ? (
          <p style={{ fontSize: 13, color: MUTE }}>No qualifying rows in the last 14 days, or the data failed to load.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${HAIR}` }}>
                  <th style={{ ...th, textAlign: 'left' }}>Person</th>
                  <th style={{ ...th, textAlign: 'left' }}>Country</th>
                  <th style={{ ...th, textAlign: 'left' }}>Stage</th>
                  <th style={{ ...th, textAlign: 'left' }}>Source</th>
                  <th style={th}>Landing dwell</th>
                  <th style={th}>Quiz fill</th>
                  <th style={{ ...th, textAlign: 'left' }}>Button</th>
                  <th style={th}>Trial</th>
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
                    <td style={{ ...td, textAlign: 'left', color: p.clickPlacement ? INK : AMBER, fontWeight: p.clickPlacement ? 400 : 700 }}>
                      {p.clickPlacement ? humanizePlacement(p.clickPlacement) : 'No click'}
                    </td>
                    <td style={{ ...td, fontWeight: 800, color: GREEN }}>${(p.trialCents / 100).toFixed(2)} <span style={{ color: MUTE, fontWeight: 400 }}>{fmtDay(p.trialAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details style={{ marginTop: 18 }}>
        <summary style={summaryStyle}>Reached checkout, didn&rsquo;t pay ({declines.length})</summary>
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
      </details>
    </div>
  )
}
