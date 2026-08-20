// Beta posteriors over a rate, and the one question worth asking of two of
// them: how sure are we that A beats B.
//
// EXTRACTED from app/api/cron/bandit/route.ts on 2026-08-20, where it had been
// the private maths of one cron. The cohort learning engine needs exactly the
// same answer about exactly the same kind of number, and CLAUDE.md's rule is
// that a fact gets computed once. Two copies of a sampler drift, and when they
// drift the two screens disagree about whether a change worked.
//
// Everything here is a rate on counted people: started of landed, clickers of
// exposed, trials of finishers. Beta(k+1, n-k+1) is the posterior for that
// under a flat prior, which is the honest default when we know nothing.

function sampleNormal(): number {
  // Box-Muller. Math.random() never returns 1, and u === 0 would give -Infinity.
  let u = 0
  while (u === 0) u = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random())
}

function sampleGamma(shape: number): number {
  // Marsaglia-Tsang. Below 1 the boost transform keeps it valid.
  if (shape < 1) return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape)
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    let x = 0
    let v = 0
    do { x = sampleNormal(); v = 1 + c * x } while (v <= 0)
    v = v * v * v
    const u = Math.random()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
}

export function sampleBeta(a: number, b: number): number {
  const ga = sampleGamma(a)
  const gb = sampleGamma(b)
  return ga / (ga + gb)
}

/** P(rate of A > rate of B), by Monte Carlo over both Beta posteriors.
 *
 *  k = people who did the thing, n = people who could have. Returns 0.5 when
 *  either side has no people at all, because with no evidence the honest
 *  answer is a coin, not a number that looks like knowledge. */
export function probBetter(
  aK: number, aN: number, bK: number, bN: number, draws = 8000,
): number {
  if (aN <= 0 || bN <= 0) return 0.5
  let wins = 0
  for (let i = 0; i < draws; i++) {
    const a = sampleBeta(aK + 1, Math.max(0, aN - aK) + 1)
    const b = sampleBeta(bK + 1, Math.max(0, bN - bK) + 1)
    if (a > b) wins++
  }
  return wins / draws
}

/** The 95% credible interval on a rate, as percentage points.
 *  Sorted draws rather than a normal approximation: at n=30 and k=1 the normal
 *  interval runs below zero, which is not a rate anybody can have. */
export function credibleInterval(k: number, n: number, draws = 4000): [number, number] {
  if (n <= 0) return [0, 100]
  const xs: number[] = []
  for (let i = 0; i < draws; i++) xs.push(sampleBeta(k + 1, Math.max(0, n - k) + 1))
  xs.sort((x, y) => x - y)
  return [xs[Math.floor(draws * 0.025)] * 100, xs[Math.floor(draws * 0.975)] * 100]
}

/**
 * How many more people this step needs before a delta of `deltaPts` could be
 * resolved, given the rate we are seeing.
 *
 * This is the number that makes a learning honest. Without it "not confirmed
 * yet" and "never going to be confirmed" look identical on a screen, and the
 * cohort instrument spent its first two days looking like the second while
 * being reported as the first.
 *
 * Standard two-proportion sample size at 95% / 80% power, per arm.
 */
export function nNeededPerArm(baselineRate: number, deltaPts: number): number {
  const p1 = Math.min(0.999, Math.max(0.001, baselineRate))
  const p2 = Math.min(0.999, Math.max(0.001, p1 + deltaPts / 100))
  const pBar = (p1 + p2) / 2
  const num = 1.96 * Math.sqrt(2 * pBar * (1 - pBar)) + 0.84 * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))
  const denom = Math.abs(p2 - p1)
  if (denom === 0) return Infinity
  return Math.ceil((num / denom) ** 2)
}
