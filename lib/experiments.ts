// Homegrown A/B/n experimentation engine — server-side core.
//
// Design (validated against this codebase):
//   - Experiments are DATA in the `experiments` table, edited from /admin
//     with no deploys; only status='running' rows are ever served.
//   - Assignment happens HERE (called from the /result server component),
//     not in middleware — no Supabase read in the sitewide hot path, and
//     targeting needs stage/persona, which only the page knows.
//   - Deterministic bucketing: fnv1a32(anonId|key|salt) over the CURRENT
//     weights, so first paint has the variant (no flicker). Stickiness:
//     the ac_exp_<key> cookie (set by /api/events on first exposure) is
//     honored BEFORE hashing, so weight changes never reassign visitors.
//   - Fail-open: any error (missing table, bad JSON, no anon id) serves
//     control with zero overrides. The funnel can never go dark from this.
//
// Master flag: NEXT_PUBLIC_EXPERIMENTS_ENABLED === 'true'. Per-experiment
// kill is the status flip in admin (propagates ≤30s via the cache tag).

import { unstable_cache } from 'next/cache'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSlotKey } from './experiment-slots'

export const EXPERIMENTS_CACHE_TAG = 'experiments'

export interface ExperimentVariant {
  key: string
  name?: string
  weight: number
  approved?: boolean
  overrides: Record<string, string>
}

export interface ExperimentTargeting {
  stages?: string[]
  personas?: string[]
  utmSources?: string[]
}

export interface Experiment {
  key: string
  name: string
  status: string
  page: string
  targeting: ExperimentTargeting
  variants: ExperimentVariant[]
  primaryMetric: 'checkout_click' | 'net_new_paid'
  salt: string
  banditEnabled: boolean
  minExposuresPerVariant: number
  startedAt: string | null
  createdAt: string
}

export function experimentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EXPERIMENTS_ENABLED === 'true'
}

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
function rowToExperiment(r: any): Experiment | null {
  try {
    const variants: ExperimentVariant[] = Array.isArray(r.variants)
      ? r.variants
          .filter((v: unknown) => v && typeof v === 'object')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((v: any) => ({
            key: String(v.key || ''),
            name: typeof v.name === 'string' ? v.name : undefined,
            weight: typeof v.weight === 'number' && v.weight >= 0 ? v.weight : 0,
            approved: v.approved !== false,
            overrides:
              v.overrides && typeof v.overrides === 'object'
                ? Object.fromEntries(
                    Object.entries(v.overrides as Record<string, unknown>)
                      .filter(([k, val]) => isSlotKey(k) && typeof val === 'string')
                      .map(([k, val]) => [k, String(val)]),
                  )
                : {},
          }))
          .filter((v: ExperimentVariant) => v.key)
      : []
    if (!r.key || variants.length === 0) return null
    return {
      key: String(r.key),
      name: String(r.name || r.key),
      status: String(r.status || 'draft'),
      page: String(r.page || 'result'),
      targeting: (r.targeting && typeof r.targeting === 'object' ? r.targeting : {}) as ExperimentTargeting,
      variants,
      primaryMetric: r.primary_metric === 'net_new_paid' ? 'net_new_paid' : 'checkout_click',
      salt: String(r.salt || ''),
      banditEnabled: !!r.bandit_enabled,
      minExposuresPerVariant: typeof r.min_exposures_per_variant === 'number' ? r.min_exposures_per_variant : 200,
      startedAt: r.started_at ?? null,
      createdAt: String(r.created_at || ''),
    }
  } catch {
    return null
  }
}

/** Running experiments, cached 30s; every admin mutation revalidates the
 *  tag, so a kill propagates in ≤30s with no deploy. Fails open to []. */
export const getActiveExperiments = unstable_cache(
  async (): Promise<Experiment[]> => {
    try {
      const { data, error } = await client()
        .from('experiments')
        .select('*')
        .eq('status', 'running')
        .order('created_at', { ascending: true })
      if (error) {
        console.warn('[experiments] fetch failed, serving control:', error.message)
        return []
      }
      return (data || []).map(rowToExperiment).filter((e): e is Experiment => !!e)
    } catch (err) {
      console.warn('[experiments] fetch threw, serving control:', err)
      return []
    }
  },
  ['experiments-active'],
  { revalidate: 30, tags: [EXPERIMENTS_CACHE_TAG] },
)

