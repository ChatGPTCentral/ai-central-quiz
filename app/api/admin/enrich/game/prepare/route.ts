// Prepare rounds for the enrichment labeling game: take the last N quiz
// submissions, keep the CURRENT (already-stored) enrichment as-is, and run the
// NEW verified pipeline fresh, storing both (with photos) as an unlabeled
// round. Owner-initiated batches gate the API spend (new pipeline only; the
// current side is free).

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

interface Row {
  id: string; name: string | null; email: string | null; country: string | null
  linkedin_url: string | null; company_name: string | null; job_title: string | null
  photo_url: string | null; job_level: string | null; work_area: string | null; seniority: string | null
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { limit?: number; target?: number; rerun?: boolean }
  try { body = await req.json() } catch { body = {} }
  const limit = Math.min(8, Math.max(1, Number(body.limit) || 5))
  const target = Math.min(60, Math.max(1, Number(body.target) || 40))
  const c = sb()

  // ── Re-run mode: re-run the (now tuned) resolver on already-labeled rounds
  // into `reran`, preserving the original proposed + the owner's verdict, so
  // we can measure the lift against their labels without re-labeling. ──
  if (body.rerun) {
    try {
      const { data: rows } = await c.from('enrich_game')
        .select('id, known').not('labeled_at', 'is', null).is('reran', null).limit(limit)
      const todo = (rows || []) as { id: string; known: Record<string, string | null> }[]
      const { count: remaining } = await c.from('enrich_game').select('*', { count: 'exact', head: true }).not('labeled_at', 'is', null).is('reran', null)
      if (todo.length === 0) return NextResponse.json({ reran: true, finished: true, remaining: 0 })
      await Promise.all(todo.map(async (row) => {
        const k = row.known || {}
        let reran: Record<string, unknown>
        try {
          const v2 = await runV2({ email: (k.email || '') as string, name: k.name || undefined, country: k.country || undefined, jobLevel: k.jobLevel || undefined, workArea: k.workArea || undefined }, { verifiedResolver: true, useCache: false })
          reran = {
            linkedinUrl: v2.merged.linkedinUrl || v2.resolver?.linkedinUrl || null,
            companyName: v2.merged.companyName || v2.resolver?.companyName || null,
            jobTitle: v2.merged.jobTitle || v2.resolver?.jobTitle || null,
            confidence: v2.resolver?.confidence ?? null,
            reasoning: v2.resolver?.reasoning || null,
            outcome: v2.resolver?.outcome || null,
          }
        } catch (err) { reran = { outcome: 'error', reasoning: String(err).slice(0, 160) } }
        await c.from('enrich_game').update({ reran }).eq('id', row.id)
      }))
      return NextResponse.json({ reran: true, processed: todo.length, remaining: Math.max(0, (remaining || 0) - todo.length), finished: (remaining || 0) - todo.length <= 0 })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  try {
    // Add the NEXT batch of unplayed records (from most recent, going back),
    // so the game replays in rounds. No total cap: the client loops until it
    // has added a round's worth or the pool is dry.
    const { data: existing } = await c.from('enrich_game').select('submission_id')
    const doneIds = new Set((existing || []).map(r => r.submission_id))
    const have = doneIds.size

    // Whole launch cohort (since Jun 5), most-recent first, so the game can
    // cover every lead — not just the last few.
    const { count: available } = await c.from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'quiz_v2').is('archived_at', null).not('email', 'is', null)
      .gte('created_at', '2026-07-05T00:00:00Z')
    const { data: pool } = await c.from('submissions')
      .select('id, name, email, country, linkedin_url, company_name, job_title, photo_url, job_level, work_area, seniority')
      .eq('source', 'quiz_v2').is('archived_at', null).not('email', 'is', null)
      .gte('created_at', '2026-07-05T00:00:00Z')
      .order('created_at', { ascending: false }).limit(2000)
    const fresh = ((pool || []) as Row[]).filter(r => !doneIds.has(r.id))
    const candidates = fresh.slice(0, limit)
    if (candidates.length === 0) return NextResponse.json({ added: 0, total: have, available: available || have, finished: true, hasMore: false, note: 'no more unplayed records' })

    const rounds = await Promise.all(candidates.map(async (r) => {
      const known = { name: r.name, email: r.email, country: r.country, jobLevel: r.job_level, workArea: r.work_area }
      const current = { linkedinUrl: r.linkedin_url, companyName: r.company_name, jobTitle: r.job_title, country: r.country, seniority: r.seniority, photoUrl: r.photo_url }
      try {
        const v2 = await runV2({ email: r.email!, name: r.name || undefined, country: r.country || undefined, jobLevel: r.job_level || undefined, workArea: r.work_area || undefined }, { verifiedResolver: true, useCache: false })
        const proposed = {
          linkedinUrl: v2.merged.linkedinUrl || v2.resolver?.linkedinUrl || null,
          companyName: v2.merged.companyName || v2.resolver?.companyName || null,
          jobTitle: v2.merged.jobTitle || v2.resolver?.jobTitle || null,
          country: normalizeCountry(v2.merged.country || v2.resolver?.country || '') || null,
          seniority: v2.standardized?.seniority || v2.merged.seniority || null,
          photoUrl: v2.merged.photoUrl || null,
          confidence: v2.resolver?.confidence ?? null,
          reasoning: v2.resolver?.reasoning || null,
          outcome: v2.resolver?.outcome || null,
        }
        return { submission_id: r.id, known, current, proposed }
      } catch (err) {
        return { submission_id: r.id, known, current, proposed: { outcome: 'error', reasoning: String(err).slice(0, 200) } }
      }
    }))

    const { error } = await c.from('enrich_game').upsert(rounds, { onConflict: 'submission_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ added: rounds.length, total: have + rounds.length, hasMore: fresh.length > candidates.length, finished: false })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
