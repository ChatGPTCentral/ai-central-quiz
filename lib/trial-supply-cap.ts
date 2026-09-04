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
//   { date: 'YYYY-MM-DD', limit: 10, exhaustedAt: string | null }

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { todayTrialCount } from '@/lib/trial-entries'

const SETTINGS_KEY = 'trial_daily_supply'
const DEFAULT_LIMIT = 10

export type SupplyState = { date: string; limit: number; exhaustedAt: string | null }

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
    if (v.date !== todayUtc) return { date: todayUtc, limit: DEFAULT_LIMIT, exhaustedAt: null }
    return { date: todayUtc, limit: Number(v.limit) > 0 ? Number(v.limit) : DEFAULT_LIMIT, exhaustedAt: v.exhaustedAt ?? null }
  } catch {
    return { date: todayUtc, limit: DEFAULT_LIMIT, exhaustedAt: null }
  }
}

/** Owner action: raise today's limit by `by` (5, 10 or 15, his own words)
 *  and reopen $4.99 for new arrivals — clearing exhaustedAt is what actually
 *  reopens it, the higher number alone would not. */
export async function raiseTrialSupply(by: number, c?: SupabaseClient): Promise<SupplyState> {
  const client = c ?? db()
  const current = await getTrialSupplyState(client)
  const next: SupplyState = { date: current.date, limit: current.limit + by, exhaustedAt: null }
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
  if (state.exhaustedAt) return
  const n = await todayTrialCount(client)
  if (n < state.limit) return
  await client.from('app_settings').upsert(
    { key: SETTINGS_KEY, value: { ...state, exhaustedAt: new Date().toISOString() }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}
