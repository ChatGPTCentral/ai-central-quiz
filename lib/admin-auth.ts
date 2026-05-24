// Edge-runtime-safe HMAC session cookie helpers.
// Uses Web Crypto (crypto.subtle) so the same module works in middleware
// (Edge runtime) AND in Node server components.

import { cookies } from 'next/headers'

const COOKIE_NAME = 'ac_admin'
const SESSION_DAYS = 7

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET
  if (!s) throw new Error('ADMIN_SESSION_SECRET is not set')
  return s
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function signPayload(payload: string): Promise<string> {
  const key = await importKey()
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return toHex(sig)
}

// Constant-time hex comparison (no Buffer dependency)
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function buildSessionCookie(): Promise<string> {
  const payload = String(Date.now())
  const sig = await signPayload(payload)
  return `${payload}.${sig}`
}

export async function verifySessionCookie(value?: string): Promise<boolean> {
  if (!value) return false
  const [payload, sig] = value.split('.')
  if (!payload || !sig) return false
  const ts = parseInt(payload, 10)
  if (!ts || Date.now() - ts > SESSION_DAYS * 24 * 60 * 60 * 1000) return false
  try {
    const expected = await signPayload(payload)
    return constantTimeEqual(expected, sig)
  } catch {
    return false
  }
}

// Synchronous wrappers for use in (non-Edge) server components and route handlers.
// These are convenience helpers; middleware uses the async versions directly.
export async function isAdmin(): Promise<boolean> {
  try {
    const c = cookies().get(COOKIE_NAME)?.value
    return verifySessionCookie(c)
  } catch {
    return false
  }
}

export function setAdminCookie(value: string) {
  cookies().set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export function clearAdminCookie() {
  cookies().delete(COOKIE_NAME)
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME
