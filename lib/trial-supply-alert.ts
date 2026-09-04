// Daily trial-supply alarm.
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
// This ran quiz-clocked for about 20 minutes on 2026-09-03 (commit
// 6fc3fe8, matching daily_benchmark's own formula) before the owner
// overruled it back to charge date, explicitly, for the reason above. Do
// not "fix" this back to quiz-date — that was tried, reasoned about, and
// rejected on purpose. The two clocks answer different questions and both
// are correct for their own: daily_benchmark asks "did a cohort's funnel
// experience eventually convert" (attribution, must be quiz-dated, is
// allowed to revise as it matures); this alert asks "how many trials did
// we bank today" (volume trend, must be charge-dated, must never revise).
//
// He does not want automatic pricing or a hard cap built for a ceiling
// that has rarely bound, only the option to act on it himself, so this
// watches today's real count and alerts at each milestone he sets, so he
// can decide by hand whether to do anything discretionary about supply
// before the day fills. Same channel and philosophy as the express-payment
// alarm (lib/express-alert.ts).

import { createClient } from '@supabase/supabase-js'
import { todayTrialCount } from '@/lib/trial-entries'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const SETTINGS_KEY = 'trial_supply_alert'

/**
 * One-off, date-scoped overrides on the alert schedule. 2026-09-03: the
 * owner asked mid-day for a tighter cascade after he personally told
 * friends to buy, so today's count is seeded, not a clean organic read —
 * both the extra thresholds and the note are scoped to this date only.
 * Every other day falls back to DEFAULT_THRESHOLDS, the single alert at 8
 * this was built for.
 */
const TODAY_OVERRIDE: Record<string, { thresholds: number[]; note?: string }> = {
  '2026-09-03': {
    thresholds: [8, 10, 15, 20],
    note: "Some of today's charges are friends you asked to buy, not organic funnel traffic. Treat today's count as seeded, not a clean read.",
  },
}
const DEFAULT_THRESHOLDS = [8]

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
 * Counts today's real trials by charge date, gross across every trial
 * price (rule 5, never deduplicated), and emails the owner once per
 * threshold, the first time the count reaches each one for the day. Safe
 * to call after every trial-priced charge: the app_settings marker makes
 * an already-alerted threshold a no-op.
 */
export async function checkAndAlertTrialSupply(): Promise<void> {
  const c = sb()
  const todayUtc = new Date().toISOString().slice(0, 10)
  const cfg = TODAY_OVERRIDE[todayUtc]
  const thresholds = cfg?.thresholds ?? DEFAULT_THRESHOLDS

  const { data: setting } = await c.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
  const stored = setting?.value as { date?: string; alerted?: number[]; last_alerted_date?: string } | null
  const alertedToday = stored?.date === todayUtc
    ? (stored.alerted ?? [])
    : stored?.last_alerted_date === todayUtc
      ? [8] // legacy single-alert shape, from before the cascade existed
      : []

  const n = await todayTrialCount(c)

  const crossed = thresholds.filter(t => n >= t && !alertedToday.includes(t))
  if (crossed.length === 0) return

  // Mark BEFORE sending: a failed email must never retry-storm the count
  // query on every subsequent charge for the rest of the day.
  await c.from('app_settings').upsert(
    { key: SETTINGS_KEY, value: { date: todayUtc, alerted: [...alertedToday, ...crossed], count_at_alert: n }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )

  for (const threshold of crossed) {
    await sendTrialSupplyAlert(n, todayUtc, threshold, cfg?.note)
  }
}

/** 2026 is the funnel's live era; every day in it topped out at 9, verified
 *  against trial_ledger the same way this alert counts, before this copy
 *  was written. The 31/20/12-trial days in Nov-Dec 2025 are real but are
 *  not-quiz charges from an earlier, unrelated promotion (0 quiz_trials on
 *  every one of them) — a different channel, not this funnel clearing the
 *  bar, so they are deliberately left out of the claim below. */
function milestoneCopy(threshold: number, count: number): { emoji: string; headline: string; sub: string } {
  if (threshold >= 20) {
    return { emoji: '🔥', headline: `${count} trials today — double the 10/day bar`, sub: 'Not cleared once, let alone doubled, on any day in 2026 before today.' }
  }
  if (threshold >= 15) {
    return { emoji: '🚀', headline: `${count} trials today — the bar, plus half again`, sub: '15 in one day, past the 10/day bar with room to spare.' }
  }
  if (threshold >= 10) {
    return { emoji: '🎯', headline: `${count} trials today — the 10/day bar is cleared`, sub: 'Not cleared once on any day in 2026 before today.' }
  }
  return { emoji: '📈', headline: `${count} trials today — closing in on the 10/day bar`, sub: 'The 10/day bar has not been cleared on any day in 2026.' }
}

async function sendTrialSupplyAlert(count: number, day: string, threshold: number, note?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.ADMIN_NOTIFY_EMAIL || 'chatgptcentral@gmail.com'
  const from = process.env.ADMIN_NOTIFY_FROM || 'AI Central <onboarding@resend.dev>'
  const { emoji, headline, sub } = milestoneCopy(threshold, count)

  const subject = `${emoji} ${count} trials today (${day})`

  const noteHtml = note
    ? `<p style="background:#FFF3E0;border-left:4px solid #E65100;padding:10px 14px;margin:0 0 16px;font-size:13px;line-height:1.5">${note}</p>`
    : ''
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px">
      <h2 style="margin:0 0 4px;font-size:20px">${emoji} ${headline}</h2>
      <p style="margin:0 0 16px;color:#555;font-size:14px">${day} · ${sub}</p>
      ${noteHtml}
      <p style="background:#EAF6EC;border-left:4px solid #2E7D32;padding:12px 14px;margin:0 0 16px;font-size:14px;line-height:1.5">
        No cap is in place today, nothing is stopping trial #${count + 1}. This is only the heads-up you asked for:
        if you want to do anything discretionary about today's supply before the day fills, now is the moment to decide.
      </p>
      <p style="margin:18px 0 0;font-size:13px">
        <a href="https://quiz.thecentral.ai/admin/dashboard">Open the dashboard</a>
      </p>
    </div>`

  const text = [
    `${headline} (${day})`,
    sub,
    note ?? null,
    `No cap is in place today, nothing is stopping trial #${count + 1}. This is only the heads-up you asked for.`,
    'https://quiz.thecentral.ai/admin/dashboard',
  ].filter((line): line is string => line !== null).join('\n')

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
