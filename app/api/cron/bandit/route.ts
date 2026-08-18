// Bandit + guardrail + CONCLUSION pass over every RUNNING experiment.
// Invoked by Vercel Cron (vercel.json) with Authorization: Bearer CRON_SECRET.
//
// Per experiment:
//   1. runBanditForExperiment — per-variant guardrail (zero a variant whose
//      P(beats control) ≤ 0.05 at ≥ minExposures) + Thompson reallocation
//      once every approved variant clears the exposure floor. Only `weight`
//      on approved variants is ever mutated. Skipped once a winner is
//      crowned: crowned weights are locked, not re-Thompsoned away.
//   2. Experiment-wide 7-day health check: if pooled non-control click rate
//      falls below 50% of control's (with ≥300 pooled exposures in the
//      window), auto-pause the experiment and email an alert.
//   3. AUTO-CONCLUDE (owner, 2026-08-17: "should we be more aggressive?
//      self-optimization should serve right this way"). Two moves the
//      bandit could not make before:
//        KILL — every challenger has been guardrail-zeroed → the experiment
//        ends itself, control is the winner, the surface is free for the
//        next test instead of serving a decided question forever.
//        CROWN — a variant holds ≥97% posterior win probability on clicks
//        at ≥150 people per arm AND is not behind on actual quiz trials.
//        The trials gate is not optional: the week of Aug 10 produced 32%
//        more clicks and HALF the trials, so clicks alone can never crown.
//        Crowning locks weights (winner 100%) and keeps the row running so
//        the winner serves; the email tells the owner to hard-code it.

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { EXPERIMENTS_CACHE_TAG } from '@/lib/experiments'
import { runBanditForExperiment, type BanditRunResult } from '@/lib/experiment-queries'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // A cron reads current state, so its reads must never be served from cache.
    // On 2026-08-08 the pass-recovery cron spent 14 hours acting on a snapshot
    // frozen at 13:15: it mailed the wrong people, then silently mailed nobody,
    // and looked healthy throughout because a cached answer is a confident one.
    // Same client, same risk. See app/api/cron/pass-recovery/route.ts.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}

async function sendAlert(subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ADMIN_NOTIFY_FROM || 'AI Central <onboarding@resend.dev>',
        to: [process.env.ADMIN_NOTIFY_EMAIL || 'chatgptcentral@gmail.com'],
        subject,
        text,
      }),
    })
  } catch (err) {
    console.error('[bandit-cron] alert email failed:', err)
  }
}

