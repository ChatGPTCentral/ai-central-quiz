// Checkout autopsy: what happens between the click and the payment.
//
// 64% of payment intents are canceled and we have never known why, because the
// moment someone clicks the CTA they vanish into a Stripe iframe. The standard
// answer is "watch session recordings", which fails twice here: nobody has time
// to watch them, and Clarity has no API to export them, so neither a human nor
// a model can read them.
//
// So the modal is instrumented instead and this reads the result. Every
// question a recording would have answered becomes a number:
//
//   did the form even load        checkout_form_ready vs checkout_form_error
//   how slow was it               ms on secret + ready
//   how long did they stay        dwellMs on close
//   HOW did they leave            button / escape / backdrop / left_page
//
// The distinction that matters most is dwell. Leaving in 2 seconds by clicking
// the backdrop is a misclick. Leaving at 40 seconds via the X is someone who
// read the form and decided no. Those are opposite problems and today they are
// the same number.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const days = Math.min(60, Math.max(1, parseInt(req.nextUrl.searchParams.get('days') || '7', 10)))
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  const c = db()
  const { data, error } = await c
    .from('funnel_events')
    .select('event, session_id, props, ts')
    .in('event', [
      'checkout_click', 'checkout_modal_open', 'checkout_modal_close',
      'checkout_form_secret', 'checkout_form_ready', 'checkout_form_error',
    ])
    .gte('ts', since)
    .order('ts', { ascending: true })
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = { event: string; session_id: string | null; props: Record<string, unknown> | null }
  const rows = (data || []) as Row[]

  const bySession = new Map<string, Row[]>()
  for (const r of rows) {
    if (!r.session_id) continue
    const arr = bySession.get(r.session_id) || []
    arr.push(r)
    bySession.set(r.session_id, arr)
  }

  const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null)
  const secretMs: number[] = []
  const readyMs: number[] = []
  const dwellByHow: Record<string, number[]> = {}
  let clicked = 0, opened = 0, formReady = 0, formError = 0, closed = 0
  const errors: Record<string, number> = {}

  for (const evs of Array.from(bySession.values())) {
    const has = (e: string) => evs.some((x: Row) => x.event === e)
    if (has('checkout_click')) clicked++
    if (has('checkout_modal_open')) opened++
    if (has('checkout_form_ready')) formReady++
    if (has('checkout_form_error')) formError++
    for (const e of evs) {
      if (e.event === 'checkout_form_secret') { const m = num(e.props?.ms); if (m != null) secretMs.push(m) }
      if (e.event === 'checkout_form_ready') { const m = num(e.props?.ms); if (m != null) readyMs.push(m) }
      if (e.event === 'checkout_form_error') {
        const k = String(e.props?.msg || 'unknown').slice(0, 80)
        errors[k] = (errors[k] || 0) + 1
      }
      if (e.event === 'checkout_modal_close') {
        closed++
        const how = String(e.props?.how || 'unknown')
        const d = num(e.props?.dwellMs)
        if (d != null) (dwellByHow[how] ||= []).push(d)
      }
    }
  }

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)
  const stat = (a: number[]) => {
    if (!a.length) return null
    const s = [...a].sort((x, y) => x - y)
    return {
      n: s.length,
      medianMs: s[Math.floor(s.length / 2)],
      p90Ms: s[Math.floor(s.length * 0.9)],
      maxMs: s[s.length - 1],
    }
  }

  // Dwell buckets are the interpretation layer: a raw median hides that the
  // same number can mean "misclicked" and "read it and refused".
  const buckets = (a: number[]) => {
    const b = { under3s: 0, s3to10: 0, s10to30: 0, over30s: 0 }
    for (const ms of a) {
      if (ms < 3000) b.under3s++
      else if (ms < 10000) b.s3to10++
      else if (ms < 30000) b.s10to30++
      else b.over30s++
    }
    return b
  }
  const allDwell = Object.values(dwellByHow).flat()

  const notes: string[] = []
  if (opened === 0) {
    notes.push('No modal opens recorded yet. This instrumentation is new — give it a day of traffic before reading anything into it.')
  } else {
    if (formError > 0) {
      notes.push(`${formError} of ${opened} sessions had the payment form FAIL to load. That is a bug, not a persuasion problem — see errors.`)
    }
    const r = stat(readyMs)
    if (r && r.medianMs > 2500) {
      notes.push(`The form takes ${Math.round(r.medianMs / 100) / 10}s to appear at the median (p90 ${Math.round(r.p90Ms / 100) / 10}s). Slow enough to lose people who already decided to buy.`)
    }
    const b = buckets(allDwell)
    const quick = b.under3s + b.s3to10
    if (allDwell.length >= 10 && quick / allDwell.length > 0.5) {
      notes.push(`Most abandoners leave within 10 seconds (${quick} of ${allDwell.length}). That is not "the price is too high" — they are bouncing off the form before reading it. Suspect load time, layout, or a misfired click.`)
    } else if (allDwell.length >= 10 && b.over30s / allDwell.length > 0.4) {
      notes.push(`Most abandoners stay over 30 seconds (${b.over30s} of ${allDwell.length}). They read the form and said no — that is an offer, price or trust problem, not a UX one.`)
    }
  }

  return NextResponse.json({
    windowDays: days,
    sessions: {
      clickedCta: clicked,
      openedModal: opened,
      formLoaded: formReady,
      formFailed: formError,
      closedModal: closed,
      clickToOpenPct: pct(opened, clicked),
      openToFormPct: pct(formReady, opened),
    },
    formSpeed: { clientSecret: stat(secretMs), formVisible: stat(readyMs) },
    abandonment: {
      byHow: Object.fromEntries(
        Object.entries(dwellByHow).map(([how, a]) => [how, { sessions: a.length, ...stat(a)! }]),
      ),
      dwellBuckets: buckets(allDwell),
    },
    errors,
    notes,
  })
}
