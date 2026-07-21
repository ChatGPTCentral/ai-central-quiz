import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/validation'
import { savePartial } from '@/lib/partials'
import { assessLead } from '@/lib/lead-quality'

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

  let body: { answers?: Record<string, unknown>; utmSource?: string; utmRef?: string; clientId?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }

  const answers = body.answers || {}
  const email = String(answers.email || '').trim().toLowerCase()
  const name = String(answers.name || '').trim()

  // Only capture once we genuinely have a reachable lead.
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: 'email_required' }, { status: 400 })
  }

  // Keep egregious fakes (disposable domains, synthetic local-parts,
  // placeholder names) out of the in-progress list. Non-blocking by design:
  // this is fire-and-forget from the client, so we 200 with skipped=true and
  // simply don't persist. Soft flags still get captured.
  if (assessLead({ name, email }).fake) {
    return NextResponse.json({ ok: true, skipped: 'low_quality' })
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const clientId = typeof body.clientId === 'string' && UUID_RE.test(body.clientId) ? body.clientId : null

  // Vercel URI-encodes the city header (e.g. S%C3%A3o%20Paulo).
  const geo = (h: string) => {
    const v = req.headers.get(h)
    if (!v) return null
    try { return decodeURIComponent(v) } catch { return v }
  }

  try {
    await savePartial({
      email,
      name: name || null,
      answers,
      utmSource: (body.utmSource || '').trim().slice(0, 120) || null,
      utmRef: (body.utmRef || '').trim().slice(0, 120) || null,
      ipCountry: req.headers.get('x-vercel-ip-country') || null,
      ipCity: geo('x-vercel-ip-city'),
      ipRegion: geo('x-vercel-ip-country-region'),
      clientId,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[partials] save threw:', e)
    return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 })
  }
}
