import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { listSubmissions } from '@/lib/kv'

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0', 10) || 0
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50', 10) || 50, 200)

  const { items, total } = await listSubmissions({ offset, limit })
  return NextResponse.json({ items, total, offset, limit })
}
