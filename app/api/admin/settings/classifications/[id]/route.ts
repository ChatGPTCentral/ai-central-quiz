import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { deleteOverride } from '@/lib/classification-overrides'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const cat = await deleteOverride(params.id)
    return NextResponse.json({ ok: true, category: cat })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
