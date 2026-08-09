// Live sync of the owner's trials spreadsheet.
//
// WHY A PUBLISHED CSV AND NOT THE SHEETS API. The Sheets API needs a service
// account key in the deployment, which is a credential to create, store and
// rotate for one read-only pull. "File → Share → Publish to web → CSV" gives a
// stable URL that needs no credential at all, and the sheet holds no secrets:
// it is customer emails and payment statuses we already hold in our own
// database. If that ever stops being true, this should move to a service
// account rather than stay convenient.
//
// The sheet is the SOURCE OF TRUTH for trials sold, per the working agreement,
// and it disagrees with us in a way that matters: it reports 694 trials and 48%
// converting to yearly, against the 37% our Stripe-derived rate reports across
// a mixed multi-year base. The owner reconciles it against invoices, so it wins.
//
// Runs from the cron or from an admin browser, same as the other syncs.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SHEET_CSV_KEY = 'trials_sheet_csv_url'

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

/**
 * CSV parser that survives real spreadsheet data.
 *
 * Quoted fields containing commas are the norm here: job titles, company names
 * and city fields all contain them. A naive split(',') would silently shift
 * every column to the right of the first comma, which is the kind of bug that
 * produces plausible-looking wrong numbers rather than an error.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** Header lookup that tolerates casing and spacing drift in the sheet. */
function indexOfHeader(header: string[], ...names: string[]): number {
  const norm = header.map(h => h.trim().toLowerCase())
  for (const n of names) {
    const i = norm.indexOf(n.toLowerCase())
    if (i !== -1) return i
  }
  return -1
}

/** "27-Jun-2025" and "2025-06-27" both appear in this sheet's history. */
function parseDate(v: string): string | null {
  const s = (v || '').trim()
  if (!s) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s)
  if (dmy) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const m = months.indexOf(dmy[2].toLowerCase())
    if (m >= 0) return `${dmy[3]}-${String(m + 1).padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** "$39.75", "39,75", "" → number | null. */
function parseMoney(v: string): number | null {
  const s = (v || '').replace(/[^0-9.\-]/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const viaCron = !!cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`
  const viaAdmin = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!viaCron && !viaAdmin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const c = sb()
  const { data: setting } = await c.from('app_settings').select('value').eq('key', SHEET_CSV_KEY).maybeSingle()
  const csvUrl = (setting as { value?: { url?: string } } | null)?.value?.url
  if (!csvUrl) {
    return NextResponse.json({
      ok: false,
      error: 'No CSV URL configured.',
      howToFix: 'In the sheet: File → Share → Publish to web → pick the trials tab → CSV → Publish. '
        + `Then POST the resulting link to this endpoint as {"url": "..."} to save it.`,
    }, { status: 400 })
  }

  let text: string
  try {
    const res = await fetch(csvUrl, { cache: 'no-store', redirect: 'follow' })
    if (!res.ok) return NextResponse.json({ ok: false, error: `sheet fetch HTTP ${res.status}` }, { status: 502 })
    text = await res.text()
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }

  const rows = parseCsv(text)
  if (rows.length < 2) return NextResponse.json({ ok: false, error: 'sheet looks empty' }, { status: 422 })

  // The header is not always row 0: published tabs often carry a title row.
  // Find the row that actually declares the columns instead of assuming.
  let headerIdx = rows.findIndex(r => indexOfHeader(r, 'email') !== -1 && indexOfHeader(r, 'status') !== -1)
  if (headerIdx === -1) headerIdx = 0
  const header = rows[headerIdx]

  const col = {
    id: indexOfHeader(header, 'id'),
    date: indexOfHeader(header, 'date'),
    email: indexOfHeader(header, 'email'),
    status: indexOfHeader(header, 'status'),
    channel: indexOfHeader(header, 'channel'),
    utm: indexOfHeader(header, 'utm source', 'utm_source'),
    country: indexOfHeader(header, 'country'),
    p1: indexOfHeader(header, 'payment 1', 'payment1'),
    p2: indexOfHeader(header, 'payment 2', 'payment2'),
    total: indexOfHeader(header, 'total'),
  }
  if (col.email === -1 || col.status === -1) {
    return NextResponse.json({ ok: false, error: 'could not find Email/Status columns', header }, { status: 422 })
  }

  const out: Record<string, unknown>[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const email = (r[col.email] || '').trim().toLowerCase()
    if (!email || !email.includes('@')) continue
    // The sheet's own ID keeps re-syncs idempotent: editing a status updates
    // the row instead of appending a second one.
    const rowId = col.id !== -1 ? Number((r[col.id] || '').trim()) : NaN
    if (!Number.isFinite(rowId)) continue
    out.push({
      row_id: rowId,
      trial_date: col.date !== -1 ? parseDate(r[col.date]) : null,
      email,
      status: (r[col.status] || '').trim() || null,
      channel: col.channel !== -1 ? (r[col.channel] || '').trim() || null : null,
      utm_source: col.utm !== -1 ? (r[col.utm] || '').trim() || null : null,
      country: col.country !== -1 ? (r[col.country] || '').trim() || null : null,
      payment_1: col.p1 !== -1 ? parseMoney(r[col.p1]) : null,
      payment_2: col.p2 !== -1 ? parseMoney(r[col.p2]) : null,
      total: col.total !== -1 ? parseMoney(r[col.total]) : null,
      synced_at: new Date().toISOString(),
    })
  }

  if (out.length === 0) return NextResponse.json({ ok: false, error: 'parsed 0 usable rows', header }, { status: 422 })

  // Chunked upsert: a single 700-row payload is fine, but the sheet grows.
  let written = 0
  for (let i = 0; i < out.length; i += 500) {
    const { error } = await c.from('sheet_trials').upsert(out.slice(i, i + 500), { onConflict: 'row_id' })
    if (error) return NextResponse.json({ ok: false, error: error.message, written }, { status: 500 })
    written += Math.min(500, out.length - i)
  }

  return NextResponse.json({ ok: true, rowsInSheet: rows.length - headerIdx - 1, written, syncedAt: new Date().toISOString() })
}

/** Save the published-CSV URL. */
export async function POST(req: NextRequest) {
  if (!(await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  let body: { url?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }) }
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!/^https:\/\/docs\.google\.com\//.test(url)) {
    return NextResponse.json({ error: 'expected a https://docs.google.com/... published CSV link' }, { status: 400 })
  }
  const { error } = await sb()
    .from('app_settings')
    .upsert({ key: SHEET_CSV_KEY, value: { url }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
