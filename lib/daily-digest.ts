// The daily routine the owner asked for, 2026-08-24 (Monday sweep):
// "ci dobbiamo ossessionare con il fare 10+ trial al giorno ... ogni volta
// che una routine ritorna sotto le 10 trial, noi esploriamo e guardiamo
// posthog ... perche tutti i dati di posthog non ci stanno indicando cosa
// fare." The data was already there — nobody had assembled it into a
// routine before. This runs once a day (app/api/cron/daily-digest) and does
// by hand what a Monday sweep just did live: the trials trend, the funnel
// steps SAME PERSON IN TIME ORDER (never two independent headcounts — the
// exact bug CLAUDE.md names, email-link quiz-starts credited to a landing
// page they never saw), the traffic-source breakdown behind any landing
// move, a traced quiz-completed-to-trial cohort, then a short WRITTEN
// synthesis instead of leaving him to read raw numbers alone.
//
// Cadence, same day (owner: "mi fai un daily tutti i giorni e il lunedi al
// massimo mi fai il weekly"): every day gets the DAILY comparison
// (yesterday vs the day before) as the primary read. Monday additionally
// gets the WEEKLY comparison (this week vs last), because a single day's
// swing is too noisy to read alone but a week's isn't. Every "scorsa /
// questa" style label carries its own real date range now — the first
// version just said "scorsa" and "questa" with nothing to anchor them to,
// which is exactly what he could not read.
//
// The synthesis is a narrative layer on top of the stored numbers, never a
// replacement for them — the digest page renders both, so a claim in the
// prose is always checkable against the table underneath (owner's cardinal
// rule: a number he cannot find on a screen is a number he cannot trust).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

export const BAR = 10
const TREND_DAYS = 21
const SUMS_DAYS = 60 // covers this-month + last-month (30 + 30)
const FUNNEL_DAYS = 14
const COHORT_DAYS = 7
const DAY_MS = 86_400_000

const isoDay = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10)

export interface TrendPoint { day: string; trials: number }
export interface TrialSums { thisWeek: number; lastWeek: number; thisMonth: number; lastMonth: number }
export interface FunnelSnapshot { landing: number; started: number; completed: number; clicked: number }
export interface DailyFunnel { yesterday: FunnelSnapshot; dayBefore: FunnelSnapshot; yesterdayDate: string; dayBeforeDate: string }
export interface WeeklyFunnel { this_week: FunnelSnapshot; last_week: FunnelSnapshot; thisWeekRange: string; lastWeekRange: string }
export interface SourceRow { source: string; this_week: number; last_week: number }
export interface CohortTrace { windowDays: number; landed: number; completed: number; clickedCheckout: number; becameTrial: number }
export interface DigestResult {
  day: string
  isMonday: boolean
  trialsYesterday: number
  barHit: boolean
  trend: TrendPoint[]
  dailyFunnel: DailyFunnel
  weeklyFunnel: WeeklyFunnel
  sources: SourceRow[]
  cohort: CohortTrace
  cohortYesterday: CohortTrace
  trialSums: TrialSums
  headline: string
  synthesis: string
}

/** One trial_ledger read, two derivations from the same by-day map: the
 *  21-day sparkline and the week/month sums below. Reading it twice at two
 *  different window sizes would let the sparkline and the sums disagree on
 *  a day that moved between the two reads — same one-source-of-truth
 *  reasoning as the rest of this file, just applied to two views of one
 *  query instead of two queries. */
