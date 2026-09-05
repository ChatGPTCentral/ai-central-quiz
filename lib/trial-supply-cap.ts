// The real, discretionary daily $4.99 supply cap.
//
// Owner, 2026-09-04, after the trial-supply alert had been alert-only for a
// day: "voglio introdurre una supply limitata e discrezionalmente
// espandibile da me di 10 trial al giorno al prezzo di 4.99... quando si
// arriva a 8 trial, ricevo una mail dove posso scegliere se lasciare la
// supply fissa o aumentarla di 5, 10, o 15 in più." A real cap this time,
// not just an alert — but the one thing it must never do is take back a
// price already promised: whoever's founding window started BEFORE supply
// ran out keeps their $4.99 for their own full window, exactly like the
// founding window's own held-rate and time-based promises already do
// (lib/founding-window.ts). No new price is invented: once the cap bites,
// a new arrival simply gets the SAME list price ($14.95) an expired
// founding window already charges everyone.
//
// Config lives in app_settings key 'trial_daily_supply', resets itself
// every UTC day:
//   { enabled: false, date: 'YYYY-MM-DD', limit: 10, exhaustedAt: string | null }
//
// `enabled` is its OWN switch, added 2026-09-04. The cap was first written
// inside lib/founding-window.ts's enabled branch, so it could only ever bite
// while the founding WINDOW was also on. The owner then took the founding
// window off the table and asked for the daily limit alone: "bring back into
// this page the fact that there are only 10 4.99 trials available a day and
// he can get one of them". Two different promises, so two different
// switches. With this one on and the window off, everybody keeps $4.99 with
// no personal deadline until the day's supply runs out, and only arrivals
// after that pay the list price.
//
// The result page may state the limit ONLY while this is true. That is the
// same rule the fake 15-minute countdown broke this morning: a scarcity
// claim renders because it is enforced, or it does not render.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { todayTrialCount } from '@/lib/trial-entries'

const SETTINGS_KEY = 'trial_daily_supply'
const DEFAULT_LIMIT = 10

export type SupplyState = { enabled: boolean; date: string; limit: number; exhaustedAt: string | null }

function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

/** Today's supply state, resetting to the default the moment the UTC date
 *  rolls over — a limit raised yesterday never silently carries into today.
 *  A read never writes the reset back; only raiseTrialSupply() and
 *  markSupplyExhaustedIfNeeded() touch the row, each stamping today's own
 *  date when they do. */
export async function getTrialSupplyState(c?: SupabaseClient): Promise<SupplyState> {
  const todayUtc = new Date().toISOString().slice(0, 10)
  try {
    const client = c ?? db()
    const { data } = await client.from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
    const v = (data?.value ?? {}) as Partial<SupplyState>
    // Off unless switched on, deliberately: an unset row must never start
    // charging anyone the list price, and must never let the page claim a
    // limit nothing enforces.
    const enabled = v.enabled === true
    if (v.date !== todayUtc) return { enabled, date: todayUtc, limit: DEFAULT_LIMIT, exhaustedAt: null }
    return { enabled, date: todayUtc, limit: Number(v.limit) > 0 ? Number(v.limit) : DEFAULT_LIMIT, exhaustedAt: v.exhaustedAt ?? null }
  } catch {
    return { enabled: false, date: todayUtc, limit: DEFAULT_LIMIT, exhaustedAt: null }
  }
}

/** Owner action: switch the whole cap on or off. Off means no limit at all —
 *  everyone keeps $4.99 and the result page stops claiming a daily supply,
 *  because a claim nobody enforces is the one thing this must never be. */
export async function setTrialSupplyEnabled(enabled: boolean, c?: SupabaseClient): Promise<SupplyState> {
  const client = c ?? db()
  const current = await getTrialSupplyState(client)
  const next: SupplyState = { ...current, enabled }
  await client.from('app_settings').upsert(
    { key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return next
}

/** Owner action: raise today's limit by `by` (5, 10 or 15, his own words)
 *  and reopen $4.99 for new arrivals — clearing exhaustedAt is what actually
 *  reopens it, the higher number alone would not. */
export async function raiseTrialSupply(by: number, c?: SupabaseClient): Promise<SupplyState> {
  const client = c ?? db()
  const current = await getTrialSupplyState(client)
  // Raising the limit implies running the cap: an owner who adds supply is
  // asking for the cap to be live, not switching it off by omission.
  const next: SupplyState = { enabled: true, date: current.date, limit: current.limit + by, exhaustedAt: null }
  await client.from('app_settings').upsert(
    { key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return next
}

/** Called after every trial-priced charge (same trigger as the supply
 *  alert): if today's real count just reached the current limit, stamp the
 *  moment so lib/founding-window.ts can tell "before" from "after" — never
 *  recomputed live per page view, so someone who started their window
 *  before the stamp is never punished for finishing checkout late. */
export async function markSupplyExhaustedIfNeeded(c?: SupabaseClient): Promise<void> {
  const client = c ?? db()
  const state = await getTrialSupplyState(client)
  if (!state.enabled || state.exhaustedAt) return
  const n = await todayTrialCount(client)
  if (n < state.limit) return
  await client.from('app_settings').upsert(
    { key: SETTINGS_KEY, value: { ...state, exhaustedAt: new Date().toISOString() }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}
