// The daily routine, live (owner, 2026-08-24, Monday sweep): "ci dobbiamo
// ossessionare con il fare 10+ trial al giorno ... ogni volta che una
// routine ritorna sotto le 10 trial, noi esploriamo e guardiamo posthog ...
// perche tutti i dati di posthog non ci stanno indicando cosa fare."
//
// One card per day, written by app/api/cron/daily-digest each morning (see
// lib/daily-digest.ts for what it computes). The synthesis is prose on top
// of real numbers, never instead of them — every card opens onto the same
// tables the synthesis was written from, so a claim in the text is always
// checkable (owner's cardinal rule: a number he cannot find on a screen is
// a number he cannot trust).
//
// Every "last / this" pair carries its own real date, not the word alone
// (owner: "cos'e scorsa e questa" — the first version gave him nothing to
// anchor those words to). The daily funnel is always shown; the weekly one
// and the source breakdown only render on the Monday card (owner: "mi fai
// un daily tutti i giorni e il lunedi al massimo mi fai il weekly").

import { createClient } from '@supabase/supabase-js'
import RunDigestNow from '@/components/admin/RunDigestNow.client'

export const dynamic = 'force-dynamic'

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const GREEN = '#2E7D32'
const RED = '#B00020'

interface TrendPoint { day: string; trials: number }
interface FunnelSnapshot { landing: number; started: number; completed: number; clicked: number }
interface DailyFunnel { yesterday: FunnelSnapshot; dayBefore: FunnelSnapshot; yesterdayDate: string; dayBeforeDate: string }
interface WeeklyFunnel { this_week: FunnelSnapshot; last_week: FunnelSnapshot; thisWeekRange: string; lastWeekRange: string }
interface SourceRow { source: string; this_week: number; last_week: number }
interface CohortTrace { windowDays: number; landed: number; completed: number; clickedCheckout: number; becameTrial: number }
interface TrialSums { thisWeek: number; lastWeek: number; thisMonth: number; lastMonth: number }
interface WeekToDate { thisWtd: number; lastWtd: number; daysIn: number }
interface CohortLearningSummary {
  id: number; title: string; step: string; status: string; predictedDeltaPts: number | null
  beforePct: number | null; afterPct: number | null; afterN: number; probBetter: number | null
}
interface RunningExperimentVariant { key: string; exposures: number; clickers: number; netNewPaid: number; completions: number }
interface RunningExperimentSummary {
  key: string; name: string; page: string; primaryMetric: string; startedAt: string | null
  variants: RunningExperimentVariant[]
}
interface UxPageRow {
  url: string; sessions: number; rage: number; dead: number; quickback: number; scriptErrors: number
  days: number; worstElement: string | null
}
interface DigestRow {
  day: string; ran_at: string; is_monday: boolean; trials_yesterday: number; bar: number; bar_hit: boolean
  trend: TrendPoint[]; daily_funnel: DailyFunnel; weekly_funnel: WeeklyFunnel; sources: SourceRow[]; cohort: CohortTrace
  // Nullable: rows written before 2026-08-27 have no yesterday-only trace / no sums.
  cohort_yesterday: CohortTrace | null
  trial_sums: TrialSums | null
  // Nullable: rows written before 2026-08-29 have none of this — the owner's
  // "porta tutto insieme, self-learn il funnel" ask (cohort learnings status,
  // running experiments status, PostHog UX signals, a proposed next test).
  week_to_date: WeekToDate | null
  cohort_learnings_snapshot: CohortLearningSummary[] | null
  experiments_snapshot: RunningExperimentSummary[] | null
  ux_signals: UxPageRow[] | null
  proposed_hypothesis: string | null
  headline: string; synthesis: string
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '–')
const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, padding: '5px 8px', textAlign: 'left' }
const td: React.CSSProperties = { fontSize: 12, padding: '5px 8px', fontVariantNumeric: 'tabular-nums' }

