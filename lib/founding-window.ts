// THE FOUNDING WINDOW (owner, 2026-08-18): completing the quiz earns a
// personal $4.99 founding rate for a fixed number of hours; after it, the
// list price is genuinely charged. The deadline is REAL because this module
// is consulted by every path that quotes or charges trial money — the
// embedded intent, the hosted session, and the page copy — which is the
// whole persuasive and legal basis: a personal deadline that is enforced is
// urgency; one that is not is the device class this project banned.
//
// Config lives in app_settings key 'founding_window' so it flips LIVE with
// no deploy (the 2026-08-07 baked-env lesson):
//   { "enabled": false, "list_cents": 1495, "window_hours": 12 }
//
// FAILURE DIRECTION IS DELIBERATE, in both directions:
//   - config unreadable  -> behave as DISABLED (today's $4.99 for everyone);
//   - submission lookup fails while enabled -> treat as IN-WINDOW ($4.99).
// Both failures under-charge, never over-charge: a bug here may cost us ten
// dollars, it must never cost a buyer money they were promised not to pay.

import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type FoundingConfig = { enabled: boolean; list_cents: number; window_hours: number }

export type WindowState = {
  enabled: boolean
  /** true = the $4.99 founding rate applies to this person right now. */
  valid: boolean
  /** What the TRIAL costs this person, in cents — the one number to charge and quote. */
  amountCents: number
  listCents: number
  windowHours: number
  /** When this person's window ends (null when disabled or no submission). */
  expiresAt: string | null
}

const DEFAULTS: FoundingConfig = { enabled: false, list_cents: 1495, window_hours: 12 }

function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

export async function foundingConfig(c?: SupabaseClient): Promise<FoundingConfig> {
  try {
    const client = c ?? db()
    const { data } = await client.from('app_settings').select('value').eq('key', 'founding_window').maybeSingle()
    const v = (data?.value ?? {}) as Partial<FoundingConfig>
    return {
      enabled: v.enabled === true,
      list_cents: Number(v.list_cents) > 0 ? Number(v.list_cents) : DEFAULTS.list_cents,
      window_hours: Number(v.window_hours) > 0 ? Number(v.window_hours) : DEFAULTS.window_hours,
    }
  } catch {
    return DEFAULTS
  }
}

/**
 * The one pricing decision, for one person. `baseCents` is the founding rate
 * (the Stripe price's own amount, today 499) so the two checkout paths can
 * never drift from Stripe on the discounted rate, and the list price comes
 * from config so the owner can tune it without a deploy.
 */
export async function foundingWindowState(
  submissionId: string | null | undefined,
  baseCents: number,
  c?: SupabaseClient,
): Promise<WindowState> {
  const cfg = await foundingConfig(c)
  const disabled: WindowState = {
    enabled: false, valid: true, amountCents: baseCents,
    listCents: cfg.list_cents, windowHours: cfg.window_hours, expiresAt: null,
  }
  if (!cfg.enabled) return disabled
  if (!submissionId) {
    // No quiz, no window: direct visitors pay the list price. That is what
    // makes the founding rate a real reward and the list price a real price.
    return { ...disabled, enabled: true, valid: false, amountCents: cfg.list_cents }
  }
  try {
    const client = c ?? db()
    const { data } = await client.from('submissions').select('created_at').eq('id', submissionId).maybeSingle()
    const createdIso = data?.created_at as string | undefined
    if (!createdIso) return { ...disabled, enabled: true, valid: false, amountCents: cfg.list_cents }
    const expires = new Date(createdIso).getTime() + cfg.window_hours * 3600_000
    const valid = Date.now() < expires
    return {
      enabled: true, valid,
      amountCents: valid ? baseCents : cfg.list_cents,
      listCents: cfg.list_cents, windowHours: cfg.window_hours,
      expiresAt: new Date(expires).toISOString(),
    }
  } catch {
    // Lookup failed for someone who may be in-window: fail toward $4.99.
    return { ...disabled, enabled: true }
  }
}

/** Whole hours left in the window, floored at 1 so copy never says "0 hours". */
export function hoursLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 3600_000))
}
