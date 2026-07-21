// Weekly resolver re-tune. Reads the full answer key (every labeled head-to-head
// in enrich_game) and, from the owner's verdicts:
//   1. measures the verified enricher's accuracy against ground truth, and
//   2. nudges the accept threshold from the error mix (false-positive heavy →
//      raise; false-negative heavy → lower), conservatively and clamped.
// Results land in resolver_config, which /api/admin/enrich/verify/enrich reads,
// so the resolver self-tunes as the owner keeps verifying. Vercel cron, Bearer
// CRON_SECRET (same contract as the other crons).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function slug(u: unknown): string | null {
  if (typeof u !== 'string') return null
  const m = u.toLowerCase().match(/\/in\/([^/?#]+)/)
  return m ? m[1].replace(/\/+$/, '') : null
}

interface Row {
  choice: string | null
  current: { linkedinUrl?: string } | null
  proposed: { linkedinUrl?: string } | null
  truth: { linkedinUrl?: string } | null
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const c = sb()
    const { data } = await c.from('enrich_game')
      .select('choice, current, proposed, truth')
      .not('labeled_at', 'is', null).neq('choice', 'skip')
    const rows = (data || []) as Row[]

    let scored = 0, correct = 0, fp = 0, proposedWithUrl = 0, fn = 0, truthWithUrl = 0
    for (const r of rows) {
      // Ground-truth LinkedIn slug the owner effectively confirmed.
      let truthSlug: string | null = null
      if (r.choice === 'new' || r.choice === 'both') truthSlug = slug(r.proposed?.linkedinUrl)
      else if (r.choice === 'current') truthSlug = slug(r.current?.linkedinUrl)
      else if (r.choice === 'manual') truthSlug = slug(r.truth?.linkedinUrl)
      else if (r.choice === 'neither') truthSlug = null
      else continue

      const propSlug = slug(r.proposed?.linkedinUrl)
      scored++
      if (propSlug === truthSlug) correct++
      if (propSlug) { proposedWithUrl++; if (propSlug !== truthSlug) fp++ }
      if (truthSlug) { truthWithUrl++; if (!propSlug) fn++ }
    }

    const accuracyPct = scored > 0 ? Math.round((correct / scored) * 1000) / 10 : 0
    const fpRate = proposedWithUrl > 0 ? fp / proposedWithUrl : 0
    const fnRate = truthWithUrl > 0 ? fn / truthWithUrl : 0

    const { data: cfg } = await c.from('resolver_config').select('accept_threshold').eq('id', 1).maybeSingle()
    const cur = cfg?.accept_threshold != null ? Number(cfg.accept_threshold) : 0.55
    let next = cur
    // Only move with enough signal, one small step, clamped.
    if (scored >= 20) {
      if (fpRate > 0.35 && fpRate >= fnRate) next = cur + 0.05        // too many wrong attaches → be stricter
      else if (fnRate > 0.35 && fnRate > fpRate) next = cur - 0.05     // too many misses → be looser
      next = Math.min(0.7, Math.max(0.45, Math.round(next * 100) / 100))
    }

    const accuracy = { correct, scored, pct: accuracyPct, fpRate: Math.round(fpRate * 100) / 100, fnRate: Math.round(fnRate * 100) / 100 }
    await c.from('resolver_config').upsert({
      id: 1, accept_threshold: next, accuracy, sample_size: scored, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })

    return NextResponse.json({ ok: true, accuracy, threshold: { from: cur, to: next } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
