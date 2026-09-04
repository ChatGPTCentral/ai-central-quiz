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
import { getTrialSupplyState } from '@/lib/trial-supply-cap'

export type FoundingConfig = { enabled: boolean; list_cents: number; window_hours: number }

export type WindowState = {
  enabled: boolean
  /** true = the $4.99 founding rate applies to this person right now. */
  valid: boolean
  /** true = the rate is valid because we HELD it for an email recipient,
   *  not because their 12 hours are still running. The page says so plainly
   *  instead of showing a countdown that already ended. */
  held: boolean
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
  opts?: { heldRate?: boolean },
): Promise<WindowState> {
  const cfg = await foundingConfig(c)
  const disabled: WindowState = {
    enabled: false, valid: true, held: false, amountCents: baseCents,
    listCents: cfg.list_cents, windowHours: cfg.window_hours, expiresAt: null,
  }
  if (!cfg.enabled) {
    // The founding WINDOW is off. The daily SUPPLY CAP has its own switch
    // (lib/trial-supply-cap.ts) and can run without it: same $4.99 for
    // everyone, no personal deadline, until the day's supply is gone.
    // Everything here is inside one try: db() throws when the service key is
    // absent, and a copy decision must never be able to take this page down.
    // Every failure path returns `disabled`, which keeps $4.99 for everyone —
    // the same under-charge-never-over-charge direction as the rest of this
    // file.
    try {
      const client = c ?? db()
      const supply = await getTrialSupplyState(client)
      if (!supply.enabled) return disabled
      // A promised price is never taken back, exactly as below.
      if (opts?.heldRate && submissionId) return { ...disabled, enabled: true, valid: true, held: true, amountCents: baseCents }
      if (!supply.exhaustedAt) return { ...disabled, enabled: true, valid: true, amountCents: baseCents }
      if (!submissionId) return { ...disabled, enabled: true, valid: false, amountCents: cfg.list_cents }
      const { data } = await client.from('submissions').select('created_at').eq('id', submissionId).maybeSingle()
      const createdIso = data?.created_at as string | undefined
      // Real timestamps, never raw ISO strings: Postgres and JS format
      // offsets differently and a string compare can misorder two moments
      // milliseconds apart.
      const arrivedAfter = createdIso ? new Date(createdIso).getTime() > new Date(supply.exhaustedAt).getTime() : true
      return { ...disabled, enabled: true, valid: !arrivedAfter, amountCents: arrivedAfter ? cfg.list_cents : baseCents }
    } catch {
      return disabled
    }
  }

  // THE HELD RATE (2026-08-19, first night of the window). Our recovery
  // emails quote $4.99 and carry static Stripe links that genuinely charge
  // $4.99 forever, so a recipient who follows one back to this page must
  // never meet $14.95: overnight, 2 of the first 5 clickers did exactly
  // that, arriving from an Aug-16 and an Aug-17 quiz, and neither bought.
  // The rate is honoured for arrivals tagged with an email source. It is
  // not a loophole in the deadline, it is the deadline told truthfully:
  // the page's clock is real for everyone deciding in the moment, and the
  // people we personally wrote to keep the price we personally promised.
  if (opts?.heldRate && submissionId) {
    return { ...disabled, enabled: true, valid: true, held: true, amountCents: baseCents }
  }

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
    let valid = Date.now() < expires

    // THE DAILY SUPPLY CAP (owner, 2026-09-04): a real, discretionary limit
    // on how many $4.99 trials sell today, layered on top of each person's
    // own window above. Same under-charge-never-over-charge direction as
    // everything else here: this can only turn a still-valid window
    // INVALID, never the reverse, and only for a window that started AFTER
    // supply ran out — compared as real timestamps, never as raw ISO
    // strings, because Postgres and JS format offsets differently and a
    // string compare can misorder two timestamps a few milliseconds apart.
    // Someone whose quiz completed before the cap bit keeps their own
    // $4.99 for their own full window, exactly like held-rate and
    // time-based promises already do — the cap only ever touches arrivals
    // it could not possibly have already promised anything to.
    if (valid) {
      try {
        const supply = await getTrialSupplyState(client)
        if (supply.exhaustedAt && new Date(createdIso).getTime() > new Date(supply.exhaustedAt).getTime()) valid = false
      } catch { /* fail toward $4.99, same direction as the rest of this function */ }
    }

    return {
      enabled: true, valid, held: false,
      amountCents: valid ? baseCents : cfg.list_cents,
      listCents: cfg.list_cents, windowHours: cfg.window_hours,
      expiresAt: new Date(expires).toISOString(),
    }
  } catch {
    // Lookup failed for someone who may be in-window: fail toward $4.99.
    return { ...disabled, enabled: true }
  }
}

/** The email sources whose sends quote $4.99 and carry a $4.99 link, so an
 *  arrival tagged with one of them has been personally promised that rate. */
const HELD_RATE_SOURCES = new Set(['passrec', 'checkrec'])
export function isHeldRateSource(utmSource: string | null | undefined): boolean {
  return !!utmSource && HELD_RATE_SOURCES.has(utmSource.trim().toLowerCase())
}

/** Whole hours left in the window, floored at 1 so copy never says "0 hours". */
export function hoursLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0
  return Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 3600_000))
}
