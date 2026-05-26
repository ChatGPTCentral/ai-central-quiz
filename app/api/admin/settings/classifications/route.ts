import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { listOverrides, upsertOverride, type Category } from '@/lib/classification-overrides'

const VALID: Category[] = ['seniority', 'title', 'country']

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const category = req.nextUrl.searchParams.get('category') as Category | null
  if (!category || !VALID.includes(category)) {
    return NextResponse.json({ error: `category must be one of ${VALID.join(', ')}` }, { status: 400 })
  }
  try {
    const items = await listOverrides(category)
    return NextResponse.json({ items })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { category?: Category; raw_value?: string; mapped_to?: string; notes?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  if (!body.category || !VALID.includes(body.category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  if (!body.raw_value?.trim()) return NextResponse.json({ error: 'raw_value required' }, { status: 400 })
  if (!body.mapped_to?.trim()) return NextResponse.json({ error: 'mapped_to required' }, { status: 400 })

  try {
    const item = await upsertOverride(body.category, body.raw_value, body.mapped_to, body.notes)
    return NextResponse.json({ item })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
