import { NextResponse, type NextRequest } from 'next/server'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

// Anonymous visitor id (funnel attribution + experiment bucketing). httpOnly:
// client JS never needs it — the /api/events sink reads it from the Cookie
// header, and /result reads it server-side for variant assignment.
const ANON_COOKIE = 'ac_aid'
const ANON_MAX_AGE = 400 * 24 * 60 * 60 // Chrome's 400-day cookie cap

// Internal-traffic marker. The owner testing the page generates the same
// checkout_click and exposure events a real visitor does, and at ~40 clicks a
// day a handful of test taps can move an experiment arm by several points —
// enough to call a winner that isn't one. `?internal=1` on any page sets this,
// `?internal=0` clears it, and /api/events drops everything carrying it.
const INTERNAL_COOKIE = 'ac_internal'

/** A path made of nothing but punctuation, e.g. "/)**_**".
 *
 *  Clarity found 104 sessions in 14 days landing on quiz.thecentral.ai/)**_**
 *  and getting a 404. Somewhere a link went out as [text](url)**_** and the
 *  trailing markdown was swallowed into the href, so every one of those people
 *  clicked a link to us and got nothing. They were trying to reach the landing
 *  page, so send them there rather than to a dead end. Deliberately narrow: it
 *  only fires when there is not a single letter or digit in the path, so no
 *  real route can ever match it.
 */
const JUNK_PATH = /^\/[^A-Za-z0-9/]{1,16}\/?$/

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const internalParam = req.nextUrl.searchParams.get('internal')

  if (JUNK_PATH.test(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith('/admin')) {
    // Login route is public
    if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
      return NextResponse.next()
    }

    // Verify session cookie
    const cookie = req.cookies.get(ADMIN_COOKIE_NAME)?.value
    const ok = await verifySessionCookie(cookie)
    if (!ok) {
      const url = req.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }

    // Forward the resolved path so layouts/pages can hide chrome when needed
    const res = NextResponse.next()
    res.headers.set('x-pathname', pathname)
    return res
  }

  // Public pages: mint the anonymous id once. Forward it to THIS request's
  // render via a request header so a visitor whose first-ever hit is /result
  // still gets a deterministic experiment assignment on first paint.
  const hasAnon = !!req.cookies.get(ANON_COOKIE)?.value
  if (hasAnon && internalParam == null) return NextResponse.next()

  const headers = new Headers(req.headers)
  const aid = hasAnon ? null : crypto.randomUUID()
  if (aid) headers.set('x-anon-id', aid)
  const res = NextResponse.next({ request: { headers } })

  if (aid) {
    res.cookies.set(ANON_COOKIE, aid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ANON_MAX_AGE,
    })
  }

  // Sticky across the whole browser, not just the tab: testing means opening
  // links from Slack, from a phone, days apart, and a per-session flag would
  // silently stop protecting the numbers halfway through.
  if (internalParam === '1') {
    res.cookies.set(INTERNAL_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ANON_MAX_AGE,
    })
  } else if (internalParam === '0') {
    res.cookies.set(INTERNAL_COOKIE, '', { path: '/', maxAge: 0 })
  }

  return res
}

export const config = {
  // All pages (admin included), skipping API routes, Next internals, and
  // static files (anything with a dot). Cookie-minting in front of static
  // routes does not opt them out of caching.
  matcher: ['/((?!api/|_next/|.*\\..*).*)'],
}
