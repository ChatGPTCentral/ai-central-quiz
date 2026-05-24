import { NextResponse, type NextRequest } from 'next/server'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Pass through anything not under /admin
  if (!pathname.startsWith('/admin')) return NextResponse.next()

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

export const config = {
  matcher: ['/admin/:path*'],
}
