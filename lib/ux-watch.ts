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
  /** WHICH STORE THIS READS. Added 2026-08-12 after checkout_abandon was found
   *  querying PostHog for `checkout_click`, an event that only exists in our
   *  own funnel_events. PostHog does not error on an unknown event name, it
   *  returns zero rows, so the check scored 0, sat under its threshold and
   *  reported healthy forever. Naming the source makes that mistake visible in
   *  the source rather than only in production. */
  source?: 'posthog' | 'supabase'
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
    sql: `SELECT toString(properties.$current_url) AS url, coalesce(nullIf(toString(properties.$el_text), ''), '(no text)') AS el, count() AS n
          FROM events
          WHERE event = '$dead_click' AND timestamp > now() - INTERVAL 6 HOUR
            AND toString(properties.$current_url) NOT LIKE '%/admin%'
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
    sql: `SELECT toString(properties.$current_url) AS url, coalesce(nullIf(toString(properties.$el_text), ''), '(no text)') AS el, count() AS n
          FROM events
          WHERE event = '$rageclick' AND timestamp > now() - INTERVAL 6 HOUR
            AND toString(properties.$current_url) NOT LIKE '%/admin%'
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
                 toString(properties.$current_url) AS url, count() AS n
          FROM events
          WHERE event = '$exception' AND timestamp > now() - INTERVAL 6 HOUR
            AND toString(properties.$exception_values) NOT ILIKE '%Script error%'
            AND toString(properties.$current_url) NOT LIKE '%/admin%'
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
    sql: `SELECT toString(properties.$current_url) AS url, count() AS n
          FROM events
          WHERE event = '$pageview' AND timestamp > now() - INTERVAL 6 HOUR
            AND (toString(properties.$current_url) ILIKE '%/404%' OR toString(properties.$pathname) ILIKE '%/404%')
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
            countIf(event = '$pageview' AND toString(properties.$current_url) ILIKE '%/quiz-v2%') AS started,
            countIf(event = '$pageview' AND toString(properties.$current_url) ILIKE '%/result%') AS finished
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
  {
    key: 'quick_back',
    claim: 'people arrived and left again within seconds',
    // THE CLARITY RE-MAP. Clarity called this Quickback and it was the one
    // signal it owned; PostHog has no native event for it, so it is derived:
    // a pageview whose session produced nothing else. Someone who lands, looks,
    // and leaves without a single interaction did not bounce because they were
    // busy, they bounced because the page did not hold them.
    threshold: 25,
    severity: 'warn',
    sql: `SELECT replaceRegexpOne(toString(properties.$current_url), '\\?.*$', '') AS page, count() AS n
          FROM events
          WHERE event = '$pageview' AND timestamp > now() - INTERVAL 6 HOUR
            AND toString(properties.$current_url) NOT LIKE '%/admin%'
            AND properties.$session_id NOT IN (
              SELECT properties.$session_id FROM events
              WHERE timestamp > now() - INTERVAL 6 HOUR
                -- PostHog events ONLY. quiz_start and checkout_click were in
                -- this list and are ours, not PostHog's, so they filtered
                -- nothing. $autocapture covers a real click either way.
                AND event IN ('$autocapture', '$dead_click', '$rageclick')
            )
          GROUP BY page ORDER BY n DESC LIMIT 6`,
    read: rows => ({
      value: rows.reduce((a, r) => a + Number(r.n || 0), 0),
      detail: rows.length
        ? rows.map(r => `${r.n}× ${String(r.page || '').replace(/^https?:\/\/[^/]+/, '') || '/'}`).join(' | ')
        : 'none',
    }),
  },
  {
    key: 'checkout_abandon',
    claim: 'people opened checkout and did not buy',
    // WHY THIS READS SUPABASE. checkout_click is ours, fired by the result
    // page into funnel_events. PostHog never sees it, so the PostHog version
    // of this check returned "0 opened, 0 walked" every time and passed.
    //
    // A high number here with no errors beside it is a persuasion or pricing
    // problem; a high number WITH errors is a bug. The pairing is the
    // diagnosis, which is why both live in the same six-hour report.
    threshold: 12,
    severity: 'warn',
    source: 'supabase',
    sql: `select
            (select count(distinct coalesce(submission_id::text, anon_id::text, session_id))
               from funnel_events where event = 'checkout_click' and ts >= now() - interval '6 hours') as opened,
            (select count(*) from trial_ledger
               where not trial_refunded and trial_at >= now() - interval '6 hours') as paid`,
    read: rows => {
      const r = rows[0] || {}
      const opened = Number(r.opened || 0)
      const paid = Number(r.paid || 0)
      const lost = Math.max(0, opened - paid)
      return { value: lost, detail: `${opened} opened checkout, ${paid} paid on page, ${lost} did not` }
    },
  },
  {
    key: 'quiz_step_dropoff',
    claim: 'one quiz question is losing more people than the rest',
    // WHERE they bounce, to the question. A funnel that only reports its ends
    // tells you people leave; this tells you which sentence made them leave.
    threshold: 0,
    severity: 'warn',
    // Event and property names confirmed against the project taxonomy: the
    // event is quiz_step_viewed and the identifier is question_id. My first
    // draft guessed 'quiz_step' and 'qid', both wrong, and a wrong event name
    // returns zero rows rather than an error — so this check would have
    // reported "not enough steps to judge" every six hours, forever, and read
    // as healthy.
    sql: `SELECT toString(properties.question_id) AS qid, uniq(properties.$session_id) AS people
          FROM events
          WHERE event = 'quiz_step_viewed' AND timestamp > now() - INTERVAL 24 HOUR
          GROUP BY qid ORDER BY people DESC LIMIT 20`,
    read: rows => {
      if (rows.length < 3) return { value: 0, detail: 'not enough steps recorded to judge' }
      // The biggest single fall between consecutive steps. A quiz always loses
      // people gradually; one step losing far more than its neighbours is the
      // thing worth reading, so the report names it rather than the total.
      let worst = { qid: '', drop: 0, from: 0 }
      for (let i = 1; i < rows.length; i++) {
        const from = Number(rows[i - 1].people || 0)
        const to = Number(rows[i].people || 0)
        const drop = from > 0 ? ((from - to) / from) * 100 : 0
        if (drop > worst.drop) worst = { qid: String(rows[i].qid), drop, from }
      }
      return {
        value: worst.drop > 25 && worst.from >= 20 ? 1 : 0,
        detail: `worst step "${worst.qid}" loses ${worst.drop.toFixed(0)}% of the ${worst.from} who reached the one before it`,
      }
    },
  },
  {
    key: 'slow_pages',
    claim: 'a page got slow enough to cost sales',
    // A result page that takes four seconds is a result page nobody reads.
    // PostHog captures web vitals for free and nobody has ever looked at them.
    threshold: 0,
    severity: 'warn',
    sql: `SELECT replaceRegexpOne(toString(properties.$current_url), '\\?.*$', '') AS page,
                 round(quantile(0.75)(toFloat(properties.$web_vitals_LCP_value)) / 1000, 2) AS lcp_s,
                 count() AS n
          FROM events
          -- 24 HOURS, not 6. At 6 the HAVING floor below never filled, so this
          -- check returned no rows, scored 0 and passed every single time.
          -- Page speed does not change hourly; the window should match the
          -- signal, not the schedule.
          WHERE event = '$web_vitals' AND timestamp > now() - INTERVAL 24 HOUR
            AND toString(properties.$current_url) NOT LIKE '%/admin%'
            AND toFloat(properties.$web_vitals_LCP_value) > 0
          GROUP BY page HAVING count() >= 20 ORDER BY lcp_s DESC LIMIT 5`,
    read: rows => {
      // 2.5s is Google's "needs improvement" line; 4s is "poor". Judge on the
      // 75th percentile, which is what Core Web Vitals reports on, so one slow
      // phone on a train does not raise an alarm.
      const bad = rows.filter(r => Number(r.lcp_s || 0) > 4)
      return {
        value: bad.length,
        detail: rows.length
          ? rows.map(r => `${String(r.page || '').replace(/^https?:\/\/[^/]+/, '') || '/'} ${r.lcp_s}s`).join(' | ')
          : 'no web vitals in window',
      }
    },
  },
  {
    key: 'experiment_health',
    claim: 'a running experiment is splitting unevenly',
    // An experiment whose arms drift apart is not measuring what it thinks it
    // is. Cheap to check, and the alternative is discovering it at the end
    // when the result has to be thrown away.
    threshold: 0,
    severity: 'warn',
    sql: `SELECT toString(properties.experiment) AS exp, toString(properties.variant) AS arm, uniq(properties.$session_id) AS people
          FROM events
          WHERE event = 'experiment_exposure' AND timestamp > now() - INTERVAL 24 HOUR
          GROUP BY exp, arm ORDER BY exp, arm`,
    read: rows => {
      if (!rows.length) return { value: 0, detail: 'no exposures in the last 24h' }
      const byExp = new Map<string, number[]>()
      for (const r of rows) {
        const k = String(r.exp)
        byExp.set(k, [...(byExp.get(k) ?? []), Number(r.people || 0)])
      }
      const skewed: string[] = []
      const seen: string[] = []
      for (const [exp, arms] of Array.from(byExp)) {
        const total = arms.reduce((a, b) => a + b, 0)
        seen.push(`${exp} ${arms.join('/')}`)
        // Only judge once there is enough traffic for a split to mean anything.
        if (total < 40 || arms.length < 2) continue
        const share = Math.max(...arms) / total
        if (share > 0.65) skewed.push(`${exp} is ${Math.round(share * 100)}% one arm`)
      }
      return { value: skewed.length, detail: skewed.length ? skewed.join(' | ') : seen.join(' | ') }
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
export async function runUxWatch(sb?: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }): Promise<UxSignal[]> {
  const out: UxSignal[] = []
  for (const q of UX_QUERIES) {
    try {
      if (q.source === 'supabase') {
        if (!sb) throw new Error('no Supabase client passed for a supabase-sourced check')
        const { data, error } = await sb.rpc('ux_watch_sql', { q: q.sql })
        if (error) throw new Error(String((error as { message?: string }).message ?? error))
        const r = (Array.isArray(data) ? data : [data]).filter(Boolean) as any[]
        const { value, detail } = q.read(r)
        out.push({ key: q.key, claim: q.claim, value, threshold: q.threshold, ok: value <= q.threshold, detail, severity: q.severity })
        continue
      }
      const r = await rows(q.sql)
      const { value, detail } = q.read(r)
      out.push({ key: q.key, claim: q.claim, value, threshold: q.threshold, ok: value <= q.threshold, detail, severity: q.severity })
    } catch (e) {
      // A failed check reports NOT ok. It used to report ok:true with a
      // "could not run" note, which renders as silence and reads as all-clear
      // — the exact failure this watcher exists to prevent, sitting inside the
      // watcher itself.
      out.push({
        key: q.key, claim: q.claim, value: q.threshold + 1, threshold: q.threshold, ok: false,
        detail: `CHECK FAILED, so this signal is unknown rather than fine: ${e instanceof Error ? e.message : 'unknown'}`,
        severity: q.severity,
      })
    }
  }
  return out
}