function FunnelTable({ leftLabel, rightLabel, left, right }: { leftLabel?: string; rightLabel?: string; left: FunnelSnapshot | null; right: FunnelSnapshot | null }) {
  if (!left || !right) return <p style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>Dati del funnel non disponibili per questo giorno.</p>
  const rows: { label: string; key: keyof FunnelSnapshot; base: keyof FunnelSnapshot | null }[] = [
    { label: 'Landing', key: 'landing', base: null },
    { label: 'Iniziano il quiz', key: 'started', base: 'landing' },
    { label: 'Completano il quiz', key: 'completed', base: 'started' },
    { label: 'Cliccano checkout', key: 'clicked', base: 'completed' },
  ]
  return (
    <table style={{ borderCollapse: 'collapse', marginTop: 8 }}>
      <thead><tr style={{ borderBottom: `2px solid ${INK}` }}>
        <th style={th}>Passo</th><th style={{ ...th, textAlign: 'right' }}>{leftLabel}</th><th style={{ ...th, textAlign: 'right' }}>{rightLabel}</th><th style={{ ...th, textAlign: 'right' }}>Tasso</th>
      </tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key} style={{ borderBottom: `1px solid ${HAIR}` }}>
            <td style={td}>{r.label}</td>
            <td style={{ ...td, textAlign: 'right' }}>{left[r.key]}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{right[r.key]}</td>
            <td style={{ ...td, textAlign: 'right', color: MUTE }}>{r.base ? pct(right[r.key], right[r.base]) : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SourcesTable({ sources, leftLabel, rightLabel }: { sources: SourceRow[]; leftLabel?: string; rightLabel?: string }) {
  return (
    <table style={{ borderCollapse: 'collapse', marginTop: 8 }}>
      <thead><tr style={{ borderBottom: `2px solid ${INK}` }}>
        <th style={th}>Fonte landing</th><th style={{ ...th, textAlign: 'right' }}>{leftLabel}</th><th style={{ ...th, textAlign: 'right' }}>{rightLabel}</th>
      </tr></thead>
      <tbody>
        {sources.slice(0, 10).map(s => (
          <tr key={s.source} style={{ borderBottom: `1px solid ${HAIR}` }}>
            <td style={td}>{s.source}</td>
            <td style={{ ...td, textAlign: 'right' }}>{s.last_week}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: s.this_week < s.last_week ? RED : undefined }}>{s.this_week}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Sparkline({ trend }: { trend: TrendPoint[] }) {
  const max = Math.max(10, ...trend.map(t => t.trials))
  return (
    <div className="flex items-end" style={{ gap: 3, height: 40, marginTop: 8 }}>
      {trend.map(t => (
        <div key={t.day} title={`${t.day}: ${t.trials} trial`}
          style={{ width: 8, height: Math.max(2, (t.trials / max) * 40), background: t.trials >= 10 ? GREEN : '#D8CBA8' }} />
      ))}
    </div>
  )
}

// The direct, permanent answer to "189 quiz completed, non c'e nessuna
// scusa" (owner, 2026-08-24) — traced person by person, not two head-counts.
// Owner, 2026-08-27: "aggiungi anche non solo quanti trial facciamo ogni
// giorno ma anche somma dei trial settimanali (vs last week) e somma dei
// trial mensili (vs last month)". Both sums come from the same trial_ledger
// read the sparkline already uses (lib/daily-digest.ts trialsByDay), so
// this can never disagree with the sparkline about what happened on a
// given day, only summarize it differently.
function SumPair({ label, thisPeriod, lastPeriod }: { label: string; thisPeriod: number; lastPeriod: number }) {
  const delta = thisPeriod - lastPeriod
  const deltaColor = delta > 0 ? GREEN : delta < 0 ? RED : MUTE
  return (
    <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '7px 12px', minWidth: 140 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: MUTE }}>{label}</div>
      <div className="flex items-baseline flex-wrap" style={{ gap: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: INK }}>{thisPeriod}</span>
        <span style={{ fontSize: 10.5, color: MUTE }}>vs {lastPeriod} prima</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: deltaColor }}>{delta > 0 ? '+' : ''}{delta}</span>
      </div>
    </div>
  )
}

function TrialSumsStrip({ sums }: { sums: TrialSums | null }) {
  if (!sums) return <p style={{ fontSize: 11, color: MUTE, marginTop: 10 }}>Somme settimana/mese non disponibili per questo giorno (aggiunto il 2026-08-27).</p>
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTE, marginBottom: 6 }}>
        Somma trial, contro il periodo uguale precedente
      </div>
      <div className="flex flex-wrap" style={{ gap: 8 }}>
        <SumPair label="Ultimi 7 giorni" thisPeriod={sums.thisWeek} lastPeriod={sums.lastWeek} />
        <SumPair label="Ultimi 30 giorni" thisPeriod={sums.thisMonth} lastPeriod={sums.lastMonth} />
      </div>
    </div>
  )
}

