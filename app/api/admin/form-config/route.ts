import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import {
  getLatestDraft,
  getLivePublishedConfig,
  saveDraft,
  publishDraft,
  listVersions,
} from '@/lib/form-config'
import type { V2Question, EndScreen } from '@/lib/form-schema'

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
    if (!q.type || !['welcome', 'text', 'email', 'chips', 'multi-chips'].includes(q.type as string)) {
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
  // Second pass — branching targets must exist and only point forward.
  const idIndex = new Map(((qs as V2Question[]).map((q, i) => [q.id, i] as const)))
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i] as V2Question
    if (!q.branching) continue
    for (let r = 0; r < q.branching.length; r++) {
      const rule = q.branching[r]
      if (rule.goto !== 'end') {
        const targetIdx = idIndex.get(rule.goto)
        if (targetIdx === undefined) return `question[${q.id}] rule ${r}: goto '${rule.goto}' not found`
        if (targetIdx <= i) return `question[${q.id}] rule ${r}: cannot jump backward to '${rule.goto}'`
      }
      for (let c = 0; c < rule.when.length; c++) {
        const cond = rule.when[c]
        const refIdx = idIndex.get(cond.questionId)
        if (refIdx === undefined) return `question[${q.id}] rule ${r} cond ${c}: refers to unknown question '${cond.questionId}'`
        if (refIdx >= i) return `question[${q.id}] rule ${r} cond ${c}: must reference an upstream question`
      }
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

// Save a draft. Body: { slug, questions, theme?, endScreens? }
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { slug?: string; questions?: V2Question[]; theme?: unknown; endScreens?: EndScreen[] }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const slug = body.slug || 'quiz-v2'
  const err = validateQuestions(body.questions)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  try {
    const cfg = await saveDraft(
      slug,
      body.questions!,
      (body.theme as Record<string, unknown> | null) ?? null,
      Array.isArray(body.endScreens) ? body.endScreens : [],
      'admin@editor',
    )
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
