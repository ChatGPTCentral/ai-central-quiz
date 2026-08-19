// THE GENE POOL — page evolution, sized for the traffic we actually have.
//
// WHY NOT A NAIVE GENETIC ALGORITHM (owner, 2026-08-19, asking for exactly
// this): a population of whole pages splits 118 landings a day into slivers,
// and no individual ever earns a readable score — the same power problem that
// made our A/B program produce noise, but worse, because there are more arms.
//
// So fitness is estimated at the ALLELE level, pooled across every individual
// carrying it. "Duration-led offer" collects roughly half the surface's
// traffic instead of a twenty-fourth, which is what makes learning possible
// here at all. Individuals are then BRED from the alleles that are winning,
// and compete as wholes — so recombination can still discover interactions
// that a purely additive model would miss. A genetic algorithm whose fitness
// function is a pooled Bayesian estimate.
//
// Fitness is TRIALS. Clicks are a fast secondary signal used only to break
// ties among alleles with equal trial evidence, never to promote one on their
// own: the week of Aug 10 delivered 32% more clicks and half the trials.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Genome = Record<string, string>
export type Individual = { id: string; genome: Genome; generation: number; weight: number; retired_at: string | null; note?: string | null }
export type AlleleRow = { slot: string; allele: string; label: string; enabled: boolean; is_baseline: boolean; exposures: number; clickers: number; trials: number }

export const EVO_KEY = 'page_evolution'

export function db(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

/** FNV-1a: the same hash the experiment engine uses, so assignment is
 *  deterministic per person and stable across their visit. */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

/** Pick the individual this person sees: weighted, deterministic, and stable.
 *  A person keeps their page for as long as the population does not change,
 *  which is what makes their behaviour attributable to it. */
export function pickIndividual(pop: Individual[], anonId: string | null): Individual | null {
  const live = pop.filter(p => !p.retired_at && p.weight > 0)
  if (!live.length) return pop.find(p => p.id === 'baseline') ?? null
  const total = live.reduce((a, p) => a + p.weight, 0)
  if (total <= 0) return live[0]
  const r = (hash32(`${anonId ?? 'anon'}|${EVO_KEY}`) / 0xffffffff) * total
  let acc = 0
  for (const p of live) { acc += p.weight; if (r <= acc) return p }
  return live[live.length - 1]
}

// ── Beta posteriors, no dependency ──
function normal(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
function gamma(shape: number): number {
  if (shape < 1) return gamma(shape + 1) * Math.pow(Math.random(), 1 / shape)
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x = 0, v = 0
    do { x = normal(); v = 1 + c * x } while (v <= 0)
    v = v * v * v
    const u = Math.random()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}
export function sampleBeta(a: number, b: number): number { const x = gamma(a); return x / (x + gamma(b)) }

/** PARTIAL POOLING, deliberately. Each allele's trial rate is shrunk toward
 *  the population mean with a prior worth ~40 exposures, so an allele that
 *  has seen twelve people cannot leap to the top of the pool on one lucky
 *  sale — the failure mode that would make this whole thing a random number
 *  generator with good manners. */
const PRIOR_STRENGTH = 40
export function allelePosterior(rows: AlleleRow[]): Map<string, { mean: number; sample: () => number; exposures: number; trials: number }> {
  const totalExp = rows.reduce((a, r) => a + Number(r.exposures || 0), 0)
  const totalTrials = rows.reduce((a, r) => a + Number(r.trials || 0), 0)
  const popRate = totalExp > 0 ? totalTrials / totalExp : 0.02
  const out = new Map<string, { mean: number; sample: () => number; exposures: number; trials: number }>()
  for (const r of rows) {
    const n = Number(r.exposures || 0), k = Number(r.trials || 0)
    const a = k + popRate * PRIOR_STRENGTH
    const b = Math.max(0, n - k) + (1 - popRate) * PRIOR_STRENGTH
    out.set(`${r.slot}:${r.allele}`, { mean: a / (a + b), sample: () => sampleBeta(a, b), exposures: n, trials: k })
  }
  return out
}

/** Build a genome by Thompson-sampling each slot independently. This is the
 *  breeding step: a child inherits, per slot, whichever allele wins a draw
 *  from its posterior, so good genes spread while uncertain ones keep being
 *  explored rather than eliminated. */
export function breed(rows: AlleleRow[], post: ReturnType<typeof allelePosterior>, mutationRate = 0.15): Genome {
  const slots = Array.from(new Set(rows.filter(r => r.enabled).map(r => r.slot)))
  const g: Genome = {}
  for (const slot of slots) {
    const options = rows.filter(r => r.slot === slot && r.enabled)
    if (!options.length) continue
    if (Math.random() < mutationRate) {
      g[slot] = options[Math.floor(Math.random() * options.length)].allele
      continue
    }
    let best = options[0], bestDraw = -1
    for (const o of options) {
      const d = post.get(`${o.slot}:${o.allele}`)?.sample() ?? 0
      if (d > bestDraw) { bestDraw = d; best = o }
    }
    g[slot] = best.allele
  }
  return g
}

export const genomeKey = (g: Genome) => Object.keys(g).sort().map(k => `${k}=${g[k]}`).join('|')