async function trialsByDay(c: SupabaseClient): Promise<Map<string, number>> {
  const since = new Date(Date.now() - SUMS_DAYS * DAY_MS).toISOString()
  // Same bucketing the daily_benchmark watcher check uses (lib/ux-watch.ts):
  // quiz-attributed trials (net-new + existing) on the QUIZ clock, not-quiz
  // trials on the CHARGE clock. This used to scan stripe_charges by
  // charged_at instead — a second derivation of "trials/day" that could,
  // and on 2026-08-24 did, disagree with the matrix's own number (5 here
  // vs 3 on daily_benchmark) — exactly the one-source-of-truth violation
  // CLAUDE.md warns about. trial_ledger is the one source; read it, don't
  // re-derive it.
  const { data, error } = await c.from('trial_ledger')
    .select('attribution, quiz_completed_at, trial_at')
    .in('attribution', ['quiz_net_new', 'quiz_existing', 'not_quiz'])
    .or(`quiz_completed_at.gte.${since},trial_at.gte.${since}`)
    .limit(5000)
  if (error) console.error('[daily-digest] trial_ledger query failed:', error.message, error.details, error.hint, error.code)
  const byDay = new Map<string, number>()
  for (const r of (data ?? []) as { attribution: string; quiz_completed_at: string | null; trial_at: string | null }[]) {
    const anchor = r.attribution === 'not_quiz' ? r.trial_at : (r.quiz_completed_at ?? r.trial_at)
    if (!anchor || anchor < since) continue
    const d = anchor.slice(0, 10)
    byDay.set(d, (byDay.get(d) ?? 0) + 1)
  }
  return byDay
}

function trialsTrend(byDay: Map<string, number>): TrendPoint[] {
  const out: TrendPoint[] = []
  for (let i = TREND_DAYS; i >= 1; i--) {
    const d = isoDay(i)
    out.push({ day: d, trials: byDay.get(d) ?? 0 })
  }
  return out
}

/** Sums, not daily points: "quanti trial facciamo ogni settimana" and "ogni
 *  mese" (owner, 2026-08-27), each against the equal-length period right
 *  before it — 7-vs-7, 30-vs-30, both trailing from today. */
function trialsSums(byDay: Map<string, number>): TrialSums {
  let thisWeek = 0, lastWeek = 0, thisMonth = 0, lastMonth = 0
  for (let i = 1; i <= SUMS_DAYS; i++) {
    const n = byDay.get(isoDay(i)) ?? 0
    if (i <= 7) thisWeek += n
    else if (i <= 14) lastWeek += n
    if (i <= 30) thisMonth += n
    else if (i <= 60) lastMonth += n
  }
  return { thisWeek, lastWeek, thisMonth, lastMonth }
}

interface FEvent { anon_id: string; event: string; path: string | null; ts: string; utm_source: string | null; submission_id: string | null; email: string | null }

/** Same-person, timestamps-in-order — the one rule CLAUDE.md names for a
 *  funnel step ("of the people who did A, how many then did B"). Each call
 *  only counts an event for an anon_id that already cleared the PREVIOUS
 *  step's map at or before this event's own timestamp. */
function nextStep(rows: FEvent[], prev: Map<string, string> | null, evt: string, pathFilter?: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of rows) {
    if (r.event !== evt) continue
    if (pathFilter !== undefined && r.path !== pathFilter) continue
    if (prev) {
      const prevTs = prev.get(r.anon_id)
      if (!prevTs || r.ts < prevTs) continue
    }
    const existing = m.get(r.anon_id)
    if (!existing || r.ts < existing) m.set(r.anon_id, r.ts)
  }
  return m
}

/** Pages through funnel_events like every other large read in this codebase
 *  (lib/revenue-shared.ts loadRevenueData) — a bare .limit() does not
 *  override Supabase's own server-side max-rows cap, found live 2026-08-24
 *  when a 20,000-row request silently came back with 972 and zero landing
 *  rows among them, because with no ORDER BY the truncated slice was not an
 *  even sample of the window. */
