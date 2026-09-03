// Daily trial-supply alarm.
//
// The owner's bar is 10 real trials a day, never hit yet (2026-09-03). He
// does not want automatic pricing or a hard cap built for a ceiling that has
// never bound — only the option to act on it himself. So this watches
// today's real trial count and alerts ONCE, the moment it reaches 8, so he
// can decide by hand whether to do anything discretionary about supply
// before the day fills. Same channel and philosophy as the express-payment
// alarm (lib/express-alert.ts): the answer — today's count, right now — is
// in the subject line, not a "something happened, go check" nudge.

import { createClient } from '@supabase/supabase-js'
import { TRIAL_PRICES } from '@/lib/trial-entries'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const ALERT_THRESHOLD = 8
const SETTINGS_KEY = 'trial_supply_alert'

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

/**
 * Counts today's real trials (UTC day, gross across every trial price, the
 * same definition the 10/day bar itself uses — rule 5, never re-derived
 * here) and emails the owner once, the first time the count reaches the
 * threshold for the day. Safe to call after every trial-priced charge: the
 * app_settings marker makes a second call the same day a no-op.
 */
export async function checkAndAlertTrialSupply(): Promise<void> {
  const c = sb()
  const todayUtc = new Date().toISOString().slice(0, 10)

  const { data: setting } = await c.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
  const lastAlertedDate = (setting?.value as { last_alerted_date?: string } | null)?.last_alerted_date
  if (lastAlertedDate === todayUtc) return // already alerted today, say nothing twice

  const dayStart = `${todayUtc}T00:00:00.000Z`
  const dayEnd = new Date(new Date(dayStart).getTime() + 86_400_000).toISOString()
  const { count, error } = await c
    .from('stripe_charges')
    .select('id', { count: 'exact', head: true })
    .in('amount_cents', Array.from(TRIAL_PRICES))
    .eq('refunded', false)
    .gte('charged_at', dayStart)
    .lt('charged_at', dayEnd)
  if (error) {
    console.error('[trial-supply-alert] count query failed:', error.message)
    return
  }
  if ((count ?? 0) < ALERT_THRESHOLD) return

  // Mark BEFORE sending: a failed email must never retry-storm the count
  // query on every subsequent charge for the rest of the day.
  await c.from('app_settings').upsert(
    { key: SETTINGS_KEY, value: { last_alerted_date: todayUtc, count_at_alert: count }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )

  await sendTrialSupplyAlert(count ?? 0, todayUtc)
}

async function sendTrialSupplyAlert(count: number, day: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ADMIN_NOTIFY_EMAIL || 'chatgptcentral@gmail.com'
  const from = process.env.ADMIN_NOTIFY_FROM || 'AI Central <onboarding@resend.dev>'

  const subject = `📈 ${count} trials today (${day}) — closing in on the 10/day bar`

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px">
      <h2 style="margin:0 0 4px;font-size:20px">📈 ${count} trials today</h2>
      <p style="margin:0 0 16px;color:#555;font-size:14px">${day} · the 10/day bar has never been hit before</p>
      <p style="background:#EAF6EC;border-left:4px solid #2E7D32;padding:12px 14px;margin:0 0 16px;font-size:14px;line-height:1.5">
        No cap is in place today, nothing is stopping trial #${count + 1}. This is only the heads-up you asked for:
        if you want to do anything discretionary about today's supply before the day fills, now is the moment to decide.
      </p>
      <p style="margin:18px 0 0;font-size:13px">
        <a href="https://quiz.thecentral.ai/admin/dashboard">Open the dashboard</a>
      </p>
    </div>`

  const text = [
    `${count} trials today (${day}), the 10/day bar has never been hit before.`,
    `No cap is in place today, nothing is stopping trial #${count + 1}. This is only the heads-up you asked for.`,
    'https://quiz.thecentral.ai/admin/dashboard',
  ].join('\n')

  if (!apiKey) {
    console.log(`[trial-supply-alert] RESEND_API_KEY not set; would send "${subject}" to ${to}`)
    return
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    })
    if (!res.ok) console.error('[trial-supply-alert] resend failed:', res.status, await res.text())
  } catch (err) {
    console.error('[trial-supply-alert] send threw:', err)
  }
}
