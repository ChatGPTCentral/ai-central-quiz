// First-party funnel event sink.
//
// POST /api/events — no auth (public funnel beacon), but hardened:
//   - event-name allowlist (unknown events are dropped with 204, not stored)
//   - in-memory rate limit per IP (best-effort per lambda)
//   - body size cap + per-field truncation
//   - accepts text/plain so navigator.sendBeacon needs no CORS preflight
//
// Exposure events additionally maintain experiment_assignments and set the
// sticky per-experiment variant cookie (ac_exp_<key>) — the ONLY place a
// public request may write a cookie. Variant validity is checked against
// the running experiment config so clients can't invent variants.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { isValidRunningVariant } from '@/lib/experiments'

export const runtime = 'nodejs'

const ALLOWED_EVENTS = new Set([
  // funnel
  'quiz_view', 'quiz_start', 'email_view', 'q_answered', 'email_submitted',
  'assembling_view', 'result_view',
  // conversion
  'checkout_click',
  // experimentation
  'exposure',
  // exit rescue
  'exit_rescue_shown', 'exit_rescue_accepted', 'exit_rescue_dismissed',
  // starter kit
  'starter_kit_view', 'starter_kit_click',
  // viral loop (share → pass → new taker)
  'share_click', 'pass_view',
  // CTA impressions (view side of the per-placement CTR)
  'placement_view',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENT_RE = /^[a-z0-9_]{1,40}$/

// Sibling of lib/validation.ts checkRateLimit with a higher cap — a full
// funnel session emits <20 events. In-memory per lambda, best-effort.
const rl = new Map<string, { count: number; resetAt: number }>()
function allowIp(ip: string): boolean {
  if (process.env.NODE_ENV === 'development') return true
  const now = Date.now()
  const e = rl.get(ip)
  if (!e || now > e.resetAt) {
    rl.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return true
  }
  if (e.count >= 120) return false
  e.count++
  return true
}

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const s = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

interface IncomingEvent {
  event?: string
  sessionId?: string
  path?: string
  utmSource?: string
  submissionId?: string
  experimentKey?: string
  variantKey?: string
  props?: Record<string, unknown>
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!allowIp(ip)) return new NextResponse(null, { status: 429 })

  // sendBeacon posts text/plain — read raw and parse ourselves.
  let raw: string
  try { raw = await req.text() } catch { return new NextResponse(null, { status: 400 }) }
  if (!raw || raw.length > 4096) return new NextResponse(null, { status: 400 })

  let body: IncomingEvent | { events?: IncomingEvent[] }
  try { body = JSON.parse(raw) } catch { return new NextResponse(null, { status: 400 }) }

  const list: IncomingEvent[] = Array.isArray((body as { events?: IncomingEvent[] }).events)
    ? (body as { events: IncomingEvent[] }).events.slice(0, 10)
    : [body as IncomingEvent]

  const anonRaw = req.cookies.get('ac_aid')?.value
  const anonId = anonRaw && UUID_RE.test(anonRaw) ? anonRaw : null
  const ipHash = createHash('sha256')
    .update(ip + (process.env.ADMIN_SESSION_SECRET || 'ac'))
    .digest('hex')
    .slice(0, 32)
  const userAgent = s(req.headers.get('user-agent'), 200)

  const rows: Record<string, unknown>[] = []
  for (const ev of list) {
    const event = typeof ev.event === 'string' && EVENT_RE.test(ev.event) ? ev.event : null
    if (!event || !ALLOWED_EVENTS.has(event)) continue
    const subRaw = s(ev.submissionId, 40) || (typeof ev.props?.submissionId === 'string' ? ev.props.submissionId : null)
    let props: Record<string, unknown> = {}
    if (ev.props && typeof ev.props === 'object') {
      const serialized = JSON.stringify(ev.props)
      if (serialized.length <= 2048) props = ev.props
    }
    rows.push({
      event,
      anon_id: anonId,
      session_id: s(ev.sessionId, 64),
      submission_id: subRaw && UUID_RE.test(subRaw) ? subRaw : null,
      path: s(ev.path, 200),
      experiment_key: s(ev.experimentKey, 64),
      variant_key: s(ev.variantKey, 64),
      props,
      utm_source: s(ev.utmSource, 120),
      ip_hash: ipHash,
      user_agent: userAgent,
    })
  }
  if (rows.length === 0) return new NextResponse(null, { status: 204 })

  try {
    const c = sb()

    // Exposures must reference a RUNNING experiment + existing variant —
    // clients cannot invent experiments/variants into the results math.
    const validated: Record<string, unknown>[] = []
    for (const r of rows) {
      if (r.event === 'exposure') {
        const ok =
          typeof r.experiment_key === 'string' &&
          typeof r.variant_key === 'string' &&
          (await isValidRunningVariant(r.experiment_key, r.variant_key))
        if (!ok) continue
      }
      validated.push(r)
    }
    if (validated.length === 0) return new NextResponse(null, { status: 204 })

    const { error } = await c.from('funnel_events').insert(validated)
    if (error) console.error('[events] insert failed:', error.message)

    // Exposure bookkeeping: assignments upsert + sticky variant cookie.
    const res = new NextResponse(null, { status: 204 })
    for (const r of validated) {
      if (r.event !== 'exposure' || !r.experiment_key || !r.variant_key || !anonId) continue
      const { error: aerr } = await c.rpc('upsert_experiment_assignment', {
        p_experiment_key: r.experiment_key,
        p_anon_id: anonId,
        p_variant_key: r.variant_key,
        p_submission_id: (r.submission_id as string | null) ?? undefined,
      })
      if (aerr) console.error('[events] assignment upsert failed:', aerr.message)
      res.cookies.set(`ac_exp_${r.experiment_key}`, String(r.variant_key), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 90 * 24 * 60 * 60,
      })
    }
    return res
  } catch (err) {
    console.error('[events] sink error:', err)
    return new NextResponse(null, { status: 204 }) // never signal failure to the funnel
  }
}
