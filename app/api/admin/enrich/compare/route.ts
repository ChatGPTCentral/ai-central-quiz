// Shadow enrichment comparison: for a sample of records, show what's stored
// today vs what the NEW verified Google-first resolver produces, side by side
// for owner review. Runs the new pipeline FRESH (real API spend), so it's
// admin-gated and processed in small owner-initiated batches. The "current"
// side is the already-stored enrichment (free).
//
// Contract (POST): { runId?, limit=5, onlyGmail=true, target=30 }
//   - picks up to `limit` sampled records not yet in this runId
//   - runs runV2({ verifiedResolver:true, useCache:false, skipWiza:true })
//   - writes each to enrich_compare, returns { runId, done, target }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { runV2 } from '@/lib/enrichment/pipeline-v2'
import { normalizeCountry } from '@/lib/normalize'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

const FREE_EMAIL = ['gmail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com', 'outlook.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com', 'live.com', 'me.com', 'gmx.com']

interface Row {
  id: string; name: string | null; email: string | null
  linkedin_url: string | null; company_name: string | null; job_title: string | null
  country: string | null; seniority: string | null; job_title_standardized: string | null
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { runId?: string; limit?: number; onlyGmail?: boolean; target?: number }
  try { body = await req.json() } catch { body = {} }

  const runId = body.runId || crypto.randomUUID()
  const limit = Math.min(8, Math.max(1, Number(body.limit) || 5))
  const target = Math.min(60, Math.max(1, Number(body.target) || 30))
  const onlyGmail = body.onlyGmail !== false
  const c = sb()

  try {
    // Which submissions are already in this run?
    const { data: doneRows } = await c.from('enrich_compare').select('submission_id').eq('run_id', runId)
    const doneIds = new Set((doneRows || []).map(r => r.submission_id))
    const remaining = target - doneIds.size
    if (remaining <= 0) return NextResponse.json({ runId, done: doneIds.size, target, finished: true })

    // Sample recent quiz records (free-email first, since that's the problem set).
    let q = c.from('submissions')
      .select('id, name, email, linkedin_url, company_name, job_title, country, seniority, job_title_standardized')
      .eq('source', 'quiz_v2').is('archived_at', null)
      .not('email', 'is', null)
      .order('staged_at', { ascending: false })
      .limit(200)
    const { data: pool } = await q
    let candidates = (pool || []) as Row[]
    if (onlyGmail) {
      candidates = candidates.filter(r => FREE_EMAIL.includes((r.email || '').split('@')[1]?.toLowerCase() || ''))
    }
    candidates = candidates.filter(r => !doneIds.has(r.id)).slice(0, Math.min(limit, remaining))

    if (candidates.length === 0) return NextResponse.json({ runId, done: doneIds.size, target, finished: true, note: 'no more candidates in pool' })

    const results = await Promise.all(candidates.map(async (r) => {
      const current = {
        linkedinUrl: r.linkedin_url || null,
        companyName: r.company_name || null,
        jobTitle: r.job_title || null,
        country: r.country || null,
        seniority: r.seniority || null,
      }
      try {
        const v2 = await runV2(
          { email: r.email!, name: r.name || undefined, country: r.country || undefined },
          { verifiedResolver: true, useCache: false, skipWiza: true },
        )
        const proposed = {
          linkedinUrl: v2.merged.linkedinUrl || v2.resolver?.linkedinUrl || null,
          companyName: v2.merged.companyName || v2.resolver?.companyName || null,
          jobTitle: v2.merged.jobTitle || v2.resolver?.jobTitle || null,
          country: normalizeCountry(v2.merged.country || v2.resolver?.country || '') || null,
          seniority: v2.standardized?.seniority || v2.merged.seniority || null,
          confidence: v2.resolver?.confidence ?? null,
          reasoning: v2.resolver?.reasoning || null,
          outcome: v2.resolver?.outcome || null,
          triedQueries: v2.resolver?.triedQueries || [],
          status: v2.status,
        }
        return { run_id: runId, submission_id: r.id, name: r.name, email: r.email, current, proposed }
      } catch (err) {
        return { run_id: runId, submission_id: r.id, name: r.name, email: r.email, current, proposed: { outcome: 'error', reasoning: String(err).slice(0, 200) } }
      }
    }))

    const { error } = await c.from('enrich_compare').insert(results)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ runId, done: doneIds.size + results.length, target, finished: doneIds.size + results.length >= target })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// GET ?runId=…  → the accumulated rows for the review table.
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const runId = req.nextUrl.searchParams.get('runId')
  const c = sb()
  if (runId) {
    const { data } = await c.from('enrich_compare').select('*').eq('run_id', runId).order('created_at')
    return NextResponse.json({ rows: data || [] })
  }
  // No runId → the most recent run's id, so the page can resume/show it.
  const { data } = await c.from('enrich_compare').select('run_id, created_at').order('created_at', { ascending: false }).limit(1)
  return NextResponse.json({ latestRunId: data?.[0]?.run_id || null })
}
