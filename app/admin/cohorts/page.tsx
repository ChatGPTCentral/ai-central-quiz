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
  hypothesis: string | null
  step: string
  applied_at_cohort: number
  predicted_delta_pts: number | null
  status: string
  notes: string | null
  before_cohorts: number | null
  before_num: number | null
  before_den: number | null
  after_cohorts: number | null
  after_num: number | null
  after_den: number | null
}

const STEP_LABEL: Record<string, string> = {
  landed_to_started: 'landing → start',
  started_to_completed: 'start → finish',
  completed_to_clicked: 'finish → checkout',
  clicked_to_trial: 'checkout → trial',
  landed_to_trial: 'landing → trial',
}

export default async function CohortsPage() {
  let rows: CohortRow[] = []
  let learnings: LearningRow[] = []
  let err: string | null = null
  try {
    const [cohorts, learn] = await Promise.all([
      db().from('funnel_cohort_stats').select('*').order('cohort_n', { ascending: false }).limit(30),
      db().from('cohort_learning_evidence').select('*').order('applied_at_cohort', { ascending: false }),
    ])
    if (cohorts.error) throw new Error(cohorts.error.message)
    if (learn.error) throw new Error(learn.error.message)
    rows = (cohorts.data ?? []) as CohortRow[]
    learnings = (learn.data ?? []) as LearningRow[]
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
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Cohorts</h1>

      {/* THE LEARNING ENGINE, above the table, because the table is the raw
          material and this is the point of collecting it.
          A cohort is an INCREMENT OF EVIDENCE, never a test on its own: at 100
          landers a cohort yields 0-3 trials, so cohort N against cohort N-1
          can resolve nothing. Evidence pools from the change forward against a
          bounded ten-cohort control, and the verdict is read off the pool. */}
      <section style={{ marginTop: 18, marginBottom: 30 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: INK }}>
          What we changed, and whether it worked <span style={{ color: MUTE, fontWeight: 600 }}>({learnings.length})</span>
        </h2>
        <p style={{ fontSize: 12.5, color: MUTE, marginTop: 5, maxWidth: 880, lineHeight: 1.6 }}>
          Each learning names ONE step it claims to move and the cohort it starts at. Every completed cohort after that
          adds people to the pool. The verdict reads the whole pool, never two adjacent cohorts. When it is still open,
          the row says how many more people that step needs, so &quot;not yet&quot; and &quot;never&quot; can be told apart.
        </p>
        {learnings.length === 0 ? (
          <p style={{ fontSize: 12.5, color: MUTE, marginTop: 10 }}>No learning declared yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {learnings.map(l => {
              const bN = Number(l.before_den || 0), bK = Number(l.before_num || 0)
              const aN = Number(l.after_den || 0), aK = Number(l.after_num || 0)
              const bPct = bN > 0 ? (bK / bN) * 100 : 0
              const aPct = aN > 0 ? (aK / aN) * 100 : 0
              const delta = aPct - bPct
              const hasEvidence = bN > 0 && aN > 0
              const p = hasEvidence ? probBetter(aK, aN, bK, bN) : 0.5
              // 95% both ways. Anything between is genuinely undecided, and
              // saying so is the whole job of this panel.
              const verdict = !hasEvidence ? 'WAITING' : p >= 0.95 ? 'CONFIRMED' : p <= 0.05 ? 'REFUTED' : 'OPEN'
              const vColor = verdict === 'CONFIRMED' ? GREEN : verdict === 'REFUTED' ? RED : verdict === 'OPEN' ? AMBER : MUTE
              const target = Number(l.predicted_delta_pts || 5)
              const need = nNeededPerArm(bN > 0 ? bK / bN : 0.5, target)
              const shortBy = Math.max(0, need - aN)
              return (
                <div key={l.id} style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '12px 14px' }}>
                  <div className="flex flex-wrap items-baseline" style={{ gap: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: vColor, border: `2px solid ${vColor}`, padding: '1px 6px' }}>
                      {verdict}
                    </span>
                    <strong style={{ fontSize: 14, color: INK }}>{l.title}</strong>
                    <span style={{ fontSize: 11, color: MUTE }}>
                      {STEP_LABEL[l.step] ?? l.step} · from cohort {l.applied_at_cohort}
                    </span>
                  </div>
                  {l.hypothesis && (
                    <p style={{ fontSize: 12, color: '#4A4A4A', marginTop: 6, lineHeight: 1.55, maxWidth: 840 }}>{l.hypothesis}</p>
                  )}
                  <div className="flex flex-wrap" style={{ gap: 22, marginTop: 9, fontSize: 12.5 }}>
                    <span>
                      <span style={{ color: MUTE }}>before </span>
                      <strong>{bN > 0 ? `${bPct.toFixed(1)}%` : '—'}</strong>
                      <span style={{ color: MUTE }}> ({bK}/{bN}, {l.before_cohorts ?? 0} cohorts)</span>
                    </span>
                    <span>
                      <span style={{ color: MUTE }}>after </span>
                      <strong>{aN > 0 ? `${aPct.toFixed(1)}%` : '—'}</strong>
                      <span style={{ color: MUTE }}> ({aK}/{aN}, {l.after_cohorts ?? 0} cohorts)</span>
                    </span>
                    {hasEvidence && (
                      <>
                        <span style={{ fontWeight: 800, color: delta >= 0 ? GREEN : RED }}>
                          {delta >= 0 ? '+' : ''}{delta.toFixed(1)} pts
                        </span>
                        <span style={{ color: MUTE }}>P(better) <strong style={{ color: INK }}>{(p * 100).toFixed(0)}%</strong></span>
                      </>
                    )}
                  </div>
                  {verdict !== 'CONFIRMED' && verdict !== 'REFUTED' && (
                    <p style={{ fontSize: 11.5, color: AMBER, marginTop: 7, fontWeight: 600 }}>
                      {aN === 0
                        ? `No completed cohort since the change yet. Evidence starts at cohort ${l.applied_at_cohort}.`
                        : `Needs about ${need.toLocaleString()} people on this step to resolve ${target} points. ${shortBy.toLocaleString()} short.`}
                    </p>
                  )}
                  {l.notes && <p style={{ fontSize: 11, color: MUTE, marginTop: 6 }}>{l.notes}</p>}
                </div>
              )
            })}
          </div>
        )}
      </section>
      <p style={{ fontSize: 13, color: MUTE, marginTop: 6, maxWidth: 860, lineHeight: 1.55 }}>
        Every 100 landers, in arrival order, is one cohort — about a day of traffic. Rates are same-person: a cohort
        member counts at a stage only if they reached it. Cells go <strong style={{ color: GREEN }}>green</strong> when a
        rate runs 10+ points above the trailing-ten baseline and <strong style={{ color: RED }}>red</strong> when 10+
        below; the watcher alarms at 20. <strong style={{ color: INK }}>The bar:</strong> 10 trials a day equals{' '}
        <strong style={{ color: AMBER }}>{needed.toFixed(1)} trials per cohort</strong> at current traffic; the trailing
        ten average {base.trials.toFixed(1)}.
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

      <p style={{ fontSize: 11, color: MUTE, marginTop: 10, maxWidth: 860, lineHeight: 1.5 }}>
        Trials here are quiz-earned (linked through the cohort member&rsquo;s own submission), so this table measures what
        the FUNNEL converts; not-quiz sales land on the revenue screens. The open cohort (cream row) is still filling and
        its rates are provisional. Assignment runs every 15 minutes inside the bandit cron; the watcher&rsquo;s
        cohort_regression check reads this same view and names any stage that falls 20+ points under baseline.
      </p>
    </div>
  )
}
