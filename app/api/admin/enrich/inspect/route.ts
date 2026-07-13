// Visual pipeline inspector: run BOTH the current pipeline and the new
// verified-resolver pipeline on a single record and return every stage with
// the input it consumed and the result it produced — so the owner can audit,
// side by side, exactly where the two flows diverge.
//
// One record per submit; runs two full pipelines fresh (a few API credits),
// admin-gated. Optionally hydrates defaults from a submission id.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { runV2, type V2Result } from '@/lib/enrichment/pipeline-v2'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

interface Body {
  submissionId?: string
  name?: string; email?: string; country?: string
  jobTitle?: string; companyName?: string; linkedinUrl?: string
  jobLevel?: string; workArea?: string
  skipWiza?: boolean
}

/** Trim a V2Result to the fields the inspector renders (drop bulky raw). */
function view(r: V2Result) {
  return {
    stages: r.stages,
    merged: r.merged,
    status: r.status,
    resolver: r.resolver,
    providersTried: r.providersTried,
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const c = sb()
  let base: Body = {}
  if (body.submissionId) {
    const { data } = await c.from('submissions')
      .select('name, email, country, job_title, company_name, linkedin_url, job_level, work_area')
      .eq('id', body.submissionId).maybeSingle()
    if (data) base = { name: data.name || undefined, email: data.email || undefined, country: data.country || undefined, jobTitle: data.job_title || undefined, companyName: data.company_name || undefined, linkedinUrl: data.linkedin_url || undefined, jobLevel: data.job_level || undefined, workArea: data.work_area || undefined }
  }
  // Explicit body fields override the hydrated defaults (empty string clears).
  const pick = (k: 'name' | 'email' | 'country' | 'jobTitle' | 'companyName' | 'linkedinUrl' | 'jobLevel' | 'workArea'): string | undefined => {
    const v = body[k] !== undefined ? body[k] : base[k]
    return typeof v === 'string' && v.trim() ? v.trim() : undefined
  }
  const input = {
    email: (pick('email') || '').toLowerCase(),
    name: pick('name'),
    country: pick('country'),
    jobTitle: pick('jobTitle'),
    companyName: pick('companyName'),
    linkedinUrl: pick('linkedinUrl'),
    jobLevel: pick('jobLevel'),
    workArea: pick('workArea'),
  }
  if (!input.email) return NextResponse.json({ error: 'email is required (type one or pick a record)' }, { status: 400 })

  const skipWiza = body.skipWiza !== false
  try {
    // Run sequentially to keep the two flows' logging clean; both fresh (no cache).
    const current = await runV2(input, { verifiedResolver: false, useCache: false, skipWiza })
    const proposed = await runV2(input, { verifiedResolver: true, useCache: false, skipWiza })
    return NextResponse.json({ input, current: view(current), proposed: view(proposed) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
