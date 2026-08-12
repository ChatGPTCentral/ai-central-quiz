// Every six hours, ask whether the product broke.
//
// The revenue guardrails ask whether the NUMBERS still add up. This asks
// whether the PRODUCT still works, which is the failure nobody was watching:
// on 2026-08-11 checkout had been refusing to load for typo'd emails for
// weeks, and the money dashboard was perfectly healthy the whole time,
// because a sale that never starts leaves no trace in Stripe.
//
// Results land in ux_checks and anything over threshold appears on the
// dashboard. Silent when the product is fine.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runUxWatch } from '@/lib/ux-watch'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
  // SAME CONTRACT AS EVERY OTHER CRON IN THIS REPO: Bearer CRON_SECRET.
  //
  // The first version of this checked for an x-vercel-cron header instead,
  // which I invented rather than copied. It fired at 00:05:33 on 2026-08-12
  // and returned 401 to Vercel's own scheduler, so the watcher built to catch
  // silent failures spent its first night silently failing to run. Meanwhile
  // pass-recovery and checkout-recovery, three files away, had the working
  // pattern the whole time.
  const secret = process.env.CRON_SECRET
  const fromCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  // OR a signed-in admin, so this is never again six hours away from an
  // answer. The schedule is for the machine; a person watching something break
  // should be able to ask right now, the way the Sync Stripe button works.
  const fromAdmin = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!fromCron && !fromAdmin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // The client is passed in because some checks read funnel_events rather
  // than PostHog. See the source field in lib/ux-watch.ts.
  const signals = await runUxWatch(db() as unknown as Parameters<typeof runUxWatch>[0])
  const failing = signals.filter(s => !s.ok)

  try {
    await db().from('ux_checks').insert({
      ran_at: new Date().toISOString(),
      passed: failing.length === 0,
      signals,
    })
  } catch (e) {
    console.warn('[ux-watch] could not record run:', e)
  }

  if (failing.length) {
    console.error('[ux-watch] PRODUCT SIGNALS OVER THRESHOLD:', failing.map(f => `${f.key}: ${f.detail}`).join(' | '))
  }

  return NextResponse.json({ ok: true, passed: failing.length === 0, signals })
}