async function fetchFunnelEvents(c: SupabaseClient, sinceIso: string): Promise<FEvent[]> {
  const rows: FEvent[] = []
  for (let o = 0; o < 30_000; o += 1000) {
    const { data, error } = await c.from('funnel_events')
      .select('anon_id, event, path, ts, utm_source, submission_id, email')
      .gte('ts', sinceIso)
      .in('event', ['quiz_view', 'quiz_start', 'quiz_submit', 'checkout_click'])
      .order('ts', { ascending: true })
      .range(o, o + 999)
    if (error) { console.error('[daily-digest] funnel_events query failed:', error.message, error.details, error.hint, error.code); break }
    if (!data || data.length === 0) break
    rows.push(...(data as FEvent[]).filter(r => !!r.anon_id))
    if (data.length < 1000) break
  }
  console.log(`[daily-digest] funnel_events: ${rows.length} rows since ${sinceIso}`)
  return rows
}

function funnelAndSources(rows: FEvent[]): { daily: DailyFunnel; weekly: WeeklyFunnel; sources: SourceRow[] } {
  const landing = nextStep(rows, null, 'quiz_view', '/')
  const started = nextStep(rows, landing, 'quiz_start')
  const completed = nextStep(rows, started, 'quiz_submit')
  const clicked = nextStep(rows, completed, 'checkout_click')

  const countOnDay = (m: Map<string, string>, day: string) => {
    let n = 0
    for (const ts of Array.from(m.values())) if (ts.slice(0, 10) === day) n++
    return n
  }
  const yesterdayDate = isoDay(1), dayBeforeDate = isoDay(2)
  const daily: DailyFunnel = {
    yesterdayDate, dayBeforeDate,
    yesterday: { landing: countOnDay(landing, yesterdayDate), started: countOnDay(started, yesterdayDate), completed: countOnDay(completed, yesterdayDate), clicked: countOnDay(clicked, yesterdayDate) },
    dayBefore: { landing: countOnDay(landing, dayBeforeDate), started: countOnDay(started, dayBeforeDate), completed: countOnDay(completed, dayBeforeDate), clicked: countOnDay(clicked, dayBeforeDate) },
  }

  const cutoff = new Date(Date.now() - 7 * DAY_MS).toISOString()
  const weekOf = (ts: string): 'this_week' | 'last_week' => (ts >= cutoff ? 'this_week' : 'last_week')
  const countInWeek = (m: Map<string, string>, wk: 'this_week' | 'last_week') => {
    let n = 0
    for (const ts of Array.from(m.values())) if (weekOf(ts) === wk) n++
    return n
  }
  const weekly: WeeklyFunnel = {
    thisWeekRange: `${isoDay(7)} → ${isoDay(1)}`,
    lastWeekRange: `${isoDay(14)} → ${isoDay(8)}`,
    this_week: { landing: countInWeek(landing, 'this_week'), started: countInWeek(started, 'this_week'), completed: countInWeek(completed, 'this_week'), clicked: countInWeek(clicked, 'this_week') },
    last_week: { landing: countInWeek(landing, 'last_week'), started: countInWeek(started, 'last_week'), completed: countInWeek(completed, 'last_week'), clicked: countInWeek(clicked, 'last_week') },
  }

  // Raw landing pageviews (not deduped to first-per-person — a volume
  // breakdown counts visits, the funnel above counts people).
  const bySource = new Map<string, { thisWeek: number; lastWeek: number }>()
  for (const r of rows) {
    if (r.event !== 'quiz_view' || r.path !== '/') continue
    const src = r.utm_source || '(none)'
    const entry = bySource.get(src) ?? { thisWeek: 0, lastWeek: 0 }
    if (weekOf(r.ts) === 'this_week') entry.thisWeek++; else entry.lastWeek++
    bySource.set(src, entry)
  }
  const sources = Array.from(bySource.entries())
    .map(([source, v]) => ({ source, this_week: v.thisWeek, last_week: v.lastWeek }))
    .sort((a, b) => (b.last_week + b.this_week) - (a.last_week + a.this_week))

  return { daily, weekly, sources }
}

