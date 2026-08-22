// Set the verification state of a submission by hand — the owner's control.
//
// His law (2026-08-22): a hand validation is FINAL. Writing owner_verified or
// rejected here locks the row against every automated path (enrich-lead and
// the tuner commit both check isOwnerLocked). Sending 'unverified' is the
// deliberate unlock: it clears the verification fields AND the legacy
// enrichment_verified_at stamp, so the person re-enters the tuner queue and
// automation may touch them again. Every change lands in admin_actions.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SETTABLE = ['owner_verified', 'rejected', 'unverified'] as const

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

export async function POST(req: NextRequest) {
  const ok = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { id?: string; state?: string; note?: string } | null
  const id = body?.id?.trim()
  const state = body?.state?.trim()
  if (!id || !state) return NextResponse.json({ error: 'id and state required' }, { status: 400 })
  if (!(SETTABLE as readonly string[]).includes(state)) {
    return NextResponse.json({ error: `state must be one of ${SETTABLE.join(', ')}` }, { status: 400 })
  }

  const c = db()
  const { data: row, error: readErr } = await c
    .from('submissions')
    .select('id, email, verification_state')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'submission not found' }, { status: 404 })

  const now = new Date().toISOString()
  const note = body?.note?.trim() || null
  const update: Record<string, unknown> =
    state === 'unverified'
      ? {
          verification_state: 'unverified', verification_evidence: null,
          verified_at: null, verified_by: null,
          // Unlock is total: the legacy tuner stamp clears too, so the person
          // re-enters the verify queue instead of half-counting as confirmed.
          enrichment_verified_at: null,
        }
      : {
          verification_state: state,
          verification_evidence: note || (state === 'rejected' ? 'rejected by hand' : 'validated by hand'),
          verified_at: now, verified_by: 'owner',
          // Keep the legacy stamp in step for owner_verified so the tuner
          // queue and old readers agree with the new state.
          ...(state === 'owner_verified' ? { enrichment_verified_at: now } : {}),
        }

  const { error: upErr } = await c.from('submissions').update(update).eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  try {
    await c.from('admin_actions').insert({
      action: 'verification_set',
      person_key: (row.email as string) || id,
      detail: { submission_id: id, from: row.verification_state, to: state, note },
    })
  } catch { /* audit is best-effort, the state change stands */ }

  return NextResponse.json({ ok: true, state })
}
