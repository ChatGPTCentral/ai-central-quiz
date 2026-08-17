// Day-23 pre-renewal reminder — Vercel Cron daily at 08:10 UTC, same Bearer
// CRON_SECRET contract as the other crons (admin cookie also accepted so it
// can be triggered by hand and observed).
//
// WHY THIS EXISTS (research fix F1, 2026-08-17). The research fleet's top
// finding: the last objection at a ready payment form is the fear of the
// forgotten renewal. The modal_renewal_schedule_v1 experiment PROMISES a
// day-23 reminder email — so the email must exist and send before that
// experiment may launch. It also stands on its own: a reminder before a
// $59.75 charge cuts refunds, disputes (each lost one costs the charge plus
// fee plus the $15 penalty, straight out of net kept money), and it is the
// behavior state auto-renewal law expects post click-to-cancel.
//
// WHO GETS IT. One email per TRIAL CHARGE, ever (renewal_reminders is the
// idempotency ledger), when the trial is 23 to 27 days old and still headed
// for renewal: not converted early, not refunded, not a lifetime bundle
// (nothing renews), not the no-card era (nothing to charge), and never any
// trial the owner has hand-judged (ANY override skips — his dropdown wins,
// same rule as everywhere). The window is bounded on both ends, so arming
// this cannot backfill old cohorts with a surprise blast.
//
// COPY HONESTY. We do not mirror subscription cancellation state, so the
// email is written to be TRUE for both the active and the already-canceled:
// it says what happens if they keep it and how to cancel if they don't,
// and reply-to goes to the owner's support inbox where cancel actually works.
//
// TO ARM IT, both steps, in this order (the baked-env lesson, 2026-08-07):
//   1. set RENEWAL_REMINDER_FROM to a Resend-verified sender
//      (e.g. "AI Central <hello@thecentral.ai>") — there is deliberately no
//      fallback: customer email never goes out from onboarding@resend.dev
//   2. set RENEWAL_REMINDER_ENABLED=true in Vercel, Production scope,
//      AND REDEPLOY — saving an env var does nothing to the deployment
//      already serving traffic.
// Until both are set the cron runs dry: it reports who WOULD be mailed and
// sends nothing, so the candidate logic can be watched for days first.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BATCH = 40
const WINDOW_START_D = 27 // oldest trial age still mailed
const WINDOW_SEND_D = 23  // reminder due from this age
const RENEW_D = 28

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // A cron that reads current state must never be cached (see the
    // 2026-08-07/08 pass-recovery frozen-snapshot incident).
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

const NO_CARD_START = '2025-05-25'
const NO_CARD_END = '2025-06-21'

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function emailText(firstName: string, trialDate: string, renewDate: string): string {
  return `Hi ${firstName},

A quick heads-up, no action needed.

You started your AI Library trial on ${trialDate}. Your 4 weeks run through ${renewDate}. If you love it, do nothing: it continues at $59.75 for the year, which works out to about $4.98 a month.

If it is not for you, reply to this email with the word "cancel" any time before ${renewDate} and we will take care of it for you, no questions, no forms. If you already canceled, you are all set and nothing will be charged.

Either way you have full access until then, and if you have not opened your 30-day plan yet, it is waiting in your library.

Alex
AI Central`
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const cronOk = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  const cookieOk = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!cronOk && !cookieOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const from = process.env.RENEWAL_REMINDER_FROM || null
  const armed = process.env.RENEWAL_REMINDER_ENABLED === 'true' && !!from && !!process.env.RESEND_API_KEY
  const c = sb()

  const now = Date.now()
  const oldest = new Date(now - WINDOW_START_D * 864e5).toISOString()
  const newest = new Date(now - WINDOW_SEND_D * 864e5).toISOString()

  const { data: trials, error } = await c
    .from('trial_ledger')
    .select('charge_id, person_key, name, trial_at, converted, trial_refunded, lifetime_bundle')
    .gte('trial_at', oldest)
    .lte('trial_at', newest)
    .eq('converted', false)
    .eq('trial_refunded', false)
    .eq('lifetime_bundle', false)
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const chargeIds = (trials ?? []).map(t => t.charge_id)
  const [sentRows, overrideRows] = await Promise.all([
    chargeIds.length ? c.from('renewal_reminders').select('charge_id').in('charge_id', chargeIds) : Promise.resolve({ data: [] as { charge_id: string }[] }),
    chargeIds.length ? c.from('trial_state_overrides').select('charge_id, state').in('charge_id', chargeIds) : Promise.resolve({ data: [] as { charge_id: string; state: string }[] }),
  ])
  const alreadySent = new Set(((sentRows.data ?? []) as { charge_id: string }[]).map(r => r.charge_id))
  // ANY hand-set state skips the reminder: the owner's judgment wins, and a
  // "refunded"/"cancel"/"hold" trial must never get a billing heads-up.
  const overridden = new Set(
    ((overrideRows.data ?? []) as { charge_id: string; state: string }[]).filter(r => r.state && r.state !== 'auto').map(r => r.charge_id),
  )

  const candidates = (trials ?? []).filter(t => {
    const day = String(t.trial_at).slice(0, 10)
    if (day >= NO_CARD_START && day <= NO_CARD_END) return false
    if (alreadySent.has(t.charge_id)) return false
    if (overridden.has(t.charge_id)) return false
    return typeof t.person_key === 'string' && t.person_key.includes('@')
  }).slice(0, BATCH)

  if (!armed) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      reason: !process.env.RESEND_API_KEY ? 'RESEND_API_KEY missing' : !from ? 'RENEWAL_REMINDER_FROM not set (no fallback for customer email, by design)' : 'RENEWAL_REMINDER_ENABLED is not true',
      wouldSend: candidates.length,
      candidates: candidates.map(t => ({ charge: t.charge_id, email: t.person_key.replace(/^(.).*(@.*)$/, '$1***$2'), renewsOn: new Date(new Date(t.trial_at).getTime() + RENEW_D * 864e5).toISOString().slice(0, 10) })),
    })
  }

  let sent = 0
  const failures: string[] = []
  for (const t of candidates) {
    const renewIso = new Date(new Date(t.trial_at).getTime() + RENEW_D * 864e5).toISOString()
    const firstName = (t.name || '').trim().split(/\s+/)[0] || 'there'
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [t.person_key],
          reply_to: process.env.RENEWAL_REMINDER_REPLY_TO || 'chatgptcentral@gmail.com',
          subject: `Your AI Library trial and ${fmtDay(renewIso)}, in plain words`,
          text: emailText(firstName, fmtDay(t.trial_at), fmtDay(renewIso)),
        }),
      })
      if (!res.ok) {
        failures.push(`${t.charge_id}: resend ${res.status}`)
        continue
      }
      // Stamp ONLY after Resend accepts, so a failure retries tomorrow while
      // the trial is still inside the window, and a success never re-sends.
      const { error: insErr } = await c.from('renewal_reminders').insert({
        charge_id: t.charge_id,
        person_key: t.person_key,
        email: t.person_key,
        trial_at: t.trial_at,
        renews_on: renewIso.slice(0, 10),
      })
      if (insErr) failures.push(`${t.charge_id}: SENT BUT NOT RECORDED: ${insErr.message}`)
      else sent++
    } catch (e) {
      failures.push(`${t.charge_id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ ok: true, dryRun: false, candidates: candidates.length, sent, failures })
}
