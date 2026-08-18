// The assertions that would have caught both bugs on day one.
//
// On 2026-08-11 two errors lived in the ledger for weeks: a renewal claimed by
// every trial the person had ($353.24 counted that was never charged), and 39
// real trials deduplicated away into Other Revenue. Neither was found by a
// test. Both were found by the owner opening a cell and reading it, which is
// not a system, it is luck plus somebody's patience.
//
// Every check below is a query that takes milliseconds and answers a question
// with a known right answer. Six of them, and the last is the one that would
// catch a bug nobody has thought of yet: every cent Stripe took must appear in
// exactly one revenue line. They run on every Stripe sync and land in
// `ledger_checks`, and the dashboard shows a red line when one fails. The
// point is not that these particular bugs cannot recur; it is that a number
// which stops adding up says so itself, on the hour, instead of waiting to be
// noticed.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CheckResult {
  key: string
  /** What is being asserted, in the words you would use to a person. */
  claim: string
  ok: boolean
  /** The numbers behind the verdict, so a failure is diagnosable from the log
   *  alone rather than needing a re-run to find out what it saw. */
  detail: string
}

const TRIAL_PRICES = [399, 499, 1495, 5474]
const ANNUAL = 5975

/** Count rows matching a PostgREST filter, without pulling them. */
async function count(c: SupabaseClient, table: string, build: (q: any) => any): Promise<number> {
  const { count: n } = await build(c.from(table).select('*', { count: 'exact', head: true }))
  return n ?? 0
}

/**
 * Run every invariant. Never throws: a guardrail that can crash the sync it
 * guards is worse than no guardrail, because the first thing anyone does with
 * a flaky check is turn it off.
 */
