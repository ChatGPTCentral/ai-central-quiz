// Admin CRUD for experiments. Guarded by isAdmin(); every mutation
// revalidates the 'experiments' cache tag so changes (including kills)
// reach the funnel in ≤30s without a deploy.

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { isSlotKey } from '@/lib/experiment-slots'
import { EXPERIMENTS_CACHE_TAG } from '@/lib/experiments'
import { listExperiments, experimentResults } from '@/lib/experiment-queries'

export const dynamic = 'force-dynamic'

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const KEY_RE = /^[a-z0-9_]{3,64}$/
const VKEY_RE = /^[a-z0-9_]{1,32}$/

interface VariantInput {
  key?: string
  name?: string
  weight?: number
  approved?: boolean
  overrides?: Record<string, unknown>
}
interface ExperimentInput {
  key?: string
  name?: string
  hypothesis?: string
  targeting?: { stages?: unknown; personas?: unknown; utmSources?: unknown }
  variants?: VariantInput[]
  primaryMetric?: string
  banditEnabled?: boolean
  minExposuresPerVariant?: number
}

function strArray(v: unknown, maxLen = 64, maxItems = 20): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim().slice(0, maxLen)).slice(0, maxItems)
}

/** Validate + normalize; returns the DB row payload or an error string. */
function validate(input: ExperimentInput): { row?: Record<string, unknown>; error?: string } {
  const key = (input.key || '').trim()
  if (!KEY_RE.test(key)) return { error: 'key must be 3-64 chars of a-z, 0-9, _' }
  const name = (input.name || '').trim().slice(0, 120)
  if (!name) return { error: 'name is required' }

  const variantsIn = Array.isArray(input.variants) ? input.variants : []
  if (variantsIn.length < 1 || variantsIn.length > 8) return { error: 'between 1 and 8 variants' }
  const seen = new Set<string>()
  const variants = []
  for (const v of variantsIn) {
    const vkey = (v.key || '').trim()
    if (!VKEY_RE.test(vkey)) return { error: `variant key "${vkey}" invalid (a-z, 0-9, _)` }
    if (seen.has(vkey)) return { error: `duplicate variant key "${vkey}"` }
    seen.add(vkey)
    const overrides: Record<string, string> = {}
    if (v.overrides && typeof v.overrides === 'object') {
      for (const [k, val] of Object.entries(v.overrides)) {
        if (!isSlotKey(k)) return { error: `"${k}" is not an allowed override slot` }
        if (typeof val !== 'string' || val.length > 500) return { error: `override ${k} must be a string ≤500 chars` }
        if (val.trim()) overrides[k] = val
      }
    }
    variants.push({
      key: vkey,
      name: (v.name || vkey).trim().slice(0, 80),
      weight: typeof v.weight === 'number' && v.weight >= 0 && Number.isFinite(v.weight) ? v.weight : 0,
      approved: v.approved !== false,
      overrides,
    })
  }
  const control = variants.find(v => v.key === 'control')
  if (!control) return { error: 'a "control" variant is required' }
  if (Object.keys(control.overrides).length > 0) return { error: 'control must have no overrides' }
  const total = variants.reduce((a, v) => a + (v.approved ? v.weight : 0), 0)
  if (total <= 0) return { error: 'approved variant weights must sum to > 0' }
  // normalize weights to sum 1 (2dp)
  for (const v of variants) v.weight = v.approved ? Math.round((v.weight / total) * 100) / 100 : 0

  return {
    row: {
      key,
      name,
      hypothesis: (input.hypothesis || '').trim().slice(0, 500) || null,
      targeting: {
        stages: strArray(input.targeting?.stages),
        personas: strArray(input.targeting?.personas),
        utmSources: strArray(input.targeting?.utmSources, 120),
      },
      variants,
      primary_metric: input.primaryMetric === 'net_new_paid' ? 'net_new_paid' : 'checkout_click',
      bandit_enabled: input.banditEnabled === true,
      min_exposures_per_variant: Math.min(10_000, Math.max(10, Number(input.minExposuresPerVariant) || 200)),
      updated_at: new Date().toISOString(),
    },
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const rows = await listExperiments()
    const withResults = req.nextUrl.searchParams.get('results') === '1'
    if (!withResults) return NextResponse.json({ experiments: rows })
    const results: Record<string, unknown> = {}
    for (const r of rows) {
      if (r.status === 'draft') continue
      try { results[r.key] = await experimentResults(r) } catch { /* per-exp best effort */ }
    }
    return NextResponse.json({ experiments: rows, results })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: ExperimentInput
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { row, error } = validate(body)
  if (error || !row) return NextResponse.json({ error }, { status: 400 })
  try {
    const { error: dbErr } = await sb().from('experiments').insert({ ...row, status: 'draft' })
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 })
    revalidateTag(EXPERIMENTS_CACHE_TAG)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: ExperimentInput
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { row, error } = validate(body)
  if (error || !row) return NextResponse.json({ error }, { status: 400 })
  try {
    const key = row.key as string
    delete (row as Record<string, unknown>).key // key is the immutable identifier
    const { error: dbErr, data } = await sb().from('experiments').update(row).eq('key', key).select('key')
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 })
    if (!data || data.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    revalidateTag(EXPERIMENTS_CACHE_TAG)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
