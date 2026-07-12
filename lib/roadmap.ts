// Roadmap board — the project's source of truth, rendered at /admin/roadmap.
// Claude maintains it like a programmer's board: cards move when work
// actually starts/ships, done cards carry the commit. The owner can drag
// cards and quick-add ideas; everything lives in public.roadmap_tasks.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const ROADMAP_STATUSES = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'next', label: 'Next up' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting_owner', label: 'Waiting on owner' },
  { key: 'done', label: 'Done' },
  { key: 'parked', label: 'Parked' },
] as const

export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number]['key']

export function isRoadmapStatus(s: string): s is RoadmapStatus {
  return ROADMAP_STATUSES.some(x => x.key === s)
}

// Phase chips. Unknown phases render grey with the raw code, so new phases
// can be introduced from SQL without a deploy.
export const ROADMAP_PHASES: Record<string, { label: string; color: string }> = {
  A: { label: 'A · Loops', color: '#0F8A6D' },
  B: { label: 'B · Owned loop', color: '#8E5BD1' },
  C: { label: 'C · Conversion', color: '#E48715' },
  D: { label: 'D · Paid loop', color: '#0A66C2' },
  OPS: { label: 'Ops', color: '#64748B' },
  FUTURE: { label: 'Future', color: '#A16207' },
}

export interface RoadmapLink {
  label: string
  url: string
}

export interface RoadmapTask {
  id: string
  title: string
  description: string | null
  phase: string
  status: RoadmapStatus
  assignee: 'claude' | 'owner'
  sort: number
  links: RoadmapLink[]
  notes: string | null
  shippedAt: string | null
  createdAt: string
  updatedAt: string
}

interface DbTask {
  id: string
  title: string
  description: string | null
  phase: string
  status: string
  assignee: string
  sort: number
  links: unknown
  notes: string | null
  shipped_at: string | null
  created_at: string
  updated_at: string
}

function parseLinks(v: unknown): RoadmapLink[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is { label?: unknown; url?: unknown } => !!x && typeof x === 'object')
    .filter(x => typeof x.url === 'string' && x.url)
    .map(x => ({ label: typeof x.label === 'string' && x.label ? x.label : String(x.url), url: String(x.url) }))
}

export function taskFromDb(r: DbTask): RoadmapTask {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    phase: r.phase,
    status: isRoadmapStatus(r.status) ? r.status : 'backlog',
    assignee: r.assignee === 'owner' ? 'owner' : 'claude',
    sort: r.sort,
    links: parseLinks(r.links),
    notes: r.notes,
    shippedAt: r.shipped_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// Lazy service-role client (same pattern as lib/kv.ts).
let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _client
}

export async function listRoadmapTasks(): Promise<RoadmapTask[]> {
  const { data, error } = await client()
    .from('roadmap_tasks')
    .select('*')
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data as DbTask[]) || []).map(taskFromDb)
}
