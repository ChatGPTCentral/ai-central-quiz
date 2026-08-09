// Ask PostHog the standing questions, write the answers into Supabase.
//
// WHY THIS EXISTS. PostHog's read API needs a personal API key. That key lives
// in Vercel and should stay there - - it is a credential that can read every
// session recording we have. But the whole point of moving off Clarity was that
// someone other than a human in a dashboard needs to be able to read behaviour.
//
// So the app asks the questions and parks the answers in Supabase, which is
// already readable. No analytics credential leaves Vercel, and the daily audit
// gets a table it can query instead of an API it cannot reach.
//
// Runs from the admin session (hit it in a browser) or from the cron with the
// usual Bearer CRON_SECRET, so the same code serves "check it now" and "check
// it every morning".

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { hogql, posthogProjectId } from '@/lib/posthog-read'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** The standing questions. Add here, not in a dashboard nobody re-opens. */
const QUERIES: { key: string; hogql: string }[] = [
  {
    // The "is it actually on" check, and the first thing to look at every day.
    key: 'event_counts_24h',
    hogql: `SELECT event, count() AS n, max(timestamp) AS latest
            FROM events WHERE timestamp > now() - INTERVAL 1 DAY
            GROUP BY event ORDER BY n DESC LIMIT 50`,
  },
  {
    // Quiz drop-off by QUESTION, not by step number. The step number lies the
    // moment the order changes, which is how jobLevel got blamed for the name
    // field's losses on 2026-08-07.
    key: 'quiz_step_dropoff_7d',
    hogql: `SELECT properties.question_id AS question_id,
                   count(DISTINCT person_id) AS people
            FROM events
            WHERE event = 'quiz_step_viewed' AND timestamp > now() - INTERVAL 7 DAY
            GROUP BY question_id ORDER BY people DESC LIMIT 30`,
  },
  {
    // Where sessions end. The 40% who reach the quiz and never tap live here.
    key: 'exit_pages_7d',
    hogql: `SELECT properties.$current_url AS url, count() AS n
            FROM events
            WHERE event = '$pageleave' AND timestamp > now() - INTERVAL 7 DAY
            GROUP BY url ORDER BY n DESC LIMIT 30`,
  },
  // ── The buyer cohort ────────────────────────────────────────────────
  // The whole point of putting purchases into PostHog. Everything above says
  // what people do; these say what BUYERS do differently, which is the only
  // version of the question that can change what we build.
  {
    key: 'buyers_vs_rest_30d',
    hogql: `SELECT
              if(person.properties.is_buyer, 'buyer', 'rest') AS who,
              uniq(person_id) AS people,
              count() AS events,
              round(count() / uniq(person_id), 1) AS events_per_person
            FROM events
            WHERE timestamp > now() - INTERVAL 30 DAY
            GROUP BY who`,
  },
  {
    // Do buyers see MORE of the page, or fewer things but the right ones?
    key: 'buyer_events_30d',
    hogql: `SELECT event,
                   uniq(person_id) FILTER (WHERE person.properties.is_buyer) AS buyers,
                   uniq(person_id) FILTER (WHERE NOT person.properties.is_buyer) AS others
            FROM events
            WHERE timestamp > now() - INTERVAL 30 DAY
            GROUP BY event ORDER BY buyers DESC LIMIT 30`,
  },
  {
    // Do buyers come back before paying, or buy on the first visit? This is
    // the single biggest lever on whether nurture is worth building.
    key: 'buyer_sessions_before_purchase_30d',
    hogql: `SELECT person_id, uniq($session_id) AS sessions
            FROM events
            WHERE timestamp > now() - INTERVAL 30 DAY AND person.properties.is_buyer
            GROUP BY person_id ORDER BY sessions DESC LIMIT 100`,
  },
  {
    // Where buyers came from, from PostHog's own attribution rather than ours,
    // so the two can be checked against each other.
    key: 'buyer_sources_30d',
    hogql: `SELECT properties.$initial_utm_source AS source, uniq(person_id) AS buyers
            FROM events
            WHERE timestamp > now() - INTERVAL 30 DAY AND person.properties.is_buyer
            GROUP BY source ORDER BY buyers DESC LIMIT 20`,
  },
  {
    // Breakage, with a real message rather than Clarity's bare count.
    key: 'exceptions_7d',
    hogql: `SELECT properties.$exception_message AS message, count() AS n
            FROM events
            WHERE event = '$exception' AND timestamp > now() - INTERVAL 7 DAY
            GROUP BY message ORDER BY n DESC LIMIT 30`,
  },
]

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

/**
 * Which PostHog-ish variables this deployment can actually see, by NAME ONLY.
 *
 * "Not set" is a useless error message: it cannot distinguish "you forgot" from
 * "you called it something else" from "you scoped it to Preview". Listing the
 * names present turns a guessing game into a diff. Values are never returned,
 * and never will be - - a personal API key can read every session recording we
 * hold, so it must not be echoed by a route that only needs to prove it exists.
 */
function posthogEnvNames(): string[] {
  return Object.keys(process.env).filter(k => /posthog/i.test(k)).sort()
}

/** Run one standing question. Plumbing lives in lib/posthog-read.ts so this
 *  route and the buyer backfill cannot disagree about how to reach PostHog. */
async function runHogql(query: string): Promise<{ rows: unknown[]; error?: string }> {
  const { rows, columns, error } = await hogql(query)
  if (error) {
    const seen = posthogEnvNames()
    return { rows: [], error: `${error} · PostHog variable NAMES visible here: ${seen.length ? seen.join(', ') : 'NONE'}.` }
  }
  // PostHog returns positional arrays plus a column list. Zip them, because a
  // bare array of arrays is unreadable six weeks later.
  return {
    rows: rows.map(r => (Array.isArray(r) ? Object.fromEntries(columns.map((c, i) => [c, r[i]])) : r)),
  }
}

export async function GET(req: NextRequest) {
  // Either an admin in a browser, or the cron.
  const cronSecret = process.env.CRON_SECRET
  const viaCron = !!cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`
  const viaAdmin = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!viaCron && !viaAdmin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const c = sb()
  // Resolved once and reported, so "it returned nothing" can be told apart from
  // "it could not find the project" without reading a log.
  const resolvedProject = await posthogProjectId()
  const summary: { key: string; rows: number; error?: string }[] = []

  for (const q of QUERIES) {
    const { rows, error } = await runHogql(q.hogql)
    await c.from('posthog_snapshots').insert({
      query_key: q.key,
      hogql: q.hogql,
      rows,
      row_count: rows.length,
      error: error ?? null,
    })
    summary.push({ key: q.key, rows: rows.length, error })
  }

  return NextResponse.json({
    ok: summary.every(s => !s.error),
    ranAt: new Date().toISOString(),
    // Names only. Enough to spot a typo or a wrong environment scope without
    // ever putting a credential in an HTTP response.
    posthogEnvVarsVisible: posthogEnvNames(),
    deploymentSees: {
      personalApiKey: !!process.env.POSTHOG_PERSONAL_API_KEY,
      projectIdConfigured: !!process.env.POSTHOG_PROJECT_ID,
      projectIdUsed: resolvedProject.id ?? null,
      projectIdSource: process.env.POSTHOG_PROJECT_ID ? 'env' : resolvedProject.id ? 'discovered from the API key' : 'unresolved',
      projectIdError: resolvedProject.error ?? null,
      publicKey: !!process.env.NEXT_PUBLIC_POSTHOG_KEY,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || '(default us)',
    },
    queries: summary,
    note: 'Answers written to the posthog_snapshots table.',
  })
}
