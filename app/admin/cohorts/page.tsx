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
// CUT DOWN AGAIN 2026-09-18, same day as the last rebuild (owner: "quelli
// che hai scritto non sono learnings ma blob senza senso" / "il learning o
// esiste oppure no"). The <details>-collapsed compromise from hours earlier
// wasn't the fix — the page still tried to be five things. Now it is two:
// the cohort table, and a list of CONCLUDED learnings, one line each. A
// learning with no verdict yet (WAITING/OPEN) is not a learning, it is an
// experiment still running — it belongs on /admin/experiments, not here,
// and does not render in this list at all until it resolves.
//
// Moved out, each for its own reason:
//   - Funnel diagram (XraySection) — deleted outright, owner: "non è utile".
//   - "Running right now" — deleted from here, owner: "vive solo dentro
//     experiments". /admin/experiments already lists every experiment,
//     running ones first; this was the same fact, twice.
//   - "Which placement sells" + the Paid/Declined boards — moved to
//     /admin/insights (owner: "un luogo diverso"), which this page does not
//     reach into. Not deleted, not duplicated, just not here.

import { db } from '@/lib/revenue-shared'
import { probBetter, nNeededPerArm } from '@/lib/bayes'

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
  step: string
  applied_at_cohort: number
  status: string
  links: { label: string; url: string }[] | null
  created_at: string
  before_num: number | null
  before_den: number | null
  after_num: number | null
  after_den: number | null
}

interface GeneralLearningRow {
  id: number
  title: string
  kind: 'experiment' | 'analysis' | 'infra_fix'
  status: 'open' | 'confirmed' | 'refuted' | 'abandoned'
  links: { label: string; url: string }[] | null
  created_at: string
}

const KIND_LABEL: Record<GeneralLearningRow['kind'], string> = { experiment: 'TEST', analysis: 'FOUND', infra_fix: 'FIX' }

// A learning either exists or it doesn't (owner, 2026-09-18). Only a
// resolved verdict counts as existing — an open hypothesis or a still-
// running test is not a learning yet, it's just not decided, and lives on
// /admin/experiments until it is.
type Verdict = 'CONFIRMED' | 'REFUTED'
const VERDICT_COLOR: Record<Verdict, string> = { CONFIRMED: GREEN, REFUTED: RED }

type Learning = {
  id: string
  kind: GeneralLearningRow['kind']
  verdict: Verdict
  title: string
  evidence: string | null
  date: string
  links: { label: string; url: string }[] | null
}

export default async function CohortsPage() {
  let rows: CohortRow[] = []
  let learnings: LearningRow[] = []
  let general: GeneralLearningRow[] = []
  let err: string | null = null
  try {
    const [cohorts, learn, all] = await Promise.all([
      db().from('funnel_cohort_stats').select('*').order('cohort_n', { ascending: false }).limit(30),
      db().from('cohort_learning_evidence').select('id, title, step, applied_at_cohort, status, links, created_at, before_num, before_den, after_num, after_den').order('applied_at_cohort', { ascending: false }),
      db().from('cohort_learnings').select('id, title, kind, status, links, created_at')
        .in('kind', ['analysis', 'infra_fix']).order('created_at', { ascending: false }),
    ])
    if (cohorts.error) throw new Error(cohorts.error.message)
    if (learn.error) throw new Error(learn.error.message)
    if (all.error) throw new Error(all.error.message)
    rows = (cohorts.data ?? []) as CohortRow[]
    learnings = (learn.data ?? []) as LearningRow[]
    general = (all.data ?? []) as GeneralLearningRow[]
  } catch (e) { err = e instanceof Error ? e.message : String(e) }

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

  // Only CONFIRMED or REFUTED survive into this list — see the file header.
  const learningsResolved: Learning[] = learnings.flatMap((l): Learning[] => {
    const bN = Number(l.before_den || 0), bK = Number(l.before_num || 0)
    const aN = Number(l.after_den || 0), aK = Number(l.after_num || 0)
    if (bN === 0 || aN === 0) return []
    const bPct = (bK / bN) * 100, aPct = (aK / aN) * 100
    const p = probBetter(aK, aN, bK, bN)
    const verdict: Verdict | null = p >= 0.95 ? 'CONFIRMED' : p <= 0.05 ? 'REFUTED' : null
    if (!verdict) return []
    return [{
      id: `exp-${l.id}`, kind: 'experiment', verdict, title: l.title,
      evidence: `${bPct.toFixed(1)}% → ${aPct.toFixed(1)}% (${(aPct - bPct) >= 0 ? '+' : ''}${(aPct - bPct).toFixed(1)}pts, P ${(p * 100).toFixed(0)}%)`,
      date: fmtDay(l.created_at), links: l.links,
    }]
  })
  const learningsGeneral: Learning[] = general
    .filter((r): r is GeneralLearningRow & { status: 'confirmed' | 'refuted' } => r.status === 'confirmed' || r.status === 'refuted')
    .map(r => ({ id: `gen-${r.id}`, kind: r.kind, verdict: r.status.toUpperCase() as Verdict, title: r.title, evidence: null, date: fmtDay(r.created_at), links: r.links }))
  const resolvedLearnings = [...learningsResolved, ...learningsGeneral].sort((a, b) => (a.date < b.date ? 1 : -1))

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
        <a href="/admin/experiments" style={{ fontSize: 12.5, fontWeight: 700, color: '#046BB1' }}>manage or watch a running test →</a>
        <a href="/admin/insights" style={{ fontSize: 12.5, fontWeight: 700, color: '#046BB1' }}>which placement sells, who paid →</a>
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

      {/* A learning here means CONCLUDED — CONFIRMED or REFUTED, nothing
          still open or waiting on more traffic. One line each. */}
      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: INK }}>
          Learnings <span style={{ color: MUTE, fontWeight: 600 }}>({resolvedLearnings.length})</span>
        </h2>
        {resolvedLearnings.length === 0 ? (
          <p style={{ fontSize: 12.5, color: MUTE, marginTop: 10 }}>Nothing has resolved yet. Open tests are on /admin/experiments.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10 }}>
            {resolvedLearnings.map(l => (
              <div key={l.id} className="flex flex-wrap items-baseline" style={{ gap: 8, padding: '7px 0', borderBottom: `1px solid ${HAIR}` }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: VERDICT_COLOR[l.verdict], border: `1.5px solid ${VERDICT_COLOR[l.verdict]}`, padding: '1px 5px' }}>
                  {l.verdict}
                </span>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: MUTE }}>{KIND_LABEL[l.kind]}</span>
                <strong style={{ fontSize: 13, color: INK }}>{l.title}</strong>
                {l.evidence && <span style={{ fontSize: 12, color: MUTE, fontVariantNumeric: 'tabular-nums' }}>{l.evidence}</span>}
                <span style={{ fontSize: 11, color: MUTE, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{l.date}</span>
                {l.links && l.links.length > 0 && l.links.map(link => (
                  <a key={link.url} href={link.url} style={{ fontSize: 11, color: '#046BB1', fontWeight: 700, whiteSpace: 'nowrap' }}>{link.label} ↗</a>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
