import { NextRequest, NextResponse } from 'next/server'
import { getPrefillData } from '@/lib/prefill'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')?.trim().toLowerCase() || ''
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }
  try {
    const data = await getPrefillData(email)
    // Strip raw 3rd-party payloads from the user-facing endpoint
    return NextResponse.json({
      email: data.email,
      blocked: data.blocked,
      fields: data.fields,
      hasHistory: data.history.found,
    })
  } catch (err) {
    console.error('prefill error:', err)
    return NextResponse.json({ fields: {}, hasHistory: false }, { status: 200 })
  }
}
