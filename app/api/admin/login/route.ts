import { NextRequest, NextResponse } from 'next/server'
import { buildSessionCookie, setAdminCookie } from '@/lib/admin-auth'
import { timingSafeEqual } from 'crypto'

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export async function POST(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD not set' }, { status: 500 })
  }
  let body: { password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.password || !safeEqual(body.password, password)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }
  setAdminCookie(await buildSessionCookie())
  return NextResponse.json({ success: true })
}
