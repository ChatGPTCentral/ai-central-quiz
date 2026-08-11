// Start the next experiment the moment the current one finishes.
//
// The owner's instruction, 2026-08-11: set up result_strip_v1 and start it
// when landing_cta_v1 ends. Two ways to honour that. One is to remember, which
// means the queued experiment starts whenever somebody next looks at the board
// — and at ~1,100 result views a fortnight, a week of forgetting is a third of
// the sample. The other is this: check hourly, promote automatically, and the
// only cost of nobody looking is nothing at all.
//
// DELIBERATELY NARROW. It promotes exactly one named experiment, only from
// draft, only once its named predecessor has actually ended. It cannot start
// anything else, cannot restart anything, and cannot stop anything. An
// automation that could launch arbitrary experiments at real visitors is not
// worth the convenience.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** who waits for whom. One row, on purpose: a general queue would need
 *  ordering rules nobody has asked for. */
const RELAY: { after: string; start: string }[] = [
  { after: 'landing_cta_v1', start: 'result_strip_v1' },
]

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const secret = process.env.CRON_SECRET
  const authed = isCron || (!!secret && req.nextUrl.searchParams.get('secret') === secret)
  if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const c = db()
  const acted: string[] = []
  const waiting: string[] = []

  for (const r of RELAY) {
    const { data: prev } = await c.from('experiments').select('key, status').eq('key', r.after).maybeSingle()
    const { data: next } = await c.from('experiments').select('key, status').eq('key', r.start).maybeSingle()
    if (!prev || !next) { waiting.push(`${r.start}: one of the pair is missing`); continue }
    if (next.status !== 'draft') { waiting.push(`${r.start}: already ${next.status}`); continue }
    if (prev.status !== 'ended') { waiting.push(`${r.start}: waiting on ${r.after} (${prev.status})`); continue }

    // Conditional on status still being 'draft', so two overlapping runs cannot
    // both "start" it and stamp started_at twice.
    const { data: started, error } = await c
      .from('experiments')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('key', r.start).eq('status', 'draft')
      .select('key')
    if (error) { waiting.push(`${r.start}: ${error.message}`); continue }
    if (started?.length) acted.push(`${r.start} started, ${r.after} has ended`)
  }

  if (acted.length) console.log('[experiment-relay]', acted.join(' | '))
  return NextResponse.json({ ok: true, acted, waiting })
}
