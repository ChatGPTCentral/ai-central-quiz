// Resolve a pass_share lead's referrer. The share link carries the sharer's
// ref (`AC-` + the first 4 chars of their submission id) as utm_ref; this
// reverses it back to the sharer's record. The 4-char prefix can, in rare
// cases, match more than one person — we surface all matches rather than
// guess.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _client
}

export interface Referrer { id: string; name: string | null; email: string | null }

/** Given a utm_ref like "AC-5872", return the sharer(s) it points to. */
export async function findReferrers(utmRef?: string | null): Promise<Referrer[]> {
  if (!utmRef) return []
  const m = utmRef.trim().match(/^AC-([A-Za-z0-9]{4})$/i)
  if (!m) return []
  try {
    const { data, error } = await sb().rpc('find_referrer', { p_prefix: m[1] })
    if (error) return []
    return ((data as Referrer[]) || []).map(r => ({ id: r.id, name: r.name, email: r.email }))
  } catch {
    return []
  }
}
