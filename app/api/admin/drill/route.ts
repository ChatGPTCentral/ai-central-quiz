// Open a cell. Return the rows that made it.
//
// The owner's ask, 2026-08-11: "a UI way for me to see the cells that have
// been used to compute and drill through these numbers, just as it happens on
// the spreadsheet". Two days had gone into diagnosing totals nobody could
// expand, and a total you cannot expand is a total you have to take on faith.
//
// The important part is what this route does NOT do: it does not re-query the
// numbers with its own SQL. It calls classifyLedger(), the same function the
// dashboard sums, and filters the resulting entries by kind and bucket using
// the same bucketKey(). So the drawer cannot politely disagree with the cell
// it opened. If they ever differ, the classification is wrong for both, which
// is exactly the failure mode worth having.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { MIRROR_START_ISO } from '@/lib/dashboard-queries'
import {
  classifyLedger,
  loadLedgerAndCharges,
  bucketKey,
  isQuizEarned,
  type Gran,
  type Entry,
  type TrialPoint,
} from '@/lib/trial-entries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A row as the drawer shows it. Money rows and count rows share one shape so
 *  the table renders identically whichever kind of cell was opened. */
type DrillRow = {
  chargeId: string
  personKey: string
  name: string | null
  customerId: string | null
  submissionId: string | null
  /** The date that put this row in this column. */
  at: string
  /** When the money actually moved, which for a quiz-earned row is not `at`. */
  chargedAt: string
  usd: number | null
  why: string
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

const asRow = (e: Entry): DrillRow => ({
  chargeId: e.chargeId, personKey: e.personKey, name: e.name, customerId: e.customerId,
  submissionId: e.submissionId, at: e.at, chargedAt: e.chargedAt, usd: e.usd, why: e.why,
})

const TRIAL_WHY: Record<string, string> = {
  quiz_net_new: 'took the quiz, then paid, and had never paid us before',
  quiz_existing: 'took the quiz, then paid again, having paid us before',
  not_quiz: 'never took the quiz, or took it only after paying',
}

const trialRow = (t: TrialPoint): DrillRow => ({
  chargeId: t.chargeId, personKey: t.personKey, name: t.name, customerId: t.customerId,
  submissionId: t.submissionId, at: t.at, chargedAt: t.chargedAt,
  usd: t.trialCents / 100,
  why: TRIAL_WHY[t.attribution] ?? t.attribution,
})

export async function GET(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const metric = sp.get('metric') || ''
  const gran = (sp.get('gran') || 'week') as Gran
  // Either one bucket (a cell) or the visible list (the All window column).
  // Passing the list rather than a date range is deliberate: the total column
  // sums exactly the columns on screen, so the drawer must too.
  const buckets = (sp.get('buckets') || '').split(',').filter(Boolean)
  if (!metric || !buckets.length) return NextResponse.json({ error: 'metric and buckets are required' }, { status: 400 })
  if (gran !== 'day' && gran !== 'week' && gran !== 'month') {
    return NextResponse.json({ error: 'bad gran' }, { status: 400 })
  }

  const want = new Set(buckets)
  const inWindow = (at: string) => want.has(bucketKey(at, gran))

  let rows: DrillRow[] = []
  let money = true
  try {
    const { ledger, charges } = await loadLedgerAndCharges(db(), MIRROR_START_ISO)
    const { entries, trialPoints } = classifyLedger(ledger, charges, MIRROR_START_ISO)
    const ofKind = (...kinds: Entry['kind'][]) =>
      entries.filter(e => kinds.includes(e.kind) && inWindow(e.at)).map(asRow)
    const trials = (pick: (t: TrialPoint) => boolean) =>
      trialPoints.filter(t => pick(t) && inWindow(t.at)).map(trialRow)

    switch (metric) {
      // ── money ──
      case 'rev_all': rows = ofKind('net', 'quizExisting', 'notQuiz', 'annualQuiz', 'annualNotQuiz', 'other'); break
      case 'rev_net': rows = ofKind('net'); break
      case 'rev_existing': rows = ofKind('quizExisting'); break
      case 'rev_notquiz': rows = ofKind('notQuiz'); break
      case 'rev_won_quiz': rows = ofKind('annualQuiz'); break
      case 'rev_won_noquiz': rows = ofKind('annualNotQuiz'); break
      case 'rev_other': rows = ofKind('other'); break
      // ── counts ──
      case 'trials_all': money = false; rows = trials(() => true); break
      case 'trials_net': money = false; rows = trials(t => t.attribution === 'quiz_net_new'); break
      case 'trials_existing': money = false; rows = trials(t => t.attribution === 'quiz_existing'); break
      case 'trials_notquiz': money = false; rows = trials(t => t.attribution === 'not_quiz'); break
      case 'trials_quiz_earned': money = false; rows = trials(t => isQuizEarned(t.attribution)); break
      case 'conversions': money = false
        rows = trialPoints.filter(t => t.due && t.converted && inWindow(t.at)).map(t => ({
          ...trialRow(t),
          usd: t.convertedCents != null ? t.convertedCents / 100 : null,
          why: t.lifetimeBundle
            ? 'bought the lifetime outright, counted as won, no renewal to come'
            : `renewed on ${(t.convertedAt || '').slice(0, 10)}`,
        }))
        break
      case 'completions': {
        // The register row: every completed quiz from submissions, bucketed by
        // quiz_completed_at with the same bucketKey the cell used, so the
        // drawer count always equals the cell. Each row is annotated with the
        // door its stitched journey walked through and WHERE that journey is
        // counted — including the clock-skew case (landed in an earlier week,
        // so that week's door A column holds the completion) that makes door
        // rows not sum into register columns. The door label is derived here
        // from the same submission-id stitching the loader uses; the COUNT is
        // exact by construction, the label is the explanation.
        money = false
        const q = `select s.id, s.quiz_completed_at as at, s.name, s.email, e.land_t, e.start_t, e.result_t
from submissions s
left join (
  select l.sid,
    min(f.ts) filter (where f.event = 'quiz_view') as land_t,
    min(f.ts) filter (where f.event in ('quiz_start','quiz_submit')) as start_t,
    min(f.ts) filter (where f.event in ('result_view','quiz_submit')) as result_t
  from (
    select distinct f2.submission_id as sid, f2.anon_id
    from funnel_events f2
    where f2.anon_id is not null and f2.submission_id is not null
  ) l
  join funnel_events f on f.anon_id = l.anon_id
  group by l.sid
) e on e.sid = s.id
where s.quiz_completed_at >= '2026-07-05' and not coalesce(s.is_test, false)`
        const { data, error } = await db().rpc('ux_watch_sql', { q })
        if (error) throw new Error(String((error as { message?: string }).message ?? error))
        const list = (Array.isArray(data) ? data : []) as { id: string; at: string; name: string | null; email: string | null; land_t: string | null; start_t: string | null; result_t: string | null }[]
        rows = list.filter(r => r.at && inWindow(r.at)).map(r => {
          const first = r.start_t ?? r.result_t
          let why: string
          if (!r.land_t && !r.start_t && !r.result_t) {
            why = 'off camera: the browser sent no events (blocker era, before the Aug 13 server row)'
          } else if (r.land_t && first && r.land_t <= first) {
            const skew = bucketKey(r.land_t, gran) !== bucketKey(r.at, gran)
            why = `door A: landed ${r.land_t.slice(0, 10)}${skew ? ' — that period’s door A column holds this completion' : ''}`
          } else if (r.start_t) {
            why = r.land_t
              ? 'door B: started the quiz first, touched the landing page only after'
              : `door B: straight into the quiz on ${r.start_t.slice(0, 10)}, no landing view`
          } else {
            why = 'door C shape: the camera saw only their result page, the quiz events were blocked'
          }
          return { chargeId: r.id, personKey: r.email || '(no email)', name: r.name, customerId: null, submissionId: r.id, at: r.at, chargedAt: r.at, usd: null, why }
        })
        break
      }
      default:
        return NextResponse.json({ error: `unknown metric ${metric}` }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }

  rows.sort((a, b) => b.at.localeCompare(a.at))
  const total = rows.reduce((a, r) => a + (r.usd ?? 0), 0)
  // 500 keeps a runaway cell from shipping a megabyte of JSON; the count is
  // the honest one either way, and the drawer says when it is showing fewer.
  const capped = rows.length > 500
  return NextResponse.json({
    metric, gran, money,
    count: rows.length,
    total: Math.round(total * 100) / 100,
    capped,
    rows: capped ? rows.slice(0, 500) : rows,
  })
}