/** Traces the SAME people, in order, landing through to an actual paid
 *  trial — the answer to the owner's 2026-08-24 challenge ("189 quiz
 *  completed, non c'e nessuna scusa") AND his 2026-08-27 correction that
 *  the trace has to start at landing, not at completion ("quanti hanno
 *  visto >>> quanti hanno completato >>> quanti checkout >>> quanti
 *  trial"). Every arrow is a TRUE subset of the one before it: becameTrial
 *  only counts people who are already in the clickedCheckout set, matched
 *  by email against a real charge dated at/after THEIR OWN click. Earlier
 *  today this matched trial against every completer regardless of whether
 *  they ever clicked checkout on this page, which let a box read as a
 *  same-person chain while its last arrow was not actually gated on the
 *  one before it — a smaller instance of the exact bug CLAUDE.md names for
 *  funnel steps. Fixed here rather than left in one place: both callers
 *  below use this same corrected function, so the two boxes on the page
 *  never fall out of agreement about what "trial" is gated on again.
 *
 *  `sinceIso`/`untilIso` bound WHEN someone had to land to be in this
 *  trace (untilIso null = up to now); `windowDays` is only the label on
 *  the result, so the 7-day rolling trace and the yesterday-only one
 *  share this one function without diverging in logic. */
async function cohortTrace(c: SupabaseClient, rows: FEvent[], sinceIso: string, untilIso: string | null, windowDays: number): Promise<CohortTrace> {
  const inWindow = (ts: string) => ts >= sinceIso && (untilIso === null || ts < untilIso)

  const landedAt = new Map<string, string>()
  for (const r of rows) {
    if (r.event !== 'quiz_view' || r.path !== '/' || !inWindow(r.ts)) continue
    const existing = landedAt.get(r.anon_id)
    if (!existing || r.ts < existing) landedAt.set(r.anon_id, r.ts)
  }
  const landed = landedAt.size
  if (landed === 0) return { windowDays, landed: 0, completed: 0, clickedCheckout: 0, becameTrial: 0 }

  const completedAt = nextStep(rows, landedAt, 'quiz_submit')
  const clickedAt = nextStep(rows, completedAt, 'checkout_click')
  if (clickedAt.size === 0) return { windowDays, landed, completed: completedAt.size, clickedCheckout: 0, becameTrial: 0 }

  // Latest known email per CLICKER (not per completer — see note above) —
  // checkout_click itself rarely carries one, so read it off any later
  // event for the same anon_id, or the linked submission.
  const emailOf = new Map<string, string>()
  for (const r of rows) {
    if (!clickedAt.has(r.anon_id)) continue
    const em = r.email
    if (em) emailOf.set(r.anon_id, em.toLowerCase())
  }
  const submissionIds = Array.from(new Set(rows.filter(r => clickedAt.has(r.anon_id) && r.submission_id).map(r => r.submission_id as string)))
  if (submissionIds.length > 0) {
    const { data: subs } = await c.from('submissions').select('id, email').in('id', submissionIds).limit(2000)
    const emailBySub = new Map((subs ?? []).map((s: { id: string; email: string | null }) => [s.id, s.email?.toLowerCase() ?? null]))
    for (const r of rows) {
      if (!clickedAt.has(r.anon_id) || emailOf.has(r.anon_id) || !r.submission_id) continue
      const em = emailBySub.get(r.submission_id)
      if (em) emailOf.set(r.anon_id, em)
    }
  }

  const emails = Array.from(new Set(Array.from(emailOf.values())))
  let becameTrial = 0
  if (emails.length > 0) {
    const { data: charges } = await c.from('stripe_charges')
      .select('email, amount_cents, refunded, charged_at')
      .in('email', emails)
      .in('amount_cents', [399, 499, 1495, 5474])
      .eq('refunded', false)
      .limit(5000)
    const earliestTrialByEmail = new Map<string, string>()
    for (const ch of (charges ?? []) as { email: string; charged_at: string }[]) {
      const em = ch.email?.toLowerCase()
      if (!em) continue
      const existing = earliestTrialByEmail.get(em)
      if (!existing || ch.charged_at < existing) earliestTrialByEmail.set(em, ch.charged_at)
    }
    for (const [anonId, at] of Array.from(clickedAt.entries())) {
      const em = emailOf.get(anonId)
      if (!em) continue
      const trialAt = earliestTrialByEmail.get(em)
      if (trialAt && trialAt >= at) becameTrial++
    }
  }

  return { windowDays, landed, completed: completedAt.size, clickedCheckout: clickedAt.size, becameTrial }
}

