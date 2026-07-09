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
  clickRate: number
}

/** Per-variant results via the experiment_results() SQL function, with
 *  Bayesian stats computed on the experiment's primary metric. */
export async function experimentResults(row: ExperimentRow): Promise<VariantResult[]> {
  const { data, error } = await client().rpc('experiment_results', { exp_key: row.key })
  if (error) throw new Error(error.message)
  const byKey = new Map<string, { exposures: number; clickers: number; net_new_paid: number }>()
  for (const r of (data || []) as { variant_key: string; exposures: number; clickers: number; net_new_paid: number }[]) {
    byKey.set(r.variant_key, { exposures: Number(r.exposures), clickers: Number(r.clickers), net_new_paid: Number(r.net_new_paid) })
  }
  const variants: ExperimentVariant[] = Array.isArray(row.variants) ? row.variants : []
  const primary: 'checkout_click' | 'net_new_paid' = row.primary_metric === 'net_new_paid' ? 'net_new_paid' : 'checkout_click'
  const counts: VariantCounts[] = variants.map(v => {
    const r = byKey.get(v.key) || { exposures: 0, clickers: 0, net_new_paid: 0 }
    return { key: v.key, exposures: r.exposures, conversions: primary === 'net_new_paid' ? r.net_new_paid : r.clickers }
  })
  const stats = computeStats(counts)
  return stats.map(s => {
    const r = byKey.get(s.key) || { exposures: 0, clickers: 0, net_new_paid: 0 }
    return {
      ...s,
      clickers: r.clickers,
      netNewPaid: r.net_new_paid,
      clickRate: r.exposures > 0 ? r.clickers / r.exposures : 0,
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
