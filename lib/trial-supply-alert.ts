// Daily trial-supply alarm — the owner-facing side of the real supply cap.
//
// Counts by CHARGE date (incasso), on purpose, not the quiz-completion
// clock daily_benchmark uses (lib/ux-watch.ts). Owner, 2026-09-03: trials
// per day/week/month must be counted by charge date so the time series
// never revises — a chart drawn today and the same chart redrawn in three
// months must show the same bar for a past day, or it cannot honestly show
// whether an optimization moved growth. A quiz-dated count fails that: a
// recent day looks artificially low until its slow converters (someone who
// took the quiz weeks ago and only pays today) trickle in and it revises
// upward, which can read as decline when nothing declined.
//
// SUPERSEDED 2026-09-04: this used to be alert-only, no enforcement, by the
// owner's own explicit choice ("per il momento non inventiamo altri
// prezzi... al massimo dai a me l'opzionalità"). The next day he clarified
// that was never the end state — he wants a REAL, discretionary daily cap
// on $4.99 trials (lib/trial-supply-cap.ts, enforced in
// lib/founding-window.ts), with this file as its owner-facing half: warn
// him as the count nears today's limit, so he can raise it from a one-tap
// link before it closes, and confirm the moment it actually does close.

import { createClient } from '@supabase/supabase-js'
import { todayTrialCount } from '@/lib/trial-entries'
import { getTrialSupplyState, type SupplyState } from '@/lib/trial-supply-cap'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const SETTINGS_KEY = 'trial_supply_alert'
const CONTROL_URL = 'https://quiz.thecentral.ai/admin/trial-supply'

/** How many trials before today's CURRENT limit the warning fires. Tracked
 *  per limit VALUE (not a fixed count), so raising the limit — his own
 *  "aumentarla di 5, 10, o 15" — unlocks a fresh warning as the new,
 *  higher limit approaches too, instead of only ever firing once all day. */
const WARN_BEFORE = 2

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

type AlertState = { date: string; warnedForLimit: number[]; closedNotified: boolean }

/**
 * Call AFTER lib/trial-supply-cap.ts's markSupplyExhaustedIfNeeded() has
 * had a chance to run for this same charge, so a just-closed cap is
 * already visible here. Two distinct, once-each emails: "today's limit
 * just closed" (fires once per exhaustedAt) takes priority over "closing
 * in" (fires once per limit value) — no point warning about a door that
 * already shut.
 */
export async function checkAndAlertTrialSupply(): Promise<void> {
  const c = sb()
  const todayUtc = new Date().toISOString().slice(0, 10)
  const supply = await getTrialSupplyState(c)
  const n = await todayTrialCount(c)

  const { data: setting } = await c.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
  const stored = setting?.value as Partial<AlertState> | null
  const state: AlertState = stored?.date === todayUtc
    ? { date: todayUtc, warnedForLimit: stored.warnedForLimit ?? [], closedNotified: stored.closedNotified ?? false }
    : { date: todayUtc, warnedForLimit: [], closedNotified: false }

  if (supply.exhaustedAt) {
    if (state.closedNotified) return
    await c.from('app_settings').upsert(
      { key: SETTINGS_KEY, value: { ...state, closedNotified: true }, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    await sendClosedEmail(n, supply, todayUtc)
    return
  }

  if (n < supply.limit - WARN_BEFORE || state.warnedForLimit.includes(supply.limit)) return
  await c.from('app_settings').upsert(
    { key: SETTINGS_KEY, value: { ...state, warnedForLimit: [...state.warnedForLimit, supply.limit] }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  await sendApproachingEmail(n, supply, todayUtc)
}

function shell(subject: string, bodyHtml: string, bodyText: string[]): { subject: string; html: string; text: string } {
  return {
    subject,
    html: `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px">
      ${bodyHtml}
      <p style="margin:18px 0 0;font-size:13px">
        <a href="${CONTROL_URL}">Open the supply control</a> · <a href="https://quiz.thecentral.ai/admin/dashboard">Open the dashboard</a>
      </p>
    </div>`,
    text: [...bodyText, CONTROL_URL, 'https://quiz.thecentral.ai/admin/dashboard'].join('\n'),
  }
}

async function sendApproachingEmail(count: number, supply: SupplyState, day: string): Promise<void> {
  const left = Math.max(0, supply.limit - count)
  const { subject, html, text } = shell(
    `📈 ${count} trials today, ${left} left before $4.99 closes`,
    `
      <h2 style="margin:0 0 4px;font-size:20px">📈 ${count} trials today</h2>
      <p style="margin:0 0 16px;color:#555;font-size:14px">${day} · today's limit is ${supply.limit}, ${left} left</p>
      <p style="background:#EAF6EC;border-left:4px solid #2E7D32;padding:12px 14px;margin:0 0 16px;font-size:14px;line-height:1.5">
        $4.99 closes for new arrivals once trial #${supply.limit} sells — anyone already inside their own
        founding window keeps $4.99 regardless. Raise today's limit now if you want more room, one tap:
      </p>
      <p style="margin:0 0 16px">
        ${[5, 10, 15].map(n => `<a href="${CONTROL_URL}?raise=${n}" style="display:inline-block;margin-right:8px;padding:10px 16px;background:#1A1A1A;color:#FEF7E7;font-weight:700;text-decoration:none;font-size:13px">+${n}</a>`).join('')}
      </p>`,
    [
      `${count} trials today (${day}), today's limit is ${supply.limit}, ${left} left.`,
      `$4.99 closes for new arrivals once trial #${supply.limit} sells; anyone already inside their own founding window keeps $4.99 regardless.`,
      `Raise the limit at ${CONTROL_URL}?raise=5 (or 10, or 15).`,
    ],
  )
  await send(subject, html, text)
}

async function sendClosedEmail(count: number, supply: SupplyState, day: string): Promise<void> {
  const closedAt = supply.exhaustedAt ? new Date(supply.exhaustedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : ''
  const { subject, html, text } = shell(
    `🔒 $4.99 closed for today at trial #${supply.limit}`,
    `
      <h2 style="margin:0 0 4px;font-size:20px">🔒 Today's $4.99 supply is closed</h2>
      <p style="margin:0 0 16px;color:#555;font-size:14px">${day} · trial #${supply.limit} sold at ${closedAt}, ${count} total so far</p>
      <p style="background:#FFF3E0;border-left:4px solid #E65100;padding:12px 14px;margin:0 0 16px;font-size:14px;line-height:1.5">
        New arrivals from here now see the $14.95 list price, same as anyone whose founding window already
        expired. Nobody already inside their own window was affected. Reopen it now if you want, one tap:
      </p>
      <p style="margin:0 0 16px">
        ${[5, 10, 15].map(n => `<a href="${CONTROL_URL}?raise=${n}" style="display:inline-block;margin-right:8px;padding:10px 16px;background:#1A1A1A;color:#FEF7E7;font-weight:700;text-decoration:none;font-size:13px">+${n}</a>`).join('')}
      </p>`,
    [
      `Today's $4.99 supply is closed (${day}). Trial #${supply.limit} sold at ${closedAt}, ${count} total so far.`,
      'New arrivals now see $14.95. Nobody already inside their own founding window was affected.',
      `Reopen it at ${CONTROL_URL}?raise=5 (or 10, or 15).`,
    ],
  )
  await send(subject, html, text)
}

async function send(subject: string, html: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ADMIN_NOTIFY_EMAIL || 'chatgptcentral@gmail.com'
  const from = process.env.ADMIN_NOTIFY_FROM || 'AI Central <onboarding@resend.dev>'
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