/** FNV-1a 32-bit — synchronous, dependency-free, deterministic. */
export function fnv1a32(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function matchesTargeting(t: ExperimentTargeting, ctx: ResolveContext): boolean {
  if (t.stages?.length && (!ctx.stage || !t.stages.includes(ctx.stage))) return false
  if (t.personas?.length && (!ctx.persona || !t.personas.includes(ctx.persona))) return false
  if (t.utmSources?.length && (!ctx.utmSource || !t.utmSources.includes(ctx.utmSource))) return false
  return true
}

/** Weighted deterministic pick over approved variants with CURRENT weights. */
export function pickVariant(exp: Experiment, anonId: string): ExperimentVariant | null {
  const eligible = exp.variants.map(v => ({ ...v, weight: v.approved === false ? 0 : v.weight }))
  const total = eligible.reduce((a, v) => a + v.weight, 0)
  if (total <= 0) return exp.variants.find(v => v.key === 'control') ?? exp.variants[0] ?? null
  const bucket = (fnv1a32(`${anonId}|${exp.key}|${exp.salt}`) / 0x100000000) * total
  let acc = 0
  for (const v of eligible) {
    acc += v.weight
    if (bucket < acc) return v
  }
  return eligible[eligible.length - 1]
}

export interface ResolveContext {
  anonId?: string | null
  /** Sticky per-experiment variant from the ac_exp_<key> cookie. */
  cookieVariant: (experimentKey: string) => string | undefined
  stage?: string | null
  persona?: string | null
  utmSource?: string | null
  page?: string
}

export interface ResolvedAssignment {
  experimentKey: string
  variantKey: string
}

export interface Resolution {
  assignments: ResolvedAssignment[]
  /** Merged slot overrides; when two running experiments claim the same
   *  slot, the earlier-created experiment wins (admin also blocks this). */
  overrides: Record<string, string>
}

const CONTROL_RESOLUTION: Resolution = { assignments: [], overrides: {} }

export async function resolveExperiments(ctx: ResolveContext): Promise<Resolution> {
  if (!experimentsEnabled()) return CONTROL_RESOLUTION
  try {
    const exps = await getActiveExperiments()
    if (exps.length === 0) return CONTROL_RESOLUTION
    const page = ctx.page ?? 'result'
    const assignments: ResolvedAssignment[] = []
    const overrides: Record<string, string> = {}

    for (const exp of exps) {
      if (exp.page !== page) continue
      if (!matchesTargeting(exp.targeting, ctx)) continue

      // Sticky first: an existing cookie assignment always wins while the
      // experiment is running and the variant still exists.
      let variant: ExperimentVariant | null = null
      const sticky = ctx.cookieVariant(exp.key)
      if (sticky) variant = exp.variants.find(v => v.key === sticky) ?? null
      if (!variant) {
        if (!ctx.anonId) {
          // No anon id (cookie rejection / middleware failure): serve
          // control silently, no exposure bookkeeping.
          continue
        }
        variant = pickVariant(exp, ctx.anonId)
      }
      if (!variant) continue

      assignments.push({ experimentKey: exp.key, variantKey: variant.key })
      for (const [slot, value] of Object.entries(variant.overrides)) {
        if (!(slot in overrides)) overrides[slot] = value
      }
    }
    return { assignments, overrides }
  } catch (err) {
    console.warn('[experiments] resolve failed, serving control:', err)
    return CONTROL_RESOLUTION
  }
}

/** Used by /api/events to refuse exposures for unknown experiments/variants. */
export async function isValidRunningVariant(experimentKey: string, variantKey: string): Promise<boolean> {
  if (!experimentsEnabled()) return false
  try {
    const exps = await getActiveExperiments()
    const exp = exps.find(e => e.key === experimentKey)
    return !!exp && exp.variants.some(v => v.key === variantKey)
  } catch {
    return false
  }
}
