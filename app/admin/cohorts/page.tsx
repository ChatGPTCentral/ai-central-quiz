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

export default async function CohortsPage() {
  let rows: CohortRow[] = []
  let err: string | null = null
  try {
    const { data, error } = await db()
      .from('funnel_cohort_stats')
      .select('*')
      .order('cohort_n', { ascending: false })
      .limit(30)
    if (error) throw new Error(error.message)
    rows = (data ?? []) as CohortRow[]
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
