import { NextRequest, NextResponse } from 'next/server'
import { subscribeWithStage, addSubscriberTags } from '@/lib/beehiiv'
import { checkRateLimit } from '@/lib/validation'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/free-course
 *
 * The "Not yet" downsell capture. Subscribes/tags the email in Beehiiv with a
 * `free_course` tag so a Beehiiv automation can drip the 5-day email course
 * (the daily sends are wired in the Beehiiv UI, not here). Non-fatal on
 * Beehiiv errors — the page still confirms so the user isn't blocked.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again shortly.' }, { status: 429 })
  }

  let body: { email?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase()
  const name = (body.name || '').trim()
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const hasBeehiiv = !!process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_API_KEY !== 'your_beehiiv_api_key_here'
  if (hasBeehiiv) {
    const sub = await subscribeWithStage({
      email,
      name,
      stage: null,
      extraTags: ['free_course'],
      utm: { source: 'quiz', medium: 'free_course', campaign: 'free_course_downsell' },
    })
    if (sub.error === 'ALREADY_SUBSCRIBED') {
      // On the list already — just attach the free_course tag.
      const tagged = await addSubscriberTags({ email, tags: ['free_course'] })
      if (!tagged.success) console.error('[free-course] tag existing failed:', tagged.error)
    } else if (!sub.success) {
      console.error('[free-course] beehiiv subscribe failed:', sub.error)
    }
  }

  return NextResponse.json({ ok: true })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
