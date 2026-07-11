// Pass personalization sink (result v2): stores an uploaded face photo in
// the public `pass-photos` bucket and writes it to the person's own
// submission row (the unguessable row uuid doubles as authorization).
// linkedin_url is fill-only — self-reported, but never clobbers an
// enrichment-verified link. Public endpoint, rate-limited, size-capped.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/validation'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// ~1.5MB decoded (512px JPEG from the client is ~60-120KB; headroom only)
const MAX_B64_LEN = 2_000_000

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let body: { submissionId?: string; imageBase64?: string; linkedinUrl?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const id = body.submissionId
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'Bad submission id' }, { status: 400 })

  const linkedinUrl = typeof body.linkedinUrl === 'string' ? body.linkedinUrl.trim().slice(0, 300) : ''
  const validLinkedin = /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(linkedinUrl) ? linkedinUrl : ''

  try {
    const c = sb()

    // The row must exist — this also makes the uuid an effective auth token.
    const { data: row } = await c.from('submissions').select('id, linkedin_url').eq('id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updates: Record<string, string> = {}

    if (typeof body.imageBase64 === 'string' && body.imageBase64.length <= MAX_B64_LEN) {
      const m = body.imageBase64.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/)
      if (m) {
        const buf = Buffer.from(m[2], 'base64')
        const path = `${id}.jpg`
        const { error: upErr } = await c.storage.from('pass-photos').upload(path, buf, {
          contentType: `image/${m[1] === 'png' ? 'png' : m[1]}`,
          upsert: true,
        })
        if (upErr) {
          console.error('[pass-photo] upload failed:', upErr.message)
        } else {
          const { data: pub } = c.storage.from('pass-photos').getPublicUrl(path)
          // Their own upload wins over any enrichment guess — cache-bust so
          // re-uploads reflect immediately despite CDN caching.
          if (pub?.publicUrl) updates.photo_url = `${pub.publicUrl}?v=${Date.now()}`
        }
      }
    }

    if (validLinkedin && (!row.linkedin_url || row.linkedin_url === '')) {
      updates.linkedin_url = validLinkedin
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await c.from('submissions').update(updates).eq('id', id)
      if (error) console.error('[pass-photo] row update failed:', error.message)
    }

    return NextResponse.json({ ok: true, photoUrl: updates.photo_url ?? null })
  } catch (err) {
    console.error('[pass-photo] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
