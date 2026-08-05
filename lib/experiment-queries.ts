// Admin-side experiment queries + the bandit run (shared by the admin
// "Run bandit now" action and the daily cron). Uncached — admins want live.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { computeStats, probBeatsControl, thompsonWeights, type VariantCounts, type VariantStats } from './bandit'
import type { Experiment, ExperimentVariant } from './experiments'

let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _client
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExperimentRow = any

export async function listExperiments(): Promise<ExperimentRow[]> {
  const { data, error } = await client()
    .from('experiments')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export interface VariantResult extends VariantStats {
  clickers: number
  netNewPaid: number
  completions: number
  clickRate: number
  completionRate: number
  /** net_new_paid / exposures — the north star, always too small to conclude on. */
  paidRate: number
  /** net_new_paid / clickers — how much a click from this arm is actually worth. */
  clickToPaid: number
  /** This arm's clickToPaid as a fraction of control's. 1 = same quality. */
  qualityRatio: number | null
  /** Click-quality guardrail verdict. See CLICK_QUALITY_FLOOR. */
  guardrail: 'control' | 'pass' | 'blocked' | 'low_data'
}

/**
 * A click winner may not be shipped if its clicks convert materially worse
 * than control's.
 *
 * Why this exists: every experiment before Aug 2026 was decided on
 * checkout_click alone. Re-read on net_new_paid (charge after first exposure),
 * the arm that won on clicks had the WORSE click-to-paid rate in 3 of 3 real
 * experiments, and fewer actual payers in 3 of 3. result_sellfirst_v1 shipped
 * on +14.4pts of click (p=0.002) while sitting 8-to-5 BEHIND on payers, its
 * click-to-paid having fallen from 16.7% to 6.6%. It bought clicks, not sales.
 *
 * Paid can never be the primary metric here: at a ~3% base rate and 200
 * exposures per arm the MDE is ~4.8 points, so it would have to nearly triple
 * to register. This guardrail is the workable substitute. It uses the RATIO of
 * click-to-paid rates rather than their difference, because a ratio stays
 * meaningful at the tiny payer counts we actually have.
 *
 * Applied to history: sellfirst 40% (blocked), aspirational 21% (blocked),
 * embedded 209% (passes, and it was the one decision paid got right).
 */
export const CLICK_QUALITY_FLOOR = 0.6
/** Below this many control payers the ratio is noise; surface it, do not judge. */
const MIN_CONTROL_PAID = 5

type Zero = { exposures: number; clickers: number; net_new_paid: number; completions: number }
const ZERO: Zero = { exposures: 0, clickers: 0, net_new_paid: 0, completions: 0 }

/** Per-variant results via the experiment_results() SQL function, with
 *  Bayesian stats computed on the experiment's primary metric.
 *  `quiz_completed` exists because quiz-entry style tests change whether people
 *  FINISH — and unlike paid it has the volume to actually conclude. */
export async function experimentResults(row: ExperimentRow): Promise<VariantResult[]> {
  const { data, error } = await client().rpc('experiment_results', { exp_key: row.key })
  if (error) throw new Error(error.message)
  const byKey = new Map<string, Zero>()
  for (const r of (data || []) as { variant_key: string; exposures: number; clickers: number; net_new_paid: number; completions: number }[]) {
    byKey.set(r.variant_key, {
      exposures: Number(r.exposures), clickers: Number(r.clickers),
      net_new_paid: Number(r.net_new_paid), completions: Number(r.completions ?? 0),
    })
  }
  const variants: ExperimentVariant[] = Array.isArray(row.variants) ? row.variants : []
  const primary: 'checkout_click' | 'net_new_paid' | 'quiz_completed' =
    row.primary_metric === 'net_new_paid' ? 'net_new_paid'
      : row.primary_metric === 'quiz_completed' ? 'quiz_completed'
      : 'checkout_click'
  const conversionsFor = (r: Zero) =>
    primary === 'net_new_paid' ? r.net_new_paid : primary === 'quiz_completed' ? r.completions : r.clickers
  const counts: VariantCounts[] = variants.map(v => {
    const r = byKey.get(v.key) || ZERO
    return { key: v.key, exposures: r.exposures, conversions: conversionsFor(r) }
  })
  const stats = computeStats(counts)

  const ctrl = byKey.get('control')
  const ctrlClickToPaid = ctrl && ctrl.clickers > 0 ? ctrl.net_new_paid / ctrl.clickers : null
  const judgeable = !!ctrl && ctrl.net_new_paid >= MIN_CONTROL_PAID && ctrlClickToPaid !== null

  return stats.map(s => {
    const r = byKey.get(s.key) || ZERO
    const clickToPaid = r.clickers > 0 ? r.net_new_paid / r.clickers : 0
    const qualityRatio =
      ctrlClickToPaid !== null && ctrlClickToPaid > 0 ? clickToPaid / ctrlClickToPaid : null
    const guardrail: VariantResult['guardrail'] =
      s.key === 'control' ? 'control'
        : !judgeable || qualityRatio === null ? 'low_data'
        : qualityRatio >= CLICK_QUALITY_FLOOR ? 'pass'
        : 'blocked'
    return {
      ...s,
      clickers: r.clickers,
      netNewPaid: r.net_new_paid,
      completions: r.completions,
      clickRate: r.exposures > 0 ? r.clickers / r.exposures : 0,
      completionRate: r.exposures > 0 ? r.completions / r.exposures : 0,
      paidRate: r.exposures > 0 ? r.net_new_paid / r.exposures : 0,
      clickToPaid,
      qualityRatio,
      guardrail,
    }
  })
}

export interface BanditRunResult {
  experimentKey: string
  action: 'held' | 'reallocated' | 'paused'
  reason: string
  weights?: Record<string, number>
}

/**
 * One bandit pass over a single running experiment:
 *   1. guardrail — a non-control variant with ≥ minExposures whose
 *      P(beats control) ≤ 0.05 gets weight 0
 *   2. hold until every approved variant has ≥ minExposures exposures
 *   3. Thompson reallocation (floor 0.10, control pinned by the same floor)
 * Only the `weight` field of approved variants is ever mutated — variant
 * copy is untouchable from this code path by construction.
 */
export async function runBanditForExperiment(row: ExperimentRow, trigger: string): Promise<BanditRunResult> {
  const c = client()
  const key = String(row.key)
  const results = await experimentResults(row)
  const variants: ExperimentVariant[] = Array.isArray(row.variants) ? [...row.variants] : []
  const minExp = typeof row.min_exposures_per_variant === 'number' ? row.min_exposures_per_variant : 200
  const control = results.find(r => r.key === 'control')

  const snapshot = Object.fromEntries(results.map(r => [r.key, {
    exposures: r.exposures, conversions: r.conversions, probBest: Number(r.probBest.toFixed(3)),
  }]))

  // 1. Guardrail: kill clearly-losing variants.
  let guarded = false
  if (control) {
    for (const v of variants) {
      if (v.key === 'control' || v.approved === false) continue
      const r = results.find(x => x.key === v.key)
      if (r && r.exposures >= minExp && probBeatsControl(r, control) <= 0.05 && v.weight > 0) {
        v.weight = 0
        guarded = true
      }
    }
  }

  // 2. Exposure floor: pure explore until every approved variant is seasoned.
  const approved = variants.filter(v => v.approved !== false && v.weight > 0)
  const allSeasoned = approved.every(v => (results.find(r => r.key === v.key)?.exposures ?? 0) >= minExp)

  if (!row.bandit_enabled || !allSeasoned) {
    if (guarded) {
      await c.from('experiments').update({ variants, updated_at: new Date().toISOString() }).eq('key', key)
      await c.from('experiment_weight_history').insert({
        experiment_key: key,
        weights: Object.fromEntries(variants.map(v => [v.key, v.weight])),
        results_snapshot: snapshot,
        trigger: 'guardrail',
      })
      return { experimentKey: key, action: 'reallocated', reason: 'guardrail zeroed a losing variant', weights: Object.fromEntries(variants.map(v => [v.key, v.weight])) }
    }
    return { experimentKey: key, action: 'held', reason: row.bandit_enabled ? `exposure floor not met (need ${minExp}/variant)` : 'bandit disabled' }
  }

  // 3. Thompson reallocation among approved variants only.
  const stats = results.filter(r => approved.some(v => v.key === r.key))
  const newWeights = thompsonWeights(stats, 0.1)
  for (const v of variants) {
    if (v.approved === false) { v.weight = 0; continue }
    if (v.key in newWeights) v.weight = newWeights[v.key]
  }
  await c.from('experiments').update({ variants, updated_at: new Date().toISOString() }).eq('key', key)
  await c.from('experiment_weight_history').insert({
    experiment_key: key,
    weights: Object.fromEntries(variants.map(v => [v.key, v.weight])),
    results_snapshot: snapshot,
    trigger,
  })
  return { experimentKey: key, action: 'reallocated', reason: 'thompson reallocation', weights: newWeights }
}

export type { Experiment }
