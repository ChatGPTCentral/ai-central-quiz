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
  // Vercel cron sends its own header; a human can pass the cron secret.
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const secret = process.env.CRON_SECRET
  const authed = isCron || (!!secret && req.nextUrl.searchParams.get('secret') === secret)
  if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const signals = await runUxWatch()
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
