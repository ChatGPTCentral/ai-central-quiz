import { NextRequest, NextResponse } from 'next/server'
import { buildSessionCookie, setAdminCookie } from '@/lib/admin-auth'
import { timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// This login guards every customer's name, email, job title, LinkedIn and
// purchase history, plus the ability to rewrite live experiments. It was
// protected by a password anyone would guess on the first try.
//
// Two gaps were code-level, not config:
//
// 1. NO RATE LIMIT. Unlimited guesses at machine speed means password strength
//    is the only defence, and a weak one falls in milliseconds.
// 2. NOTHING STOPPED A WEAK SECRET. The app happily accepted 'admin' forever,
//    silently. A deploy that cannot be secured should fail loudly instead.
//
// Both are fixed below. The weak-secret check REFUSES to authenticate rather
// than warning, because a warning nobody reads is how it stayed 'admin'.

const MIN_LENGTH = 16
const OBVIOUS = new Set([
  'admin', 'password', 'admin123', 'password123', 'letmein', 'changeme',
  'secret', 'aicentral', 'test', '12345678', 'qwerty', 'administrator',
])

function weakness(pw: string): string | null {
  const p = pw.trim()
  if (OBVIOUS.has(p.toLowerCase())) return 'it is one of the most-guessed passwords in existence'
  if (p.length < MIN_LENGTH) return `it is ${p.length} characters; at least ${MIN_LENGTH} are required`
  if (/^[a-z]+$/.test(p) || /^[0-9]+$/.test(p)) return 'it is a single character class, which is trivially brute-forced'
  return null
}

// Per-IP throttle. In-memory per lambda, so it is best-effort across a fleet
// rather than a hard guarantee — but it turns "unlimited guesses per second"
// into "a handful per window", which is the difference that matters.
const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 6

function throttle(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const rec = attempts.get(ip)
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, retryAfter: 0 }
  }
  rec.count++
  if (rec.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((rec.resetAt - now) / 1000) }
  }
  return { allowed: true, retryAfter: 0 }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD not set' }, { status: 500 })
  }

  // Refuse to be guardable. Checked on every attempt rather than at boot so it
  // cannot be bypassed by a warm lambda started before the env was fixed.
  const weak = weakness(password)
  if (weak) {
    console.error('[admin-login] REFUSING to authenticate: ADMIN_PASSWORD is weak —', weak)
    return NextResponse.json(
      {
        error:
          'Admin login is disabled because ADMIN_PASSWORD is not strong enough: ' +
          weak +
          `. Set a passphrase of at least ${MIN_LENGTH} characters in Vercel → Settings → Environment Variables, redeploy, and try again.`,
      },
      { status: 503 },
    )
  }

  const gate = throttle(ip)
  if (!gate.allowed) {
    console.warn('[admin-login] throttled', ip)
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${Math.ceil(gate.retryAfter / 60)} minutes.` },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
    )
  }

  let body: { password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.password || !safeEqual(body.password, password)) {
    // Logged so a burst of these is visible in Vercel's runtime logs. The
    // attempted value is never logged.
    console.warn('[admin-login] failed attempt from', ip)
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  attempts.delete(ip)
  setAdminCookie(await buildSessionCookie())
  return NextResponse.json({ success: true })
}