export async function runLedgerChecks(c: SupabaseClient): Promise<CheckResult[]> {
  const out: CheckResult[] = []
  const add = (key: string, claim: string, ok: boolean, detail: string) => out.push({ key, claim, ok, detail })

  // 1 ── Every trial charge in Stripe is a row in the ledger, and no more.
  //      Rule 1 and 5: any $4.99 is a paid trial, counted gross.
  try {
    const inStripe = await count(c, 'stripe_charges', q =>
      q.eq('refunded', false).eq('currency', 'usd').in('amount_cents', TRIAL_PRICES))
    const inLedger = await count(c, 'trial_ledger', q => q.eq('trial_refunded', false))
    // Test-flagged people are excluded from the ledger by design, so the
    // ledger may legitimately be a little short. It must never be LONGER.
    add('trials_match', 'every trial-priced charge in Stripe is one row in the ledger',
      inLedger <= inStripe && inStripe - inLedger <= 25,
      `${inStripe} trial charges in Stripe, ${inLedger} rows in the ledger`)
  } catch (e) {
    add('trials_match', 'every trial-priced charge in Stripe is one row in the ledger', false, `check failed: ${msg(e)}`)
  }

  // 2 ── No renewal is claimed by more than one trial. THE $353.24 BUG.
  try {
    const seen = new Map<string, number>()
    for (let o = 0; o < 40_000; o += 1000) {
      const { data, error } = await c.from('trial_ledger')
        .select('converted_charge_id').not('converted_charge_id', 'is', null)
        .range(o, o + 999)
      if (error || !data) break
      for (const r of data as { converted_charge_id: string }[]) {
        seen.set(r.converted_charge_id, (seen.get(r.converted_charge_id) || 0) + 1)
      }
      if (data.length < 1000) break
    }
    const dupes = Array.from(seen.entries()).filter(([, n]) => n > 1)
    add('one_renewal_one_trial', 'no renewal is claimed by more than one trial',
      dupes.length === 0,
      dupes.length === 0 ? `${seen.size} renewals, each claimed once`
        : `${dupes.length} claimed twice or more, e.g. ${dupes.slice(0, 3).map(([id, n]) => `${id}×${n}`).join(', ')}`)
  } catch (e) {
    add('one_renewal_one_trial', 'no renewal is claimed by more than one trial', false, `check failed: ${msg(e)}`)
  }

  // 3 ── Rule 4: no paid trial and no $59.75 sits outside the ledger, because
  //      anything outside it is Other Revenue by definition.
  try {
    const claimed = new Set<string>()
    for (let o = 0; o < 40_000; o += 1000) {
      const { data, error } = await c.from('trial_ledger').select('charge_id, converted_charge_id').range(o, o + 999)
      if (error || !data) break
      for (const r of data as { charge_id: string; converted_charge_id: string | null }[]) {
        claimed.add(r.charge_id)
        if (r.converted_charge_id) claimed.add(r.converted_charge_id)
      }
      if (data.length < 1000) break
    }
    const loose: string[] = []
    for (let o = 0; o < 40_000; o += 1000) {
      const { data, error } = await c.from('stripe_charges')
        .select('id, amount_cents')
        .eq('refunded', false).eq('currency', 'usd')
        .in('amount_cents', [...TRIAL_PRICES, ANNUAL])
        .range(o, o + 999)
      if (error || !data) break
      for (const r of data as { id: string; amount_cents: number }[]) if (!claimed.has(r.id)) loose.push(r.id)
      if (data.length < 1000) break
    }
    add('no_trials_in_other', 'no paid trial and no $59.75 is left in Other Revenue',
      loose.length === 0,
      loose.length === 0 ? 'every trial and yearly charge is accounted for'
        : `${loose.length} unaccounted, e.g. ${loose.slice(0, 3).join(', ')}`)
  } catch (e) {
    add('no_trials_in_other', 'no paid trial and no $59.75 is left in Other Revenue', false, `check failed: ${msg(e)}`)
  }

  // 4 ── A charge is a trial or a renewal, never both. If one ever were, its
  //      money would be counted in two revenue rows at once.
  try {
    const trials = new Set<string>()
    const renewals = new Set<string>()
    for (let o = 0; o < 40_000; o += 1000) {
      const { data, error } = await c.from('trial_ledger').select('charge_id, converted_charge_id').range(o, o + 999)
      if (error || !data) break
      for (const r of data as { charge_id: string; converted_charge_id: string | null }[]) {
        trials.add(r.charge_id)
        if (r.converted_charge_id) renewals.add(r.converted_charge_id)
      }
      if (data.length < 1000) break
    }
    const both = Array.from(renewals).filter(id => trials.has(id))
    add('no_charge_counted_twice', 'no charge is both a trial and a renewal',
      both.length === 0,
      both.length === 0 ? `${trials.size} trials and ${renewals.size} renewals, no overlap`
        : `${both.length} counted as both, e.g. ${both.slice(0, 3).join(', ')}`)
  } catch (e) {
    add('no_charge_counted_twice', 'no charge is both a trial and a renewal', false, `check failed: ${msg(e)}`)
  }

  // 5 ── THE IDENTITY. Do the six revenue lines add up to every cent Stripe
  //      ever took? This is worth more than the four checks above put
  //      together: they each catch a known shape of bug, this one catches any
  //      rule that loses money or counts it twice, whatever shape it takes.
  //      $83,032.55 on both sides the day it was written.
  try {
    const { data } = await c.from('ledger_identity').select('*').maybeSingle()
    const d = data as Record<string, number> | null
    if (!d) {
      add('revenue_identity', 'the six revenue lines add up to every charge Stripe took', false, 'identity view returned nothing')
    } else {
      const lines = d.net_new_cents + d.existing_cents + d.not_quiz_cents
        + d.won_quiz_cents + d.won_not_quiz_cents + d.lifetime_half_cents + d.residual_cents
      const diff = lines - d.stripe_cents
      add('revenue_identity', 'the six revenue lines account for every charge Stripe took',
        diff === 0,
        `at face value, before Stripe's cut: lines $${(lines / 100).toFixed(2)} vs Stripe $${(d.stripe_cents / 100).toFixed(2)}`
          + (diff === 0 ? ', exact' : `, off by $${(diff / 100).toFixed(2)}`))
    }
  } catch (e) {
    add('revenue_identity', 'the six revenue lines add up to every charge Stripe took', false, `check failed: ${msg(e)}`)
  }

  // 6 ── The mirror is fresh. Every check above can pass on stale data and
  //      still describe a world that no longer exists.
  try {
    const { data } = await c.from('stripe_charges').select('synced_at').order('synced_at', { ascending: false }).limit(1).maybeSingle()
    const at = (data as { synced_at: string } | null)?.synced_at
    const ageMin = at ? Math.round((Date.now() - Date.parse(at)) / 60000) : null
    add('mirror_fresh', 'the Stripe mirror was synced within the last 3 hours',
      ageMin !== null && ageMin <= 180,
      ageMin === null ? 'never synced' : `last sync ${ageMin} min ago`)
  } catch (e) {
    add('mirror_fresh', 'the Stripe mirror was synced within the last 3 hours', false, `check failed: ${msg(e)}`)
  }

  return out
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Write the run to ledger_checks. Best effort: recording a check must never
 *  be the thing that breaks a sync. */
export async function recordLedgerChecks(c: SupabaseClient, results: CheckResult[]): Promise<void> {
  try {
    await c.from('ledger_checks').insert({
      ran_at: new Date().toISOString(),
      passed: results.every(r => r.ok),
      results,
    })
  } catch (e) {
    console.warn('[ledger-checks] could not record run:', msg(e))
  }
}
