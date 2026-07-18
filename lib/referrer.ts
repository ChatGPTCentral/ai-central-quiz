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

export interface TopReferrer {
  id: string
  name: string | null
  email: string | null
  isCustomer: boolean
  referred: number
  referredPaid: number
}

/** Leaderboard of who has brought in the most pass_share subscribers. */
export async function topReferrers(): Promise<TopReferrer[]> {
  try {
    const { data, error } = await sb().rpc('top_referrers')
    if (error) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[]) || []).map(r => ({
      id: r.referrer_id, name: r.referrer_name, email: r.referrer_email,
      isCustomer: !!r.referrer_is_customer, referred: Number(r.referred_count), referredPaid: Number(r.referred_paid),
    }))
  } catch { return [] }
}

export interface ReferredPerson {
  id: string
  name: string | null
  email: string | null
  photoUrl: string | null
  linkedinUrl: string | null
  score: number | null
  createdAt: string | null
  paid: boolean
}

export interface DetailedReferrer extends TopReferrer {
  photoUrl: string | null
  linkedinUrl: string | null
  score: number | null
  lastReferral: string | null
  people: ReferredPerson[]
}

/** Referrer leaderboard with faces + the actual people each one brought in
 *  (photo, linkedin, score per person), for the standalone Referrers page.
 *  Timing uses immutable created_at, because enrichment re-stamps staged_at. */
export async function topReferrersDetailed(): Promise<DetailedReferrer[]> {
  try {
    const { data, error } = await sb().rpc('top_referrers_detailed')
    if (error) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[]) || []).map(r => ({
      id: r.referrer_id, name: r.referrer_name, email: r.referrer_email,
      photoUrl: r.referrer_photo || null, linkedinUrl: r.referrer_linkedin || null,
      score: r.referrer_score ?? null,
      isCustomer: !!r.referrer_is_customer,
      referred: Number(r.referred_count), referredPaid: Number(r.referred_paid),
      lastReferral: r.last_referral || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      people: ((r.referred as any[]) || [])
        .map(p => ({
          id: p.id, name: p.name ?? null, email: p.email ?? null,
          photoUrl: p.photoUrl ?? null, linkedinUrl: p.linkedinUrl ?? null,
          score: p.score ?? null, createdAt: p.createdAt ?? null, paid: !!p.paid,
        }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    }))
  } catch { return [] }
}

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