const MODEL = 'claude-sonnet-4-6'

// Condensed from CLAUDE.md's "how to talk to the owner" — the digest speaks
// in Claude's own voice to him, same as chat, so it follows the same rules.
const SYNTH_SYSTEM = `Sei l'assistente che scrive il digest giornaliero per il proprietario di AI Central Quiz, in italiano.

Regole di scrittura, sempre:
- Frasi corte. Massimo 20 parole per un'istruzione, 25 per una frase descrittiva.
- Una idea per frase. Non unire due istruzioni con "e" o "poi".
- Voce attiva. Parole semplici. Nessun em-dash, usa la virgola.
- Usa SOLO i numeri forniti. Non inventare nessun numero e nessuna causa assente dai dati.
- Ogni numero porta la sua data o il suo intervallo esplicito, mai "scorsa" o "questa" da sole.

Contesto del progetto:
- L'obiettivo e 10+ trial pagati al giorno, "the bar". Sotto 10 e fallimento.
- Le landing, le persone che arrivano sulla pagina, sono la leva del proprietario.
- La conversione sulla pagina, la percentuale che passa da un passo al successivo, e la leva di Claude.
- Un trial e un pagamento reale di $4.99, $3.99, $14.95, o il bundle $54.74.

Il tuo compito: scrivi un titolo di una frase (headline) e una sintesi di massimo 7 frasi (synthesis).
Priorita 1: il confronto GIORNALIERO, ieri contro il giorno prima, sempre presente.
Priorita 2: le somme SETTIMANALE e MENSILE dei trial, sempre presenti, contro il periodo uguale precedente.
Priorita 3, SOLO se e lunedi: aggiungi cosa dice il confronto SETTIMANALE del funnel (non la somma, il passo per passo).
Priorita 4: il tracciamento visto-completato-checkout-trial, per dire dove si perde la persona.
Dai la causa piu probabile SOLO se i numeri la mostrano chiaramente. Se non la mostrano, dillo, non inventarla.
Finisci la sintesi con una frase su cosa guardare o fare dopo.`

const SYNTH_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    synthesis: { type: 'string' },
  },
  required: ['headline', 'synthesis'],
  additionalProperties: false,
} as const

