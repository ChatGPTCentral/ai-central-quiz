import { NextRequest, NextResponse } from 'next/server'
import { subscribeWithStage, addSubscriberTags, enrollInAutomation } from '@/lib/beehiiv'
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

  let body: { email?: string; name?: string; source?: string }
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

  // 'exit_rescue' = captured by the exit-intent modal on /result; anything
  // else is the standard "not yet" downsell. Distinct tag + campaign so the
  // two capture points can be compared in Beehiiv.
  const isExitRescue = body.source === 'exit_rescue'
  // 'ads_rescue' = the paid-traffic popup, which fires only after someone has
  // read the whole page AND moved to leave. Own tag so paid-lead rescue can be
  // measured separately from the organic downsell we already had.
  const isAdsRescue = body.source === 'ads_rescue'
  const tags = isAdsRescue
    ? ['free_course', 'ads_rescue', 'ai101']
    : isExitRescue ? ['free_course', 'exit_rescue'] : ['free_course']
  const campaign = isAdsRescue ? 'ads_rescue' : isExitRescue ? 'exit_rescue' : 'free_course_downsell'

  const hasBeehiiv = !!process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_API_KEY !== 'your_beehiiv_api_key_here'
  if (hasBeehiiv) {
    const sub = await subscribeWithStage({
      email,
      name,
      stage: null,
      extraTags: tags,
      utm: { source: 'quiz', medium: 'free_course', campaign },
    })
    if (sub.error === 'ALREADY_SUBSCRIBED') {
      // On the list already — just attach the tags.
      const tagged = await addSubscriberTags({ email, tags })
      if (!tagged.success) console.error('[free-course] tag existing failed:', tagged.error)
    } else if (!sub.success) {
      console.error('[free-course] beehiiv subscribe failed:', sub.error)
    }

    // Paid-traffic rescue starts the AI 101 journey immediately rather than
    // waiting for a tag-triggered workflow: this person asked for the course
    // while leaving, so the first email needs to exist before they forget why
    // they gave us the address. Runs after the subscribe above, because an
    // automation keyed to an address that is not on the list has nothing to
    // enrol. Non-fatal — the lead is already captured either way.
    if (isAdsRescue) {
      const autId = process.env.BEEHIIV_AI101_AUTOMATION_ID || 'aut_c2d8112a-3d7d-4740-9bd1-db2eaa4bda64'
      const j = await enrollInAutomation({ email, automationId: autId })
      if (!j.success) console.error('[free-course] ai101 automation enrol failed:', j.error)
    }
  }

  return NextResponse.json({ ok: true })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
