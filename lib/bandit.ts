// Beta-Bernoulli Thompson-sampling utilities — plain TypeScript, no deps.
//
// Posterior per variant: Beta(1 + conversions, 1 + exposures - conversions)
// (uniform prior). P(best) and expected loss come from one shared Monte
// Carlo sample matrix. Gamma sampling via Marsaglia–Tsang; normals via
// Box–Muller. Deterministic enough at 20k iterations for admin display and
// daily weight reallocation.

function randn(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Marsaglia–Tsang gamma sampler, shape k > 0, scale 1. */
export function sampleGamma(shape: number): number {
  if (shape < 1) {
    // Boost: Gamma(k) = Gamma(k+1) · U^(1/k)
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape)
  }
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x: number
    let v: number
    do {
      x = randn()
      v = 1 + c * x
    } while (v <= 0)
    v = v * v * v
    const u = Math.random()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

export function sampleBeta(a: number, b: number): number {
  const x = sampleGamma(a)
  const y = sampleGamma(b)
  return x / (x + y)
}

export interface VariantCounts {
  key: string
  exposures: number
  conversions: number
}

export interface VariantStats extends VariantCounts {
  rate: number
  /** P(this variant has the highest true rate). */
  probBest: number
  /** E[best rate - this rate] — how much you lose per visitor by shipping this one. */
  expectedLoss: number
}

export function computeStats(counts: VariantCounts[], iterations = 20_000): VariantStats[] {
  if (counts.length === 0) return []
  const wins = new Array<number>(counts.length).fill(0)
  const lossSum = new Array<number>(counts.length).fill(0)
  for (let it = 0; it < iterations; it++) {
    let bestTheta = -1
    let bestIdx = 0
    const thetas = counts.map(c =>
      sampleBeta(1 + c.conversions, 1 + Math.max(0, c.exposures - c.conversions)),
    )
    for (let i = 0; i < thetas.length; i++) {
      if (thetas[i] > bestTheta) {
        bestTheta = thetas[i]
        bestIdx = i
      }
    }
    wins[bestIdx]++
    for (let i = 0; i < thetas.length; i++) lossSum[i] += bestTheta - thetas[i]
  }
  return counts.map((c, i) => ({
    ...c,
    rate: c.exposures > 0 ? c.conversions / c.exposures : 0,
    probBest: wins[i] / iterations,
    expectedLoss: lossSum[i] / iterations,
  }))
}

/** P(variant beats control) — pairwise, for the auto-pause guardrail. */
export function probBeatsControl(variant: VariantCounts, control: VariantCounts, iterations = 20_000): number {
  let wins = 0
  for (let i = 0; i < iterations; i++) {
    const tv = sampleBeta(1 + variant.conversions, 1 + Math.max(0, variant.exposures - variant.conversions))
    const tc = sampleBeta(1 + control.conversions, 1 + Math.max(0, control.exposures - control.conversions))
    if (tv > tc) wins++
  }
  return wins / iterations
}

/**
 * Thompson reallocation: new weight = probBest, with a hard POST-
 * normalization floor so every variant (control included) keeps ≥ floor
 * of the traffic no matter how badly it's losing. Rounded to 2dp with the
 * drift folded into the largest weight.
 */
export function thompsonWeights(stats: VariantStats[], floor = 0.1): Record<string, number> {
  const n = stats.length
  if (n === 0) return {}
  const f = floor * n >= 1 ? Math.floor(100 / n) / 100 : floor
  let w = stats.map(s => Math.max(s.probBest, 1e-6))
  const total0 = w.reduce((a, b) => a + b, 0)
  w = w.map(x => x / total0)
  // Enforce the floor after normalization: pin floored variants, scale the
  // rest into the remaining mass. Converges in a couple of passes.
  for (let iter = 0; iter < 5; iter++) {
    const below = w.map(x => x < f)
    if (!below.some(Boolean)) break
    const fixedMass = below.filter(Boolean).length * f
    const freeSum = w.reduce((a, x, i) => a + (below[i] ? 0 : x), 0)
    if (freeSum <= 0) {
      w = w.map(() => 1 / n)
      break
    }
    w = w.map((x, i) => (below[i] ? f : (x * (1 - fixedMass)) / freeSum))
  }
  const rounded = w.map(x => Math.round(x * 100) / 100)
  const sum = rounded.reduce((a, b) => a + b, 0)
  const maxIdx = rounded.indexOf(Math.max(...rounded))
  rounded[maxIdx] = Math.round((rounded[maxIdx] + (1 - sum)) * 100) / 100
  const weights: Record<string, number> = {}
  stats.forEach((s, i) => {
    weights[s.key] = rounded[i]
  })
  return weights
}
