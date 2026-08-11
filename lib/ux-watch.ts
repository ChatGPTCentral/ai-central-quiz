// The behaviours we refuse to lose again, checked every six hours.
//
// WHY THIS EXISTS. On 2026-08-11 four things were sitting in the data, all of
// them findable, none of them found:
//   · checkout was refusing to load for anyone whose email had a typo, because
//     we passed the bad address to Stripe and Stripe rejected the session
//   · 104 sessions a fortnight landing on a 404 from a mangled published link
//   · 169 dead clicks on a landing card that was never wired to anything
//   · 205 exceptions a week with no message recorded
// Each had been true for weeks. The dashboard was measuring money beautifully
// while the product quietly leaked, and the only reason any of it surfaced was
// the owner asking a question on the right afternoon.
//
// So these are the questions asked ON A SCHEDULE. Each returns a number, a
// threshold, and enough detail to act without a second query. Anything over
// threshold appears on the dashboard; everything else stays silent.

import { hogql } from '@/lib/posthog-read'

export interface UxSignal {
  key: string
  /** What was measured, in the words you would use to a person. */
  claim: string
  /** The number that came back. */
  value: number
  /** Over this and it is worth a human's attention. */
  threshold: number
  ok: boolean
  /** Enough to act on: which page, which element, which message. */
  detail: string
  /** Bigger is worse for all of these; ranked so the worst is read first. */
  severity: 'critical' | 'warn'
}

/** HogQL for each hunt. Kept as data so the set can grow without touching the
 *  runner, and so every query is readable in one place. */
