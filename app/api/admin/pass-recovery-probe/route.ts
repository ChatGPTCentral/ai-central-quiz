// Call the candidate query through the EXACT path the cron uses, and show the
// raw answer.
//
// Why this exists. On 2026-08-07 the first armed Pass Recovery run enrolled 50
// people, 49 of whom had no result_view anywhere inside the 60min-24h window.
// Called directly in SQL with the same arguments, the function returns only the
// last 24 hours, with every column populated. Both cannot be true, so the fault
// is not in the data and not in the function body: it is somewhere in
// supabase-js -> PostgREST -> Postgres, which is the one link that cannot be
// inspected from the SQL editor.
//
// The tell was the SHAPE of what came back. The cron received null name, score,
// persona and stage, and built a result URL with only an id. The first version
// of this function returned exactly three columns (id, email, saw_result); the
// current one returns seven. The cron was answered by something with v1's
// contract, which is the classic signature of a stale PostgREST schema cache.
//
// So this route asks the question directly: what does the RPC hand back RIGHT
// NOW, through the client library, byte for byte? It reports the keys present
// on the first row (three or seven), and how many rows fall outside the window
// the arguments asked for. Read-only, enrols nobody, sends nothing.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const MIN_AGE_MIN = 60
const MAX_AGE_H = 24

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const limit = Number(req.nextUrl.searchParams.get('limit') || 50)
  const c = sb()

  const { data, error } = await c.rpc('pass_recovery_candidates', {
    p_min_age_minutes: MIN_AGE_MIN,
    p_max_age_hours: MAX_AGE_H,
    p_limit: limit,
  })
  if (error) return NextResponse.json({ verdict: 'RPC ERRORED', error: error.message }, { status: 500 })

  const rows = (data || []) as Record<string, unknown>[]
  const now = Date.now()
  const ageHours = (ts: unknown) =>
    typeof ts === 'string' ? (now - Date.parse(ts)) / 3_600_000 : NaN

  const ages = rows.map(r => ageHours(r.saw_result)).filter(n => Number.isFinite(n))
  const outOfWindow = ages.filter(h => h < MIN_AGE_MIN / 60 || h > MAX_AGE_H)
  const keys = rows[0] ? Object.keys(rows[0]) : []

  // Seven keys and no out-of-window rows means the path is healthy and the
  // 2026-08-07 fault was transient. Three keys reproduces it, and the cause is
  // PostgREST answering with the old contract.
  const shapeOk = ['id', 'email', 'saw_result', 'name', 'score', 'persona', 'stage']
    .every(k => keys.includes(k))
  const verdict =
    rows.length === 0 ? 'NO CANDIDATES (inconclusive, try again when someone is in the window)'
    : !shapeOk ? 'REPRODUCED: response is missing columns, PostgREST is answering with a stale contract'
    : outOfWindow.length > 0 ? 'REPRODUCED: rows returned outside the window the arguments asked for'
    : 'HEALTHY: correct shape, every row inside the window'

  return NextResponse.json({
    verdict,
    askedFor: { minAgeMinutes: MIN_AGE_MIN, maxAgeHours: MAX_AGE_H, limit },
    rowsReturned: rows.length,
    keysOnFirstRow: keys,
    expectedKeys: ['id', 'email', 'saw_result', 'name', 'score', 'persona', 'stage'],
    shapeOk,
    outOfWindowCount: outOfWindow.length,
    ageHoursRange: ages.length
      ? { oldest: Math.round(Math.max(...ages) * 10) / 10, newest: Math.round(Math.min(...ages) * 10) / 10 }
      : null,
    // Enough of a row to see whether the merge fields would be populated, with
    // the email masked because this is a diagnostic, not a people export.
    firstRow: rows[0]
      ? { ...rows[0], email: String(rows[0].email ?? '').replace(/(.{2}).*(@.*)/, '$1***$2') }
      : null,
  })
}
