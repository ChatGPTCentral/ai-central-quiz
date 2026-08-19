// THE EVOLUTION STEP — runs on the bandit's cadence, acts on its own clock.
//
// Two jobs, deliberately separate:
//   REWEIGHT (every run): re-allocate traffic across the live population by
//   Thompson-sampling each individual's genome from POOLED allele posteriors.
//   An individual made of promising genes earns traffic before it has any
//   trials of its own — which is the entire reason this works at our volume.
//   The baseline keeps a floor so there is always a control to measure
//   against, and so a bad generation cannot take the whole page down.
//
//   GENERATION (only when the population has actually learned something):
//   retire the weakest non-baseline individual, breed a replacement from the
//   winning alleles with a mutation rate that keeps exploring. Gated on real
//   evidence — a minimum number of exposures AND trials in the pool — because
//   breeding on noise is how a system like this turns into an expensive
//   random number generator.

import { NextRequest, NextResponse } from 'next/server'
import { db, allelePosterior, breed, genomeKey, type AlleleRow, type Individual } from '@/lib/evolution'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BASELINE_FLOOR = 0.20      // the control never drops below this share
const MAX_POPULATION = 6
const GEN_MIN_EXPOSURES = 400    // pool-wide, before any breeding happens
const GEN_MIN_TRIALS = 12        // pool-wide: fitness is trials, so no trials means no signal
const GEN_MIN_HOURS = 24         // and never more than one generation a day

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authed = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!authed) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const c = db()

  // MASTER SWITCH (supervision, 2026-08-19). One row, flipped live, stops the
  // whole thing: no reweighting, no breeding. The population keeps serving
  // whatever weights it already has, so pausing is safe rather than a cliff.
  const { data: cfgRow } = await c.from('app_settings').select('value').eq('key', 'evolution').maybeSingle()
  const cfg = (cfgRow?.value ?? {}) as { enabled?: boolean; auto_approve?: boolean }
  if (cfg.enabled === false) return NextResponse.json({ ok: true, paused: true })

  const [{ data: alleleData }, { data: popData }, { data: lastGen }] = await Promise.all([
    c.from('allele_fitness').select('*'),
    c.from('individual_fitness').select('*').is('retired_at', null).not('approved_at', 'is', null),
    c.from('evolution_log').select('at, generation').eq('action', 'generation').order('at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const alleles = (alleleData ?? []) as AlleleRow[]
  const pop = (popData ?? []) as (Individual & { exposures: number; clickers: number; trials: number })[]
  if (!alleles.length || !pop.length) return NextResponse.json({ ok: true, skipped: 'no pool' })

  const post = allelePosterior(alleles)
  const slots = Array.from(new Set(alleles.filter(a => a.enabled).map(a => a.slot)))

  // ── REWEIGHT ──
  // Each individual's score is the product of its alleles' sampled rates:
  // a page is only as good as the genes it carries, and sampling (rather than
  // taking the mean) is what keeps exploring instead of collapsing early.
  const DRAWS = 800
  const wins = new Map<string, number>(pop.map(p => [p.id, 0]))
  for (let d = 0; d < DRAWS; d++) {
    let best = pop[0].id, bestScore = -1
    for (const ind of pop) {
      let score = 1
      for (const slot of slots) {
        const allele = (ind.genome as Record<string, string>)[slot]
        score *= post.get(`${slot}:${allele}`)?.sample() ?? 0.0001
      }
      if (score > bestScore) { bestScore = score; best = ind.id }
    }
    wins.set(best, (wins.get(best) ?? 0) + 1)
  }
  const raw = new Map(Array.from(wins.entries()).map(([id, w]) => [id, w / DRAWS]))
  // Floors: the baseline holds its share, and nobody is starved to zero
  // (an individual with no traffic can never prove itself wrong).
  const FLOOR = 0.05
  let weights = new Map(Array.from(raw.entries()).map(([id, w]) => [id, Math.max(FLOOR, w)]))
  if (weights.has('baseline')) weights.set('baseline', Math.max(BASELINE_FLOOR, weights.get('baseline')!))
  const sum = Array.from(weights.values()).reduce((a, b) => a + b, 0)
  weights = new Map(Array.from(weights.entries()).map(([id, w]) => [id, w / sum]))

  for (const [id, w] of Array.from(weights.entries())) {
    await c.from('page_individuals').update({ weight: Number(w.toFixed(4)) }).eq('id', id)
  }
  await c.from('evolution_log').insert({
    generation: pop[0]?.generation ?? 0, action: 'reweight',
    detail: { weights: Object.fromEntries(Array.from(weights.entries()).map(([k, v]) => [k, Number(v.toFixed(3))])) },
  })

  // ── GENERATION ──
  const totalExp = pop.reduce((a, p) => a + Number(p.exposures || 0), 0)
  const totalTrials = pop.reduce((a, p) => a + Number(p.trials || 0), 0)
  const hoursSince = lastGen?.at ? (Date.now() - new Date(lastGen.at as string).getTime()) / 3600_000 : 999
  const canBreed = totalExp >= GEN_MIN_EXPOSURES && totalTrials >= GEN_MIN_TRIALS && hoursSince >= GEN_MIN_HOURS
  if (!canBreed) {
    return NextResponse.json({
      ok: true, reweighted: weights.size,
      breeding: false,
      why: `pool has ${totalExp} exposures and ${totalTrials} trials; needs ${GEN_MIN_EXPOSURES} and ${GEN_MIN_TRIALS}, and ${GEN_MIN_HOURS}h between generations (last was ${hoursSince.toFixed(1)}h ago)`,
      weights: Object.fromEntries(weights),
    })
  }

  const generation = (pop.reduce((a, p) => Math.max(a, p.generation), 0)) + 1
  // Retire the weakest challenger that has actually been seen enough to
  // deserve the verdict; the baseline is never retired.
  const eligible = pop.filter(p => p.id !== 'baseline' && Number(p.exposures) >= 60)
    .sort((a, b) => (Number(a.trials) / Math.max(1, Number(a.exposures))) - (Number(b.trials) / Math.max(1, Number(b.exposures))))
  const retired = eligible[0]
  if (retired && pop.length >= MAX_POPULATION) {
    await c.from('page_individuals').update({ retired_at: new Date().toISOString(), weight: 0 }).eq('id', retired.id)
  }

  // Breed until we find a genome nobody in the population already has.
  const existing = new Set(pop.filter(p => p.id !== retired?.id).map(p => genomeKey(p.genome as Record<string, string>)))
  let child = breed(alleles, post), tries = 0
  while (existing.has(genomeKey(child)) && tries++ < 20) child = breed(alleles, post, 0.4)
  const childId = `g${generation}-${Math.random().toString(36).slice(2, 6)}`
  // BORN PENDING. Zero weight, previewable, serving nobody until a human
  // approves it on /admin/evolve — unless the owner has explicitly switched
  // auto_approve on, which is his call to make and his to revoke.
  const auto = cfg.auto_approve === true
  await c.from('page_individuals').insert({
    id: childId, genome: child, generation, weight: 0,
    approved_at: auto ? new Date().toISOString() : null,
    approved_by: auto ? 'auto_approve' : null,
    parents: pop.filter(p => p.id !== retired?.id).slice(0, 2).map(p => p.id),
    note: 'bred from the pooled allele posteriors',
  })
  await c.from('evolution_log').insert({
    generation, action: 'generation',
    detail: { born: childId, genome: child, retired: retired?.id ?? null, pool: { exposures: totalExp, trials: totalTrials } },
  })

  return NextResponse.json({
    ok: true, generation, born: childId, genome: child, retired: retired?.id ?? null,
    serving: cfg.auto_approve === true ? 'auto-approved' : 'PENDING YOUR APPROVAL — serving no traffic',
  })
}