export const UX_QUERIES: {
  key: string
  claim: string
  threshold: number
  severity: 'critical' | 'warn'
  sql: string
  /** Turn rows into the number and the sentence a person reads. */
  read: (rows: any[]) => { value: number; detail: string }
}[] = [
  {
    key: 'checkout_errors',
    claim: 'checkout failed to load for somebody',
    // ZERO tolerance. Every one of these is a person who clicked buy and got a
    // blank box, which is the most expensive event on the site.
    threshold: 0,
    severity: 'critical',
    sql: `SELECT substring(coalesce(toString(properties.$exception_values), ''), 1, 200) AS msg, count() AS n
          FROM events
          WHERE event = '$exception' AND timestamp > now() - INTERVAL 6 HOUR
            AND (toString(properties.$exception_values) ILIKE '%fetchClientSecret%'
              OR toString(properties.$exception_values) ILIKE '%checkout%'
              OR toString(properties.$exception_values) ILIKE '%Invalid email%')
          GROUP BY msg ORDER BY n DESC LIMIT 5`,
    read: rows => ({
      value: rows.reduce((a, r) => a + Number(r.n || 0), 0),
      detail: rows.length ? rows.map(r => `${r.n}× ${r.msg}`).join(' | ') : 'none',
    }),
  },
  {
    key: 'dead_clicks',
    claim: 'people clicked something that does nothing',
    threshold: 15,
    severity: 'warn',
    sql: `SELECT properties.$current_url AS url, coalesce(properties.$el_text, '(no text)') AS el, count() AS n
          FROM events
          WHERE event = '$dead_click' AND timestamp > now() - INTERVAL 6 HOUR
            AND properties.$current_url NOT LIKE '%/admin%'
          GROUP BY url, el ORDER BY n DESC LIMIT 6`,
    read: rows => ({
      value: rows.reduce((a, r) => a + Number(r.n || 0), 0),
      // The element is the whole point: a count per URL is a tally, a count per
      // element is a thing to go and wire up.
      detail: rows.length
        ? rows.map(r => `${r.n}× "${r.el}" on ${String(r.url || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`).join(' | ')
        : 'none',
    }),
  },
  {
    key: 'rage_clicks',
    claim: 'people clicked the same spot over and over',
    threshold: 8,
    severity: 'warn',
    sql: `SELECT properties.$current_url AS url, coalesce(properties.$el_text, '(no text)') AS el, count() AS n
          FROM events
          WHERE event = '$rageclick' AND timestamp > now() - INTERVAL 6 HOUR
            AND properties.$current_url NOT LIKE '%/admin%'
          GROUP BY url, el ORDER BY n DESC LIMIT 6`,
    read: rows => ({
      value: rows.reduce((a, r) => a + Number(r.n || 0), 0),
      detail: rows.length
        ? rows.map(r => `${r.n}× "${r.el}" on ${String(r.url || '').replace(/^https?:\/\/[^/]+/, '').split('?')[0]}`).join(' | ')
        : 'none',
    }),
  },
  {
    key: 'named_exceptions',
    claim: 'the site threw an error we can name',
    threshold: 20,
    severity: 'warn',
    // "Script error." is excluded on purpose: it is the browser withholding
    // detail about a cross-origin script, so it is noise we cannot act on and
    // it would drown everything that IS actionable.
    sql: `SELECT substring(coalesce(toString(properties.$exception_values), ''), 1, 160) AS msg,
                 properties.$current_url AS url, count() AS n
          FROM events
          WHERE event = '$exception' AND timestamp > now() - INTERVAL 6 HOUR
            AND toString(properties.$exception_values) NOT ILIKE '%Script error%'
            AND properties.$current_url NOT LIKE '%/admin%'
          GROUP BY msg, url ORDER BY n DESC LIMIT 6`,
    read: rows => ({
      value: rows.reduce((a, r) => a + Number(r.n || 0), 0),
      detail: rows.length ? rows.map(r => `${r.n}× ${r.msg}`).join(' | ') : 'none',
    }),
  },
  {
    key: 'dead_ends',
    claim: 'people landed on a page that does not exist',
    threshold: 3,
    severity: 'warn',
    // A 404 is always somebody who clicked a link to us. The middleware now
    // rescues punctuation-only paths, so anything left is a real bad link that
    // wants finding at the source.
    sql: `SELECT properties.$current_url AS url, count() AS n
          FROM events
          WHERE event = '$pageview' AND timestamp > now() - INTERVAL 6 HOUR
            AND (properties.$current_url ILIKE '%/404%' OR properties.pathname ILIKE '%/404%')
          GROUP BY url ORDER BY n DESC LIMIT 5`,
    read: rows => ({
      value: rows.reduce((a, r) => a + Number(r.n || 0), 0),
      detail: rows.length ? rows.map(r => `${r.n}× ${r.url}`).join(' | ') : 'none',
    }),
  },
  {
    key: 'quiz_start_to_finish',
    claim: 'the quiz stopped finishing at its usual rate',
    // A RATE, not a count, so a quiet night does not read as a fault. Under
    // 45% completion is well below the ~82% this quiz normally runs at.
    threshold: 0,
    severity: 'critical',
    sql: `SELECT
            countIf(event = '$pageview' AND properties.$current_url ILIKE '%/quiz-v2%') AS started,
            countIf(event = '$pageview' AND properties.$current_url ILIKE '%/result%') AS finished
          FROM events WHERE timestamp > now() - INTERVAL 6 HOUR`,
    read: rows => {
      const r = rows[0] || {}
      const started = Number(r.started || 0)
      const finished = Number(r.finished || 0)
      // Too few to judge: report healthy rather than cry wolf on a quiet hour.
      if (started < 25) return { value: 0, detail: `only ${started} quiz views in 6h, too few to judge` }
      const pct = (finished / started) * 100
      return {
        value: pct < 45 ? 1 : 0,
        detail: `${finished} results from ${started} quiz views, ${pct.toFixed(0)}%`,
      }
    },
  },
]

/**
 * Run one HogQL query. Uses the SHARED reader in lib/posthog-read.ts, which
 * already owns the host and can discover the project id from the API key.
 *
 * The first draft of this file grew its own copy of that plumbing, with a
 * different host default and a hard requirement on POSTHOG_PROJECT_ID — which
 * is the exact failure posthog-read.ts was written to end, and its header says
 * so. Duplicated plumbing diverges, every time, and a watcher that silently
 * queried the wrong region would be worse than no watcher at all.
 */
async function rows(sql: string): Promise<any[]> {
  const r = await hogql(sql)
  if (r.error) throw new Error(r.error)
  return r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c, (row as unknown[])[i]])))
}

/**
 * Ask every question. Never throws: a watcher that can break the job it runs
 * inside is a watcher somebody switches off.
 */
export async function runUxWatch(): Promise<UxSignal[]> {
  const out: UxSignal[] = []
  for (const q of UX_QUERIES) {
    try {
      const r = await rows(q.sql)
      const { value, detail } = q.read(r)
      out.push({ key: q.key, claim: q.claim, value, threshold: q.threshold, ok: value <= q.threshold, detail, severity: q.severity })
    } catch (e) {
      out.push({
        key: q.key, claim: q.claim, value: 0, threshold: q.threshold, ok: true,
        detail: `could not run: ${e instanceof Error ? e.message : 'unknown'}`, severity: q.severity,
      })
    }
  }
  return out
}
