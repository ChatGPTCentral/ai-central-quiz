import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { MergedEnrichment, NormalizedPerson, EnrichmentSource } from './types'

let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
  return _client
}

const CACHE_TTL_DAYS = 60

export interface CachedEnrichment {
  data: MergedEnrichment
  raw: Record<string, NormalizedPerson['raw']>
  status: 'complete' | 'partial' | 'failed'
  providersTried: EnrichmentSource[]
  updatedAt: number
}

export async function getCached(email: string): Promise<CachedEnrichment | null> {
  try {
    const { data, error } = await client()
      .from('enrichment_cache')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()
    if (error || !data) return null
    const updatedAt = new Date(data.updated_at).getTime()
    const ageDays = (Date.now() - updatedAt) / (24 * 60 * 60 * 1000)
    if (ageDays > CACHE_TTL_DAYS) return null
    return {
      data: data.data,
      raw: data.raw || {},
      status: data.status,
      providersTried: data.providers_tried,
      updatedAt,
    }
  } catch {
    return null
  }
}

export async function setCached(email: string, payload: Omit<CachedEnrichment, 'updatedAt'>): Promise<void> {
  try {
    await client()
      .from('enrichment_cache')
      .upsert({
        email: email.toLowerCase().trim(),
        data: payload.data,
        raw: payload.raw,
        status: payload.status,
        providers_tried: payload.providersTried,
        updated_at: new Date().toISOString(),
      })
  } catch (err) {
    console.error('enrichment_cache write failed:', err)
  }
}
