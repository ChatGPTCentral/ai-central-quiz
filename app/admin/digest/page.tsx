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
interface CohortTrace { windowDays: number; completed: number; clickedCheckout: number; becameTrial: number }
interface DigestRow {
  day: string; ran_at: string; is_monday: boolean; trials_yesterday: number; bar: number; bar_hit: boolean
  trend: TrendPoint[]; daily_funnel: DailyFunnel; weekly_funnel: WeeklyFunnel; sources: SourceRow[]; cohort: CohortTrace
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

function FunnelTable({ leftLabel, rightLabel, left, right }: { leftLabel: string; rightLabel: string; left: FunnelSnapshot; right: FunnelSnapshot }) {
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

function SourcesTable({ sources, leftLabel, rightLabel }: { sources: SourceRow[]; leftLabel: string; rightLabel: string }) {
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
function CohortStrip({ cohort }: { cohort: CohortTrace }) {
  const step = (label: string, value: number, base: number | null) => (
    <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '7px 12px', minWidth: 110 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: MUTE }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>{value}</div>
      {base !== null && <div style={{ fontSize: 10, color: MUTE }}>{pct(value, base)} dei precedenti</div>}
    </div>
  )
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTE, marginBottom: 6 }}>
        Ultimi {cohort.windowDays} giorni, stessa persona dal quiz al trial
      </div>
      <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
        {step('Completano il quiz', cohort.completed, null)}
        <span style={{ color: MUTE }}>→</span>
        {step('Cliccano checkout', cohort.clickedCheckout, cohort.completed)}
        <span style={{ color: MUTE }}>→</span>
        {step('Diventano trial', cohort.becameTrial, cohort.clickedCheckout)}
      </div>
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
            <CohortStrip cohort={d.cohort} />
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 11.5, fontWeight: 700, color: MUTE, cursor: 'pointer', userSelect: 'none' }}>Numeri verificabili</summary>
              <div className="flex flex-wrap" style={{ gap: 30 }}>
                <FunnelTable
                  leftLabel={d.daily_funnel.dayBeforeDate} rightLabel={d.daily_funnel.yesterdayDate}
                  left={d.daily_funnel.dayBefore} right={d.daily_funnel.yesterday}
                />
                {d.is_monday && (
                  <FunnelTable
                    leftLabel={d.weekly_funnel.lastWeekRange} rightLabel={d.weekly_funnel.thisWeekRange}
                    left={d.weekly_funnel.last_week} right={d.weekly_funnel.this_week}
                  />
                )}
                {d.is_monday && (
                  <SourcesTable sources={d.sources} leftLabel={d.weekly_funnel.lastWeekRange} rightLabel={d.weekly_funnel.thisWeekRange} />
                )}
              </div>
            </details>
          </div>
        ))}
      </div>
    </div>
  )
}
