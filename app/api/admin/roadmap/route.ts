// Admin CRUD for the roadmap board (public.roadmap_tasks). Guarded by
// isAdmin(). Claude usually writes this table via SQL; this route serves the
// board UI (drag moves, quick add, edits, delete).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin-auth'
import { isRoadmapStatus, listRoadmapTasks, taskFromDb } from '@/lib/roadmap'

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PHASE_RE = /^[A-Z0-9_]{1,16}$/

interface TaskInput {
  id?: string
  title?: string
  description?: string | null
  phase?: string
  status?: string
  assignee?: string
  sort?: number
  notes?: string | null
}

/** Validated column patch from a request body; error string when invalid. */
function patchFrom(body: TaskInput, { requireTitle }: { requireTitle: boolean }): { patch?: Record<string, unknown>; error?: string } {
  const patch: Record<string, unknown> = {}

  if (body.title !== undefined || requireTitle) {
    const title = (body.title || '').trim().slice(0, 200)
    if (!title) return { error: 'title is required' }
    patch.title = title
  }
  if (body.description !== undefined) patch.description = body.description ? String(body.description).slice(0, 2000) : null
  if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes).slice(0, 1000) : null
  if (body.phase !== undefined) {
    const phase = String(body.phase).trim().toUpperCase()
    if (!PHASE_RE.test(phase)) return { error: 'phase must be 1-16 chars of A-Z, 0-9, _' }
    patch.phase = phase
  }
  if (body.status !== undefined) {
    if (!isRoadmapStatus(String(body.status))) return { error: 'invalid status' }
    patch.status = body.status
  }
  if (body.assignee !== undefined) {
    if (body.assignee !== 'claude' && body.assignee !== 'owner') return { error: 'assignee must be claude or owner' }
    patch.assignee = body.assignee
  }
  if (body.sort !== undefined) {
    const s = Number(body.sort)
    if (!Number.isFinite(s)) return { error: 'sort must be a number' }
    patch.sort = Math.round(s)
  }
  return { patch }
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ tasks: await listRoadmapTasks() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: TaskInput
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const { patch, error } = patchFrom(body, { requireTitle: true })
  if (error || !patch) return NextResponse.json({ error }, { status: 400 })
  try {
    const { data, error: dbErr } = await sb().from('roadmap_tasks').insert(patch).select('*').single()
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 })
    return NextResponse.json({ task: taskFromDb(data) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: TaskInput
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.id || !UUID_RE.test(body.id)) return NextResponse.json({ error: 'valid id required' }, { status: 400 })
  const { patch, error } = patchFrom(body, { requireTitle: false })
  if (error || !patch) return NextResponse.json({ error }, { status: 400 })
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  patch.updated_at = new Date().toISOString()
  try {
    const c = sb()
    // Moving into done stamps shipped_at once; moving back out clears it.
    if (patch.status === 'done') {
      const { data: cur } = await c.from('roadmap_tasks').select('shipped_at').eq('id', body.id).maybeSingle()
      if (cur && !cur.shipped_at) patch.shipped_at = new Date().toISOString()
    } else if (patch.status && patch.status !== 'done') {
      patch.shipped_at = null
    }
    const { data, error: dbErr } = await c.from('roadmap_tasks').update(patch).eq('id', body.id).select('*').maybeSingle()
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 })
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ task: taskFromDb(data) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'valid id required' }, { status: 400 })
  try {
    const { error: dbErr } = await sb().from('roadmap_tasks').delete().eq('id', id)
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