async function synthesize(input: {
  trend: TrendPoint[]
  daily: DailyFunnel
  weekly: WeeklyFunnel
  sources: SourceRow[]
  cohort: CohortTrace
  trialSums: TrialSums
  trialsYesterday: number
  barHit: boolean
  isMonday: boolean
}): Promise<{ headline: string; synthesis: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const fallback = {
    headline: input.barHit
      ? `Bar raggiunta: ${input.trialsYesterday} trial ieri`
      : `Bar mancata: ${input.trialsYesterday} trial ieri contro 10`,
    synthesis: 'Sintesi automatica non disponibile (ANTHROPIC_API_KEY assente). I numeri sotto restano quelli veri.',
  }
  if (!apiKey) return fallback

  const weeklyBlock = input.isMonday ? `

E' lunedi. Funnel settimanale, ${input.weekly.lastWeekRange} contro ${input.weekly.thisWeekRange}, stessa persona in ordine di tempo:
landing: ${input.weekly.last_week.landing} -> ${input.weekly.this_week.landing}
iniziano il quiz: ${input.weekly.last_week.started} -> ${input.weekly.this_week.started}
completano il quiz: ${input.weekly.last_week.completed} -> ${input.weekly.this_week.completed}
cliccano checkout: ${input.weekly.last_week.clicked} -> ${input.weekly.this_week.clicked}

Traffico landing per fonte, ${input.weekly.lastWeekRange} contro ${input.weekly.thisWeekRange}:
${input.sources.slice(0, 8).map(s => `${s.source}: ${s.last_week} -> ${s.this_week}`).join('\n')}` : ''

  const userPrompt = `Trend trial per giorno (ultimi 21 giorni, dal piu vecchio al piu recente):
${input.trend.map(t => `${t.day}: ${t.trials}`).join('\n')}

Ieri (${input.daily.yesterdayDate}): ${input.trialsYesterday} trial, bar di 10, ${input.barHit ? 'raggiunta' : 'mancata'}.

Somma trial, settimana contro settimana scorsa (7 giorni contro 7 giorni prima): ${input.trialSums.lastWeek} -> ${input.trialSums.thisWeek}.
Somma trial, mese contro mese scorso (30 giorni contro 30 giorni prima): ${input.trialSums.lastMonth} -> ${input.trialSums.thisMonth}.

Funnel giornaliero, ${input.daily.dayBeforeDate} contro ${input.daily.yesterdayDate}, stessa persona in ordine di tempo:
landing: ${input.daily.dayBefore.landing} -> ${input.daily.yesterday.landing}
iniziano il quiz: ${input.daily.dayBefore.started} -> ${input.daily.yesterday.started}
completano il quiz: ${input.daily.dayBefore.completed} -> ${input.daily.yesterday.completed}
cliccano checkout: ${input.daily.dayBefore.clicked} -> ${input.daily.yesterday.clicked}
${weeklyBlock}

Tracciamento persona per persona, ultimi ${input.cohort.windowDays} giorni: ${input.cohort.landed} hanno visto la pagina, ${input.cohort.completed} di questi hanno completato il quiz, ${input.cohort.clickedCheckout} di questi hanno cliccato checkout, ${input.cohort.becameTrial} di questi sono diventati un trial pagato dopo.`

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: SYNTH_SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { format: { type: 'json_schema', schema: SYNTH_SCHEMA } },
      messages: [{ role: 'user', content: userPrompt }],
    })
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return fallback
    const parsed = JSON.parse(textBlock.text) as { headline: string; synthesis: string }
    return parsed
  } catch (e) {
    console.error('[daily-digest] synthesis failed:', e)
    return fallback
  }
}

export async function runDailyDigest(c: SupabaseClient): Promise<DigestResult> {
  const since = new Date(Date.now() - FUNNEL_DAYS * DAY_MS).toISOString()
  const [byDay, rows] = await Promise.all([trialsByDay(c), fetchFunnelEvents(c, since)])
  const trend = trialsTrend(byDay)
  const trialSums = trialsSums(byDay)
  const { daily, weekly, sources } = funnelAndSources(rows)
  // Two traces, same function, different bounds: the rolling 7-day one
  // (unchanged), and a true yesterday-only one on the SAME calendar day
  // funnelAndSources already uses for daily.yesterday, so the two "ieri"
  // numbers on the page can never disagree about which day "ieri" means.
  const yesterdayStartIso = `${daily.yesterdayDate}T00:00:00.000Z`
  const todayStartIso = new Date(new Date(yesterdayStartIso).getTime() + DAY_MS).toISOString()
  const [cohort, cohortYesterday] = await Promise.all([
    cohortTrace(c, rows, new Date(Date.now() - COHORT_DAYS * DAY_MS).toISOString(), null, COHORT_DAYS),
    cohortTrace(c, rows, yesterdayStartIso, todayStartIso, 1),
  ])
  const trialsYesterday = trend.length ? trend[trend.length - 1].trials : 0
  const barHit = trialsYesterday >= BAR
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  const isMonday = now.getUTCDay() === 1
  const { headline, synthesis } = await synthesize({ trend, daily, weekly, sources, cohort, trialSums, trialsYesterday, barHit, isMonday })
  return { day, isMonday, trialsYesterday, barHit, trend, dailyFunnel: daily, weeklyFunnel: weekly, sources, cohort, cohortYesterday, trialSums, headline, synthesis }
}
