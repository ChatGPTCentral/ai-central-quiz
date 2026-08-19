// WIN-BACK — the people who took the quiz and never bought.
//
// The pool nobody has asked for anything in weeks: 1,332 quality completions
// with no charge against their email, 422 of whom reached the checkout and
// walked away. They are the warmest audience we own that is not the 94k the
// owner is holding, and they gave us their address by finishing an eleven
// question quiz.
//
// SAFETY, because a win-back that mails a customer is worse than no win-back:
//   1. never anyone with ANY charge on their email, ever, at any price
//   2. never a test row, a flagged fake, or a low lead-quality row
//   3. never India — that country is sold the lifetime, not the trial
//   4. never twice: winback_enrolled_at is stamped only after beehiiv
//      confirms, so a failure retries and a success cannot repeat
//   5. a HARD daily cap, oldest first, so switching this on cannot become a
//      blast to thirteen hundred people in one afternoon
//   6. armed by env var AND the automation must be published in beehiiv;
//      enrolling into a draft is a no-op, so the owner holds the real switch
//
// TO ARM: publish "Quiz Win-Back" in beehiiv, then set WINBACK_ENABLED=true
// in Vercel (Production) AND REDEPLOY — env is baked at build time.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enrollInAutomation, setPassRecoveryFields } from '@/lib/beehiiv'
import { personResultPath } from '@/lib/result-url'
import { STAGES } from '@/lib/segmentation-v2'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const AUTOMATION_ID = process.env.BEEHIIV_WINBACK_AUTOMATION_ID || 'aut_b7a1a865-b6ab-4d84-acdd-6653cec4abe3'
const DAILY_CAP = Number(process.env.WINBACK_DAILY_CAP || 60)
const WINBACK_UTM = { utm_source: 'winback', utm_medium: 'email' }

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

function rungLine(stage: string | null): string {
  const ordered = STAGES.filter(s => s.key.startsWith('S'))
  const i = stage ? ordered.findIndex(s => s.key === stage) : -1
  if (i >= 0 && i < ordered.length - 1) return `You are one stage off ${ordered[i + 1].label}`
  return 'You are at the top of the ladder, the risk now is staying there'
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const armed = process.env.WINBACK_ENABLED === 'true'
  const c = sb()

  // The pool, oldest first: the people who have been waiting longest hear
  // from us first, and the cap means the list drains predictably.
  const { data: rows, error } = await c
    .from('submissions')
    .select('id, email, name, score, persona, stage, country, quiz_completed_at')
    .not('quiz_completed_at', 'is', null)
    .is('winback_enrolled_at', null)
    .or('is_test.is.null,is_test.eq.false')
    .or('suspected_fake.is.null,suspected_fake.eq.false')
    .or('lead_quality_score.is.null,lead_quality_score.gte.50')
    .neq('country', 'India')
    .order('quiz_completed_at', { ascending: true })
    .limit(DAILY_CAP * 3)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const candidates: typeof rows = []
  for (const r of rows ?? []) {
    const email = (r.email || '').toLowerCase().trim()
    if (!email.includes('@')) continue
    // THE GATE THAT MATTERS: any charge ever, at any price, on this email.
    const { count } = await c.from('stripe_charges').select('id', { count: 'exact', head: true })
      .or(`email.eq.${email},customer_email.eq.${email}`)
    if ((count ?? 0) > 0) {
      await c.from('submissions').update({ winback_enrolled_at: new Date().toISOString() }).eq('id', r.id)
      continue // stamped so we never re-check a payer every single day
    }
    candidates.push(r)
    if (candidates.length >= DAILY_CAP) break
  }

  if (!armed) {
    return NextResponse.json({
      ok: true, dryRun: true,
      reason: 'WINBACK_ENABLED is not true — publish the automation in beehiiv, set the env var, redeploy',
      wouldEnroll: candidates.length,
      sample: candidates.slice(0, 5).map(r => ({ email: (r.email || '').replace(/^(.).*(@.*)$/, '$1***$2'), quizzed: r.quiz_completed_at })),
    })
  }

  let enrolled = 0
  const failures: string[] = []
  for (const r of candidates) {
    const email = (r.email || '').toLowerCase().trim()
    try {
      const path = personResultPath(
        { id: r.id, name: r.name, score: r.score, persona: r.persona, stage: r.stage },
        WINBACK_UTM,
      )
      await setPassRecoveryFields({
        email,
        resultUrl: `https://quiz.thecentral.ai${path}`,
        rungLine: rungLine(r.stage),
        firstName: (r.name || '').trim().split(/\s+/)[0] || undefined,
      })
      const res = await enrollInAutomation({ email, automationId: AUTOMATION_ID })
      if (!res.success) { failures.push(`${r.id}: ${res.error}`); continue }
      // Stamped only after beehiiv confirms.
      await c.from('submissions').update({ winback_enrolled_at: new Date().toISOString() }).eq('id', r.id)
      enrolled++
    } catch (e) {
      failures.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ ok: true, dryRun: false, cap: DAILY_CAP, enrolled, failures: failures.slice(0, 8) })
}