// Same table twice on one page, two different windows: the badge is what
// tells them apart at a glance (2026-08-27, see the commit that added the
// first one — this generalizes it rather than duplicating the JSX for the
// yesterday-only trace added right after it).
function CohortStrip({
  cohort, badge, badgeColor, missingLabel, footnote,
}: {
  cohort: CohortTrace | null
  badge: string
  badgeColor: string
  missingLabel: string
  footnote?: string
}) {
  if (!cohort) return <p style={{ fontSize: 11, color: MUTE, marginTop: 10 }}>{missingLabel}</p>
  const step = (label: string, value: number, base: number | null) => (
    <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '7px 12px', minWidth: 110 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: MUTE }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>{value}</div>
      {base !== null && <div style={{ fontSize: 10, color: MUTE }}>{pct(value, base)} dei precedenti</div>}
    </div>
  )
  return (
    <div style={{ marginTop: 10 }}>
      <span style={{
        display: 'inline-block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '.06em', color: '#FFFDFA', background: badgeColor, padding: '3px 9px', marginBottom: 8,
      }}>
        {badge}
      </span>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTE, marginBottom: 6 }}>
        Stessa persona, dal quiz al trial, in ordine
      </div>
      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        {step('Hanno visto', cohort.landed, null)}
        <span style={{ color: MUTE }}>→</span>
        {step('Hanno completato il quiz', cohort.completed, cohort.landed)}
        <span style={{ color: MUTE }}>→</span>
        {step('Hanno cliccato checkout', cohort.clickedCheckout, cohort.completed)}
        <span style={{ color: MUTE }}>→</span>
        {step('Sono diventati trial', cohort.becameTrial, cohort.clickedCheckout)}
      </div>
      {footnote && <p style={{ fontSize: 10.5, color: MUTE, marginTop: 6, maxWidth: 480 }}>{footnote}</p>}
    </div>
  )
}

// Owner, 2026-08-29: "voglio portare tutto nel digest ... self-learn il
// funnel". Four new sections below, each reading a real source this project
// already has, none re-derived: cohort learnings (lib/bayes.ts's sampler,
// same one /admin/cohorts uses), running experiments (experiment_results(),
// same function /admin/experiments uses), PostHog UX signals (uxByPage(),
// same query /admin/experiments already renders), and a proposed next
// hypothesis the synthesis writes ONLY when today's data clearly supports
// one — never auto-declared as a real cohort_learnings row, that stays a
// deliberate act.

function WeekToDateStrip({ wtd }: { wtd: WeekToDate | null }) {
  if (!wtd) return null
  const delta = wtd.thisWtd - wtd.lastWtd
  const deltaColor = delta > 0 ? GREEN : delta < 0 ? RED : MUTE
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTE, marginBottom: 6 }}>
        Settimana ad oggi (lunedì → oggi, {wtd.daysIn} {wtd.daysIn === 1 ? 'giorno' : 'giorni'}) contro gli stessi giorni la settimana scorsa
      </div>
      <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '7px 12px', minWidth: 140, display: 'inline-block' }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: INK }}>{wtd.thisWtd}</span>
        <span style={{ fontSize: 10.5, color: MUTE, marginLeft: 6 }}>vs {wtd.lastWtd} prima</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: deltaColor, marginLeft: 6 }}>{delta > 0 ? '+' : ''}{delta}</span>
      </div>
    </div>
  )
}

