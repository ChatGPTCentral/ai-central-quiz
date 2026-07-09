// Experiment lifecycle actions: start / pause / end / kill / approve_variant
// / run_bandit. Guarded by isAdmin(); every mutation revalidates the
// 'experiments' tag so the funnel converges in ≤30s.

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { EXPERIMENTS_CACHE_TAG, type ExperimentVariant } from '@/lib/experiments'
import { runBanditForExperiment } from '@/lib/experiment-queries'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const ACTIONS = new Set(['start', 'pause', 'end', 'kill', 'approve_variant', 'run_bandit'])

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { key?: string; action?: string; variantKey?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const key = (body.key || '').trim()
  const action = body.action || ''
  if (!key || !ACTIONS.has(action)) return NextResponse.json({ error: 'key and a valid action are required' }, { status: 400 })

  const c = sb()
  const { data: row, error: loadErr } = await c.from('experiments').select('*').eq('key', key).maybeSingle()
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    const now = new Date().toISOString()
    if (action === 'start') {
      // A running experiment must not fight another over the same slot.
      const mySlots = new Set<string>()
      for (const v of (row.variants as ExperimentVariant[]) || []) {
        for (const s of Object.keys(v.overrides || {})) mySlots.add(s)
      }
      const { data: running } = await c.from('experiments').select('key, variants').eq('status', 'running').neq('key', key)
      for (const other of running || []) {
        for (const v of (other.variants as ExperimentVariant[]) || []) {
          for (const s of Object.keys(v.overrides || {})) {
            if (mySlots.has(s)) {
              return NextResponse.json({ error: `slot "${s}" is already claimed by running experiment "${other.key}"` }, { status: 400 })
            }
          }
        }
      }
      const update: Record<string, unknown> = { status: 'running', updated_at: now }
      if (!row.started_at) update.started_at = now
      await c.from('experiments').update(update).eq('key', key)
    } else if (action === 'pause') {
      await c.from('experiments').update({ status: 'paused', updated_at: now }).eq('key', key)
    } else if (action === 'end' || action === 'kill') {
      await c.from('experiments').update({ status: action === 'end' ? 'ended' : 'killed', ended_at: now, updated_at: now }).eq('key', key)
    } else if (action === 'approve_variant') {
      const vkey = (body.variantKey || '').trim()
      const variants = ((row.variants as ExperimentVariant[]) || []).map(v =>
        v.key === vkey ? { ...v, approved: true } : v,
      )
      if (!variants.some(v => v.key === vkey)) return NextResponse.json({ error: 'variant not found' }, { status: 404 })
      await c.from('experiments').update({ variants, updated_at: now }).eq('key', key)
    } else if (action === 'run_bandit') {
      if (row.status !== 'running') return NextResponse.json({ error: 'experiment is not running' }, { status: 400 })
      const result = await runBanditForExperiment(row, 'manual')
      revalidateTag(EXPERIMENTS_CACHE_TAG)
      return NextResponse.json({ ok: true, result })
    }
    revalidateTag(EXPERIMENTS_CACHE_TAG)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
