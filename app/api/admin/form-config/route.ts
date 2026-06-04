import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import {
  getLatestDraft,
  getLivePublishedConfig,
  saveDraft,
  publishDraft,
  listVersions,
} from '@/lib/form-config'
import type { V2Question } from '@/lib/form-schema'

const ALLOWED_DB_COLUMNS = new Set([
  'name', 'email',
  'frequency_score', 'depth_score', 'breadth_score',
  'momentum', 'friction', 'intent_30d',
  'ai_tools', 'work_area', 'job_level',
])

function validateQuestions(qs: unknown): string | null {
  if (!Array.isArray(qs)) return 'questions must be an array'
  if (qs.length === 0) return 'questions cannot be empty'
  const ids = new Set<string>()
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i] as Partial<V2Question>
    if (!q || typeof q !== 'object') return `question[${i}] is not an object`
    if (!q.id || typeof q.id !== 'string') return `question[${i}].id is required`
    if (ids.has(q.id)) return `duplicate question id: ${q.id}`
    ids.add(q.id)
    if (!q.type || !['text', 'email', 'chips', 'multi-chips'].includes(q.type as string)) {
      return `question[${q.id}].type is invalid`
    }
    if (typeof q.label !== 'string' || !q.label.trim()) {
      return `question[${q.id}].label is required`
    }
    if ((q.type === 'chips' || q.type === 'multi-chips') && (!Array.isArray(q.options) || q.options.length < 2)) {
      return `question[${q.id}] needs at least 2 options`
    }
    if (q.dbColumn && !ALLOWED_DB_COLUMNS.has(q.dbColumn)) {
      return `question[${q.id}].dbColumn '${q.dbColumn}' is not in the allowed set`
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const slug = req.nextUrl.searchParams.get('slug') || 'quiz-v2'
  const includeVersions = req.nextUrl.searchParams.get('versions') === '1'
  try {
    const [live, draft, versions] = await Promise.all([
      getLivePublishedConfig(slug),
      getLatestDraft(slug),
      includeVersions ? listVersions(slug) : Promise.resolve([]),
    ])
    return NextResponse.json({ live, draft, versions: includeVersions ? versions : undefined })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Save a draft. Body: { slug, questions, theme? }
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { slug?: string; questions?: V2Question[]; theme?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const slug = body.slug || 'quiz-v2'
  const err = validateQuestions(body.questions)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  try {
    const cfg = await saveDraft(slug, body.questions!, (body.theme as Record<string, unknown> | null) ?? null, 'admin@editor')
    return NextResponse.json({ config: cfg })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// Publish a draft. Body: { slug, draftVersionId }
export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { slug?: string; draftVersionId?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const slug = body.slug || 'quiz-v2'
  if (!body.draftVersionId) return NextResponse.json({ error: 'draftVersionId is required' }, { status: 400 })
  try {
    const cfg = await publishDraft(slug, body.draftVersionId, 'admin@editor')
    return NextResponse.json({ config: cfg })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
