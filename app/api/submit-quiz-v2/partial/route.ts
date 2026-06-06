import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/validation'
import { savePartial } from '@/lib/partials'

// Captures an in-progress quiz once the user has a name + valid email but
// hasn't finished. Fire-and-forget from the client. NEVER runs enrichment,
// Beehiiv, or the admin email — those are reserved for completed submissions.
export const dynamic = 'force-dynamic'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  let body: { answers?: Record<string, unknown>; utmSource?: string; utmRef?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }

  const answers = body.answers || {}
  const email = String(answers.email || '').trim().toLowerCase()
  const name = String(answers.name || '').trim()

  // Only capture once we genuinely have a reachable lead.
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: 'email_required' }, { status: 400 })
  }

  try {
    await savePartial({
      email,
      name: name || null,
      answers,
      utmSource: (body.utmSource || '').trim().slice(0, 120) || null,
      utmRef: (body.utmRef || '').trim().slice(0, 120) || null,
      ipCountry: req.headers.get('x-vercel-ip-country') || null,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[partials] save threw:', e)
    return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 })
  }
}
