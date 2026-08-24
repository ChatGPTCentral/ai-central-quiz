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
// move, then a short WRITTEN synthesis instead of leaving him to read raw
// numbers alone.
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
const FUNNEL_DAYS = 14
const DAY_MS = 86_400_000

export interface TrendPoint { day: string; trials: number }
export interface FunnelWeek { landing: number; started: number; completed: number; clicked: number }
export interface SourceRow { source: string; this_week: number; last_week: number }
export interface DigestResult {
  day: string
  trialsYesterday: number
  barHit: boolean
  trend: TrendPoint[]
  funnel: { this_week: FunnelWeek; last_week: FunnelWeek }
  sources: SourceRow[]
  headline: string
  synthesis: string
}

async function trialsTrend(c: SupabaseClient): Promise<TrendPoint[]> {
  const since = new Date(Date.now() - TREND_DAYS * DAY_MS).toISOString()
  const { data } = await c.from('stripe_charges')
    .select('charged_at')
    .gte('charged_at', since)
    .in('amount_cents', [399, 499, 1495, 5474])
    .eq('refunded', false)
    .limit(5000)
  const byDay = new Map<string, number>()
  for (const r of (data ?? []) as { charged_at: string }[]) {
    const d = r.charged_at.slice(0, 10)
    byDay.set(d, (byDay.get(d) ?? 0) + 1)
  }
  const out: TrendPoint[] = []
  for (let i = TREND_DAYS; i >= 1; i--) {
    const d = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10)
    out.push({ day: d, trials: byDay.get(d) ?? 0 })
  }
  return out
}

interface FEvent { anon_id: string; event: string; path: string | null; ts: string; utm_source: string | null }

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

async function funnelAndSources(c: SupabaseClient): Promise<{ funnel: DigestResult['funnel']; sources: SourceRow[] }> {
  const since = new Date(Date.now() - FUNNEL_DAYS * DAY_MS).toISOString()
  const { data } = await c.from('funnel_events')
    .select('anon_id, event, path, ts, utm_source')
    .gte('ts', since)
    .not('anon_id', 'is', null)
    .in('event', ['quiz_view', 'quiz_start', 'quiz_submit', 'checkout_click'])
    .limit(20_000)
  const rows = (data ?? []) as FEvent[]
  const cutoff = new Date(Date.now() - 7 * DAY_MS).toISOString()
  const weekOf = (ts: string): 'this_week' | 'last_week' => (ts >= cutoff ? 'this_week' : 'last_week')

  const landing = nextStep(rows, null, 'quiz_view', '/')
  const started = nextStep(rows, landing, 'quiz_start')
  const completed = nextStep(rows, started, 'quiz_submit')
  const clicked = nextStep(rows, completed, 'checkout_click')

  const bucket = (m: Map<string, string>) => {
    let thisWeek = 0, lastWeek = 0
    for (const ts of Array.from(m.values())) { if (weekOf(ts) === 'this_week') thisWeek++; else lastWeek++ }
    return { thisWeek, lastWeek }
  }
  const L = bucket(landing), S = bucket(started), C = bucket(completed), K = bucket(clicked)
  const funnel = {
    this_week: { landing: L.thisWeek, started: S.thisWeek, completed: C.thisWeek, clicked: K.thisWeek },
    last_week: { landing: L.lastWeek, started: S.lastWeek, completed: C.lastWeek, clicked: K.lastWeek },
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

  return { funnel, sources }
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
- Se un numero viene da una finestra diversa (settimana contro giorno), dillo nella stessa frase.

Contesto del progetto:
- L'obiettivo e 10+ trial pagati al giorno, "the bar". Sotto 10 e fallimento.
- Le landing, le persone che arrivano sulla pagina, sono la leva del proprietario.
- La conversione sulla pagina, la percentuale che passa da un passo al successivo, e la leva di Claude.
- Un trial e un pagamento reale di $4.99, $3.99, $14.95, o il bundle $54.74.

Il tuo compito: scrivi un titolo di una frase (headline) e una sintesi di massimo 6 frasi (synthesis). Spiega cosa e cambiato questa settimana contro la scorsa. Dai la causa piu probabile SOLO se i numeri la mostrano chiaramente. Se i numeri non mostrano una causa chiara, dillo, non inventarla. Finisci la sintesi con una frase su cosa guardare o fare dopo.`

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
  funnel: DigestResult['funnel']
  sources: SourceRow[]
  trialsYesterday: number
  barHit: boolean
}): Promise<{ headline: string; synthesis: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const fallback = {
    headline: input.barHit
      ? `Bar raggiunta: ${input.trialsYesterday} trial ieri`
      : `Bar mancata: ${input.trialsYesterday} trial ieri contro 10`,
    synthesis: 'Sintesi automatica non disponibile (ANTHROPIC_API_KEY assente). I numeri sotto restano quelli veri.',
  }
  if (!apiKey) return fallback

  const userPrompt = `Trend trial per giorno (ultimi 21 giorni, dal piu vecchio al piu recente):
${input.trend.map(t => `${t.day}: ${t.trials}`).join('\n')}

Ieri: ${input.trialsYesterday} trial, bar di 10, ${input.barHit ? 'raggiunta' : 'mancata'}.

Funnel, settimana scorsa contro questa settimana, stessa persona in ordine di tempo:
landing: ${input.funnel.last_week.landing} -> ${input.funnel.this_week.landing}
iniziano il quiz: ${input.funnel.last_week.started} -> ${input.funnel.this_week.started}
completano il quiz: ${input.funnel.last_week.completed} -> ${input.funnel.this_week.completed}
cliccano checkout: ${input.funnel.last_week.clicked} -> ${input.funnel.this_week.clicked}

Traffico landing per fonte, settimana scorsa contro questa settimana:
${input.sources.slice(0, 8).map(s => `${s.source}: ${s.last_week} -> ${s.this_week}`).join('\n')}`

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
  const [trend, fs] = await Promise.all([trialsTrend(c), funnelAndSources(c)])
  const trialsYesterday = trend.length ? trend[trend.length - 1].trials : 0
  const barHit = trialsYesterday >= BAR
  const day = new Date().toISOString().slice(0, 10)
  const { headline, synthesis } = await synthesize({ trend, funnel: fs.funnel, sources: fs.sources, trialsYesterday, barHit })
  return { day, trialsYesterday, barHit, trend, funnel: fs.funnel, sources: fs.sources, headline, synthesis }
}
