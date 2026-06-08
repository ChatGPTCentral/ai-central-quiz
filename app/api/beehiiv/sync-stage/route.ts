import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { updateSubscriberStage } from '@/lib/beehiiv'
import { checkRateLimit } from '@/lib/validation'

export const runtime = 'nodejs'

/**
 * POST /api/beehiiv/sync-stage
 *
 * Inbound from the ai-central-library when a reader graduates a stage
 * track. Body: { email, stage } as JSON. Authenticated by an HMAC-SHA256
 * signature of the raw body in the `x-signature` header (hex), keyed on
 * LIBRARY_GRADUATE_SECRET — same secret the library uses to sign the call.
 *
 * Library responsibility: it has already updated `submissions.stage` in
 * the quiz Supabase by the time it calls us. Our job is the Beehiiv
 * side — PATCH the stage custom field + add the new stage tag so the
 * downstream marketing automation enrolls into the next-rung sequence.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ ok: false, error: 'Rate limited' }, { status: 429 })
  }

  const secret = process.env.LIBRARY_GRADUATE_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 503 })
  }

  const raw = await req.text()
  const sig = req.headers.get('x-signature') ?? ''
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const sigBuf = Buffer.from(sig, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ ok: false, error: 'Bad signature' }, { status: 401 })
  }

  let body: { email?: string; stage?: string }
  try { body = JSON.parse(raw) } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }
  const email = body.email?.trim().toLowerCase()
  const stage = body.stage?.trim()
  if (!email || !stage) {
    return NextResponse.json({ ok: false, error: 'email and stage required' }, { status: 400 })
  }

  const result = await updateSubscriberStage({ email, stage })
  if (!result.success) {
    const status = result.error === 'NOT_SUBSCRIBED' ? 404 : 502
    return NextResponse.json({ ok: false, error: result.error }, { status })
  }
  return NextResponse.json({ ok: true, subscriptionId: result.subscriptionId })
}
