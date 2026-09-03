// The UX health table, from PostHog instead of Clarity.
//
// This is the re-map that has to exist BEFORE the Clarity snapshot is switched
// off, not after. /admin/experiments renders a "UX health" table fed by
// clarityUxByPage(); kill the snapshot cron first and that table quietly empties
// over seven days, which is the exact failure mode this whole week has been
// about — a screen that keeps rendering while the thing behind it has stopped.
//
// Same shape as UxPageRow so the table renders unchanged, and strictly more
// than Clarity gave:
//   · dead and rage clicks now carry the ELEMENT, not just a page total
//   · quickback is derived rather than reported, so its definition is visible
//     and arguable instead of being Microsoft's private heuristic
//   · errors are named, where Clarity could only ever count them
//
// FIXED 2026-09-03: quickback used to check PostHog for event IN
// ('$autocapture', 'quiz_start', 'checkout_click', '$dead_click') — but
// quiz_start and checkout_click are OUR OWN first-party events, sent only
// to funnel_events (lib/events-client.ts posts to /api/events, never to
// PostHog), and $autocapture has not fired once in 30 days on this project
// (checked against PostHog's own live taxonomy), so that condition had
// silently degraded to "did a dead click happen" — true for almost no
// session on any page, which is why quickback read as a near-universal
// crisis everywhere it was checked. PostHog cannot see our funnel events,
// so it cannot answer "did this person do anything meaningful" by our own
// definition of meaningful. What it CAN honestly answer: did PostHog
// record anything else about this visit at all. quickback now means a
// session whose entire PostHog record is the one pageview and nothing
// else — a real, PostHog-only signal, smaller in scope than before but
// true.

import { hogql } from '@/lib/posthog-read'

export interface UxPageRow {
  url: string
  sessions: number
  scrollDepth: number | null
  rage: number
  dead: number
  quickback: number
  scriptErrors: number
  days: number
  /** New, and the reason this is an improvement: WHICH element is dead. */
  worstElement: string | null
}

/**
 * Per-page UX signals over the last `days`.
 *
 * Never throws: the caller renders an empty state, and a health table that can
 * take a page down is worse than no health table.
 */
export async function uxByPage(days = 7): Promise<{ rows: UxPageRow[]; snapshotDays: number; lastFetched: string | null }> {
  const sql = `
    WITH quiet AS (
      SELECT properties.$session_id AS sid FROM events
      WHERE timestamp > now() - INTERVAL ${days} DAY
      GROUP BY sid
      HAVING count() = 1
    )
    SELECT
      splitByChar('?', toString(properties.$current_url))[1] AS url,
      uniqIf(properties.$session_id, event = '$pageview') AS sessions,
      countIf(event = '$rageclick') AS rage,
      countIf(event = '$dead_click') AS dead,
      uniqIf(properties.$session_id, event = '$pageview' AND properties.$session_id IN (SELECT sid FROM quiet)) AS quickback,
      countIf(event = '$exception') AS script_errors,
      argMaxIf(coalesce(nullIf(toString(properties.$el_text), ''), '(no text)'), 1, event = '$dead_click') AS worst_element
    FROM events
    WHERE timestamp > now() - INTERVAL ${days} DAY
      AND toString(properties.$current_url) NOT LIKE '%/admin%'
    GROUP BY url
    HAVING sessions >= 5
    ORDER BY sessions DESC
    LIMIT 25`

  const r = await hogql(sql)
  if (r.error) return { rows: [], snapshotDays: 0, lastFetched: null }
  const idx = (c: string) => r.columns.indexOf(c)
  const rows: UxPageRow[] = r.rows.map(row => {
    const g = (c: string) => (row as unknown[])[idx(c)]
    return {
      url: String(g('url') ?? ''),
      sessions: Number(g('sessions') ?? 0),
      // PostHog reports scroll depth per pageview rather than per URL in a way
      // this query can cheaply roll up. Null renders as "–", which is honest;
      // an invented number would not be.
      scrollDepth: null,
      rage: Number(g('rage') ?? 0),
      dead: Number(g('dead') ?? 0),
      quickback: Number(g('quickback') ?? 0),
      scriptErrors: Number(g('script_errors') ?? 0),
      days,
      worstElement: (g('worst_element') as string) || null,
    }
  })
  return { rows, snapshotDays: days, lastFetched: new Date().toISOString() }
}