function CohortLearningsSection({ learnings }: { learnings: CohortLearningSummary[] | null }) {
  if (!learnings || learnings.length === 0) return null
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTE, marginBottom: 6 }}>
        Cohort learning aperti ({learnings.length}) — <a href="/admin/cohorts" style={{ color: MUTE }}>vedi /admin/cohorts</a>
      </div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {learnings.map(l => {
          const verdict = l.probBetter === null ? 'in attesa' : l.probBetter >= 0.95 ? 'confermato' : l.probBetter <= 0.05 ? 'smentito' : 'aperto'
          const vColor = verdict === 'confermato' ? GREEN : verdict === 'smentito' ? RED : MUTE
          return (
            <div key={l.id} style={{ border: `1px solid ${HAIR}`, padding: '7px 10px', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: INK }}>{l.title}</span>
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: vColor, textTransform: 'uppercase' }}>{verdict}</span>
              <div style={{ color: MUTE, marginTop: 2 }}>
                passo {l.step} · prima {l.beforePct !== null ? `${l.beforePct.toFixed(1)}%` : 'n/d'} · dopo {l.afterPct !== null ? `${l.afterPct.toFixed(1)}%` : 'n/d'} su {l.afterN}
                {l.probBetter !== null && ` · probabilità migliorato ${(l.probBetter * 100).toFixed(0)}%`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ExperimentsSection({ experiments }: { experiments: RunningExperimentSummary[] | null }) {
  if (!experiments || experiments.length === 0) return null
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTE, marginBottom: 6 }}>
        Experiment attivi ({experiments.length}) — <a href="/admin/experiments" style={{ color: MUTE }}>vedi /admin/experiments</a>
      </div>
      <div className="flex flex-col" style={{ gap: 6 }}>
        {experiments.map(e => (
          <div key={e.key} style={{ border: `1px solid ${HAIR}`, padding: '7px 10px', fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: INK }}>{e.name}</span>
            <span style={{ color: MUTE, marginLeft: 6 }}>({e.page}, metrica {e.primaryMetric})</span>
            <div className="flex flex-wrap" style={{ gap: 12, marginTop: 3 }}>
              {e.variants.map(v => (
                <span key={v.key} style={{ color: MUTE }}>
                  <strong style={{ color: INK }}>{v.key}</strong>: {v.exposures} visti, {v.netNewPaid} trial
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function UxSignalsSection({ rows }: { rows: UxPageRow[] | null }) {
  if (!rows || rows.length === 0) return null
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTE, marginBottom: 6 }}>
        Segnali PostHog, ultimi {rows[0]?.days ?? 7} giorni (rage click, click a vuoto, errori — non le registrazioni stesse)
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead><tr style={{ borderBottom: `2px solid ${INK}` }}>
          <th style={th}>Pagina</th><th style={{ ...th, textAlign: 'right' }}>Sessioni</th>
          <th style={{ ...th, textAlign: 'right' }}>Rage</th><th style={{ ...th, textAlign: 'right' }}>Vuoti</th>
          <th style={{ ...th, textAlign: 'right' }}>Errori</th><th style={th}>Peggiore</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.url} style={{ borderBottom: `1px solid ${HAIR}` }}>
              <td style={td}>{r.url}</td>
              <td style={{ ...td, textAlign: 'right' }}>{r.sessions}</td>
              <td style={{ ...td, textAlign: 'right', color: r.rage > 0 ? RED : undefined }}>{r.rage}</td>
              <td style={{ ...td, textAlign: 'right', color: r.dead > 0 ? RED : undefined }}>{r.dead}</td>
              <td style={{ ...td, textAlign: 'right', color: r.scriptErrors > 0 ? RED : undefined }}>{r.scriptErrors}</td>
              <td style={{ ...td, color: MUTE }}>{r.worstElement ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProposedHypothesisBox({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div style={{ marginTop: 10, border: `2px solid #8A5A00`, background: '#FFF6E0', padding: '9px 12px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: '#8A5A00', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        Ipotesi proposta oggi, non ancora dichiarata
      </div>
      <p style={{ fontSize: 12.5, color: INK, marginTop: 4, lineHeight: 1.5 }}>{text}</p>
    </div>
  )
}

export default async function DigestPage() {
  const { data } = await db().from('daily_digests').select('*').order('day', { ascending: false }).limit(30)
  const digests = (data ?? []) as DigestRow[]

  return (
    <div style={{ padding: '22px 26px 60px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Daily digest</h1>
      <p style={{ fontSize: 12.5, color: MUTE, marginTop: 6, maxWidth: 760, lineHeight: 1.6 }}>
        Ogni mattina, automatico: il trend dei trial, il tracciamento quiz-completato → trial, il funnel di ieri
        contro il giorno prima. Il lunedì, in più, il funnel e le fonti settimana contro settimana. La sintesi è
        un commento sui numeri, i numeri sotto restano quelli veri.
      </p>
      <div style={{ marginTop: 12 }}><RunDigestNow /></div>

      {digests.length === 0 && (
        <p style={{ marginTop: 20, fontSize: 13, color: MUTE }}>Nessun digest ancora. Premi &ldquo;Rifai adesso&rdquo; per il primo.</p>
      )}

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {digests.map(d => (
          <div key={d.day} style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '16px 18px' }}>
            <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>{d.day}{d.is_monday ? ' · lunedì' : ''}</span>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '2px 8px', color: '#FFFDFA',
                background: d.bar_hit ? GREEN : RED,
              }}>
                {d.trials_yesterday} / {d.bar} {d.bar_hit ? 'raggiunta' : 'mancata'}
              </span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: INK, marginTop: 10 }}>{d.headline}</p>
            <p style={{ fontSize: 13, color: '#333', marginTop: 6, lineHeight: 1.6, maxWidth: 760 }}>{d.synthesis}</p>
            <Sparkline trend={d.trend} />
            <TrialSumsStrip sums={d.trial_sums} />
            <CohortStrip
              cohort={d.cohort_yesterday}
              badge={`Ieri: ${d.daily_funnel?.yesterdayDate ?? d.day}`}
              badgeColor={GREEN}
              missingLabel="Tracciamento del solo ieri non disponibile per questo giorno (aggiunto il 2026-08-27, righe piu vecchie non lo hanno)."
              footnote="Chi ha completato ieri ha avuto un solo giorno per comprare. Il numero di trial sale ancora nei prossimi giorni, non e' il conteggio finale."
            />
            <CohortStrip
              cohort={d.cohort}
              badge={`Non oggi: ultimi ${d.cohort?.windowDays ?? 7} giorni`}
              badgeColor="#8A5A00"
              missingLabel="Tracciamento non disponibile per questo giorno."
            />
            <WeekToDateStrip wtd={d.week_to_date} />
            <ProposedHypothesisBox text={d.proposed_hypothesis} />
            <CohortLearningsSection learnings={d.cohort_learnings_snapshot} />
            <ExperimentsSection experiments={d.experiments_snapshot} />
            <UxSignalsSection rows={d.ux_signals} />
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 11.5, fontWeight: 700, color: MUTE, cursor: 'pointer', userSelect: 'none' }}>Numeri verificabili</summary>
              <div className="flex flex-wrap" style={{ gap: 30 }}>
                <FunnelTable
                  leftLabel={d.daily_funnel?.dayBeforeDate} rightLabel={d.daily_funnel?.yesterdayDate}
                  left={d.daily_funnel?.dayBefore ?? null} right={d.daily_funnel?.yesterday ?? null}
                />
                {d.is_monday && (
                  <FunnelTable
                    leftLabel={d.weekly_funnel?.lastWeekRange} rightLabel={d.weekly_funnel?.thisWeekRange}
                    left={d.weekly_funnel?.last_week ?? null} right={d.weekly_funnel?.this_week ?? null}
                  />
                )}
                {d.is_monday && d.sources && (
                  <SourcesTable sources={d.sources} leftLabel={d.weekly_funnel?.lastWeekRange} rightLabel={d.weekly_funnel?.thisWeekRange} />
                )}
              </div>
            </details>
          </div>
        ))}
      </div>
    </div>
  )
}
