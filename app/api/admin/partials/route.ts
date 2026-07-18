// Admin: delete an in-progress capture (quiz_partials row) by id.
// Used by the ✗ button on /admin/in-progress to clear junk/test rows.

import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { deletePartialById } from '@/lib/partials'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'valid id required' }, { status: 400 })
  const ok = await deletePartialById(id)
  if (!ok) return NextResponse.json({ error: 'delete failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
