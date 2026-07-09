// Daily bandit + guardrail pass over every RUNNING experiment.
// Invoked by Vercel Cron (vercel.json) with Authorization: Bearer CRON_SECRET.
//
// Per experiment:
//   1. runBanditForExperiment — per-variant guardrail (zero a variant whose
//      P(beats control) ≤ 0.05 at ≥ minExposures) + Thompson reallocation
//      once every approved variant clears the exposure floor. Only `weight`
//      on approved variants is ever mutated.
//   2. Experiment-wide 7-day health check: if pooled non-control click rate
//      falls below 50% of control's (with ≥300 pooled exposures in the
//      window), auto-pause the experiment and email an alert.

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
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
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
  const { data: running, error } = await c.from('experiments').select('*').eq('status', 'running')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: (BanditRunResult | { experimentKey: string; action: string; reason: string })[] = []
  for (const row of running || []) {
    try {
      // 1. Per-variant guardrail + Thompson reallocation.
      results.push(await runBanditForExperiment(row, 'bandit_cron'))

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
    } catch (err) {
      console.error(`[bandit-cron] ${row.key} failed:`, err)
      results.push({ experimentKey: row.key, action: 'error', reason: String(err) })
    }
  }

  revalidateTag(EXPERIMENTS_CACHE_TAG)
  return NextResponse.json({ ok: true, ran: results.length, results })
}
