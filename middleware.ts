import { NextResponse, type NextRequest } from 'next/server'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

// Anonymous visitor id (funnel attribution + experiment bucketing). httpOnly:
// client JS never needs it — the /api/events sink reads it from the Cookie
// header, and /result reads it server-side for variant assignment.
const ANON_COOKIE = 'ac_aid'
const ANON_MAX_AGE = 400 * 24 * 60 * 60 // Chrome's 400-day cookie cap

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

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
  if (req.cookies.get(ANON_COOKIE)?.value) return NextResponse.next()

  const aid = crypto.randomUUID()
  const headers = new Headers(req.headers)
  headers.set('x-anon-id', aid)
  const res = NextResponse.next({ request: { headers } })
  res.cookies.set(ANON_COOKIE, aid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ANON_MAX_AGE,
  })
  return res
}

export const config = {
  // All pages (admin included), skipping API routes, Next internals, and
  // static files (anything with a dot). Cookie-minting in front of static
  // routes does not opt them out of caching.
  matcher: ['/((?!api/|_next/|.*\\..*).*)'],
}