// ── Beta posterior sampling for the conclusion check ──
// Marsaglia–Tsang gamma sampling with Box–Muller normals; Beta(a,b) as
// Ga/(Ga+Gb). No dependency, exact enough for a 97% decision threshold.
function sampleNormal(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
function sampleGamma(shape: number): number {
  if (shape < 1) {
    const u = Math.random()
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape)
  }
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
function sampleBeta(a: number, b: number): number {
  const ga = sampleGamma(a)
  const gb = sampleGamma(b)
  return ga / (ga + gb)
}

type ConclusionStat = { variant_key: string; people: number; clickers: number; quiz_trials: number }

/** P(each arm is the best on click rate), by Monte Carlo over Beta posteriors. */
function winProbabilities(stats: ConclusionStat[], draws = 4000): Map<string, number> {
  const wins = new Map<string, number>(stats.map(s => [s.variant_key, 0]))
  for (let i = 0; i < draws; i++) {
    let best = ''
    let bestV = -1
    for (const s of stats) {
      const v = sampleBeta(s.clickers + 1, Math.max(0, s.people - s.clickers) + 1)
      if (v > bestV) { bestV = v; best = s.variant_key }
    }
    wins.set(best, (wins.get(best) ?? 0) + 1)
  }
  return new Map(Array.from(wins.entries()).map(([k, n]) => [k, n / draws]))
}

/** 7-day per-variant unique exposure/clicker counts from funnel_events. */
async function windowCounts(expKey: string): Promise<Map<string, { exposures: Set<string>; clickers: Set<string> }>> {
  const c = sb()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const out = new Map<string, { exposures: Set<string>; clickers: Set<string> }>()
  const PAGE = 1000
  for (let offset = 0; offset < 50_000; offset += PAGE) {
    const { data, error } = await c
      .from('funnel_events')
      .select('event, variant_key, anon_id')
      .eq('experiment_key', expKey)
      .gte('ts', since)
      .in('event', ['exposure', 'checkout_click'])
      .range(offset, offset + PAGE - 1)
    if (error || !data) break
    for (const r of data as { event: string; variant_key: string | null; anon_id: string | null }[]) {
      if (!r.variant_key || !r.anon_id) continue
      const e = out.get(r.variant_key) || { exposures: new Set<string>(), clickers: new Set<string>() }
      if (r.event === 'exposure') e.exposures.add(r.anon_id)
      else e.clickers.add(r.anon_id)
      out.set(r.variant_key, e)
    }
    if (data.length < PAGE) break
  }
  return out
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const c = sb()

  // Cohort assignment rides this cron (owner's instrument, 2026-08-18):
  // every 100 landers in arrival order becomes a numbered cohort, and the
  // per-cohort stage rates drive each retrain cycle. Idempotent and cheap;
  // a failure here must never block the bandit pass.
  try { await c.rpc('assign_funnel_cohorts', { batch_size: 100 }) } catch (e) {
    console.error('[bandit-cron] cohort assignment failed:', e)
  }

  const { data: running, error } = await c.from('experiments').select('*').eq('status', 'running')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: (BanditRunResult | { experimentKey: string; action: string; reason: string })[] = []
  for (const row of running || []) {
    try {
      // A crowned winner is being served at locked weights; re-Thompsoning
      // it would un-crown it a quarter hour later.
      if (row.winner_variant) {
        results.push({ experimentKey: row.key, action: 'winner_locked', reason: `serving ${row.winner_variant} at 100% until it is hard-coded` })
        continue
      }

      // 1. Per-variant guardrail + Thompson reallocation, batched by LEADS:
      // the cron fires every 15 minutes but only reallocates an experiment
      // once 10 new people have been exposed since its last reallocation.
      results.push(await runBanditForExperiment(row, 'bandit_cron', { minNewExposures: 10 }))

      // 2. Experiment-wide 7-day health check.
      const win = await windowCounts(row.key)
      const control = win.get('control')
      if (control && control.exposures.size > 0) {
        let pooledExp = 0
        let pooledClk = 0
        for (const [vkey, v] of Array.from(win.entries())) {
          if (vkey === 'control') continue
          pooledExp += v.exposures.size
          pooledClk += v.clickers.size
        }
        const controlRate = control.clickers.size / control.exposures.size
        const pooledRate = pooledExp > 0 ? pooledClk / pooledExp : 0
        if (pooledExp + control.exposures.size >= 300 && controlRate > 0 && pooledRate < controlRate * 0.5) {
          await c.from('experiments').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('key', row.key)
          await c.from('experiment_weight_history').insert({
            experiment_key: row.key,
            weights: Object.fromEntries(((row.variants as { key: string; weight: number }[]) || []).map(v => [v.key, v.weight])),
            results_snapshot: { window7d: { controlRate, pooledRate, pooledExp } },
            trigger: 'guardrail',
          })
          await sendAlert(
            `[experiments] auto-paused: ${row.key}`,
            `Experiment "${row.name}" (${row.key}) was auto-paused.\n\n7-day pooled variant click rate ${(pooledRate * 100).toFixed(1)}% fell below 50% of control's ${(controlRate * 100).toFixed(1)}% (${pooledExp} pooled exposures).\n\nReview it in /admin/experiments.`,
          )
          results.push({ experimentKey: row.key, action: 'paused', reason: 'pooled 7d click rate < 50% of control' })
        }
      }

      // 3. AUTO-CONCLUDE. Re-read the row: step 1 may have moved weights,
      // and a step-2 pause must not be concluded over.
      const { data: fresh } = await c.from('experiments').select('*').eq('key', row.key).maybeSingle()
      if (!fresh || fresh.status !== 'running' || fresh.winner_variant) continue
      const variants = (fresh.variants as { key: string; weight: number; approved?: boolean }[]) || []
      const challengers = variants.filter(v => v.key !== 'control' && v.approved !== false)

      // KILL: the guardrail has zeroed every challenger — the question is
      // answered, stop spending a surface on it.
      if (challengers.length > 0 && challengers.every(v => (v.weight ?? 0) === 0)) {
        await c.from('experiments').update({ status: 'ended', winner_variant: 'control', ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('key', row.key)
        await c.from('experiment_weight_history').insert({
          experiment_key: row.key,
          weights: Object.fromEntries(variants.map(v => [v.key, v.weight])),
          results_snapshot: { auto_conclude: 'all challengers guardrail-zeroed' },
          trigger: 'auto_conclude_kill',
        })
        await sendAlert(
          `[experiments] auto-concluded: ${row.key} — control wins`,
          `Every challenger in "${row.name}" (${row.key}) was guardrail-zeroed, so the experiment ended itself and control serves.\n\nThe surface is free for the next test.`,
        )
        results.push({ experimentKey: row.key, action: 'auto_concluded', reason: 'all challengers zeroed — control wins' })
        continue
      }

      // CROWN: posterior certainty on clicks, sanity-gated on real trials.
      const { data: statsRaw } = await c.rpc('experiment_conclusion_stats', { exp_key: row.key })
      const stats = (statsRaw ?? []) as ConclusionStat[]
      const minPeople = Math.max(150, Number(fresh.min_exposures_per_variant) || 0)
      if (stats.length >= 2 && stats.every(s => s.people >= minPeople)) {
        const probs = winProbabilities(stats)
        const top = Array.from(probs.entries()).sort((a, b) => b[1] - a[1])[0]
        if (top && top[1] >= 0.97) {
          const [winKey, p] = top
          const winStat = stats.find(s => s.variant_key === winKey)
          const ctlStat = stats.find(s => s.variant_key === 'control')
          const trialsOk = winKey === 'control' || !winStat || !ctlStat
            ? true
            : winStat.quiz_trials / Math.max(1, winStat.people) >= ctlStat.quiz_trials / Math.max(1, ctlStat.people)
          if (!trialsOk) {
            // Clicks say crown, trials say no. Say so and keep testing: this
            // exact divergence halved a week's trials once already.
            results.push({ experimentKey: row.key, action: 'crown_withheld', reason: `${winKey} at ${(p * 100).toFixed(1)}% on clicks but behind on trials` })
          } else if (winKey === 'control') {
            await c.from('experiments').update({ status: 'ended', winner_variant: 'control', ended_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('key', row.key)
            await c.from('experiment_weight_history').insert({
              experiment_key: row.key,
              weights: Object.fromEntries(variants.map(v => [v.key, v.weight])),
              results_snapshot: { auto_conclude: { winner: 'control', p, stats } },
              trigger: 'auto_conclude_crown',
            })
            await sendAlert(
              `[experiments] auto-concluded: ${row.key} — control wins`,
              `Control holds ${(p * 100).toFixed(1)}% posterior win probability in "${row.name}" (${row.key}). Ended; the page already serves control.\n\nThe surface is free for the next test.`,
            )
            results.push({ experimentKey: row.key, action: 'auto_concluded', reason: `control wins at ${(p * 100).toFixed(1)}%` })
          } else {
            const locked = variants.map(v => ({ ...v, weight: v.key === winKey ? 1 : 0 }))
            await c.from('experiments').update({ variants: locked, winner_variant: winKey, updated_at: new Date().toISOString() }).eq('key', row.key)
            await c.from('experiment_weight_history').insert({
              experiment_key: row.key,
              weights: Object.fromEntries(locked.map(v => [v.key, v.weight])),
              results_snapshot: { auto_conclude: { winner: winKey, p, stats } },
              trigger: 'auto_conclude_crown',
            })
            await sendAlert(
              `[experiments] winner crowned: ${row.key} — ${winKey} now serves 100%`,
              `"${winKey}" holds ${(p * 100).toFixed(1)}% posterior win probability on clicks in "${row.name}" (${row.key}) and is not behind on trials, so its weight is locked at 100% and every visitor now gets it.\n\nNext step (human): hard-code the winning design and end the experiment row.`,
            )
            results.push({ experimentKey: row.key, action: 'winner_crowned', reason: `${winKey} at ${(p * 100).toFixed(1)}% on clicks, trials gate passed` })
          }
        }
      }
    } catch (err) {
      console.error(`[bandit-cron] ${row.key} failed:`, err)
      results.push({ experimentKey: row.key, action: 'error', reason: String(err) })
    }
  }

  revalidateTag(EXPERIMENTS_CACHE_TAG)
  return NextResponse.json({ ok: true, ran: results.length, results })
}
