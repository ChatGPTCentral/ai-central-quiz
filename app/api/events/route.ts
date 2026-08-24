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
  // Fired when someone presses next and the question would not let them
  // through. Its whole job is to go to zero: it is the counter that tells us
  // whether the inline reason replaced the dead click, or merely hid it.
  'q_blocked',
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
  'share_click', 'pass_view', 'card_download', 'pass_unlock',
  // CTA impressions (view side of the per-placement CTR)
  'placement_view',
  // free win on the result page (reciprocity before the ask)
  'free_win_view', 'free_win_copy',
  // expense-it-to-L&D block. Theory under test: the blocker is not the price,
  // it is whose money it is. Both events carry the submission id so opens and
  // copies can be split by job_level, which is what makes the theory killable:
  // if seniors do not over-index, it is a novelty button and it comes out.
  'expense_email_open', 'expense_email_copy',
  // freemium study plan: week 1 is playable, weeks 2-5 are the wall
  'free_step_open',
  // express checkout (one-tap wallets)
  'express_pay_success', 'express_pay_error',
  // checkout micro-funnel: answers "what happened between the click and the
  // payment" without anyone watching a session recording
  'checkout_modal_open', 'checkout_modal_close',
  'checkout_form_secret', 'checkout_form_ready', 'checkout_form_error',
  // mid-quiz exit catch: the /quiz exit is the single biggest volume leak
  'quiz_exit_catch_shown', 'quiz_exit_catch_resumed', 'quiz_exit_catch_dismissed',
  // Email saved FROM the exit popup. Question-first moved the email to step 10
  // of 11, so somebody who quits at question 4 used to leave no trace at all.
  // Fired only after the partial POST returns, so the count means "emails we
  // actually hold", not "times somebody typed in the box".
  'quiz_exit_catch_email',
  // unlock reveal (the honest wheel)
  'unlock_reveal_spin', 'unlock_reveal_done',
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
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
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

  // Internal traffic (the owner testing) is DROPPED here, not flagged.
  //
  // Flagging would mean every reporting query — dashboard, funnel, experiment
  // results, and every ad-hoc SQL we write — has to remember to exclude it.
  // Miss one and the numbers are quietly wrong, which is the exact failure this
  // exists to prevent. Dropping at the door is total and needs no query to
  // cooperate. Set with ?internal=1, cleared with ?internal=0.
  if (req.cookies.get('ac_internal')?.value === '1') {
    return NextResponse.json({ ok: true, suppressed: 'internal' }, { status: 200 })
  }

  const anonRaw = req.cookies.get('ac_aid')?.value
  const anonId = anonRaw && UUID_RE.test(anonRaw) ? anonRaw : null
  const ipHash = createHash('sha256')
    .update(ip + (process.env.ADMIN_SESSION_SECRET || 'ac'))
    .digest('hex')
    .slice(0, 32)
  const userAgent = s(req.headers.get('user-agent'), 200)
  // Server-derived, same header app/result/page.tsx reads to choose the
  // India lifetime offer. Stamped here, not trusted from the client, so a
  // cohort cut by country reflects the geo Vercel saw AT THIS REQUEST —
  // the same signal the offer decision itself ran on — rather than
  // submissions.country, which can be stale by however long the trial was
  // due. Answers whether a checkout_click that should have seen the
  // lifetime offer actually carried the right country at that moment.
  const ipCountry = s(req.headers.get('x-vercel-ip-country'), 8)

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
    if (ipCountry) props = { ...props, ip_country: ipCountry }
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
