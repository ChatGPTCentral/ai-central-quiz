// DB-backed override layer for the hardcoded classification banks
// (TITLE_BANK + SENIORITY_BANK in lib/enrichment/standardize.ts).
//
// User-edited overrides take precedence over the hardcoded defaults.
// Lookup is cached in-memory with a 60s TTL so per-row enrichment doesn't
// hit the DB on every call. Mutations (add/update/delete) invalidate the
// cache immediately.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { standardizeSeniority as defaultSeniority, standardizeTitle as defaultTitle, type Seniority } from './enrichment/standardize'

let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _client
}

export type Category = 'seniority' | 'title' | 'country'

export interface Override {
  id: string
  category: Category
  raw_value: string
  mapped_to: string
  notes?: string | null
  updated_at?: string
}

interface CacheEntry {
  map: Map<string, string>     // raw_value (lowercase) → mapped_to
  fetchedAt: number
}
const TTL_MS = 60_000
const cache: Partial<Record<Category, CacheEntry>> = {}

/** Force-invalidate the cache after a mutation. */
export function invalidateCache(category?: Category) {
  if (category) delete cache[category]
  else for (const k of Object.keys(cache) as Category[]) delete cache[k]
}

async function loadCategory(category: Category): Promise<Map<string, string>> {
  const cached = cache[category]
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.map

  const { data, error } = await client()
    .from('classification_overrides')
    .select('raw_value, mapped_to')
    .eq('category', category)
  if (error) {
    console.error('[classification-overrides] load failed:', error.message)
    return new Map()
  }
  const map = new Map<string, string>()
  for (const row of (data || []) as { raw_value: string; mapped_to: string }[]) {
    map.set(row.raw_value.toLowerCase(), row.mapped_to)
  }
  cache[category] = { map, fetchedAt: Date.now() }
  return map
}

/**
 * Resolve a seniority for a raw job title, consulting overrides first.
 * Falls back to the hardcoded SENIORITY_BANK regex map.
 */
export async function resolveSeniority(rawTitle?: string | null, rawSeniority?: string | null): Promise<Seniority | undefined> {
  const overrides = await loadCategory('seniority')
  const lookupKey = (rawTitle || '').trim().toLowerCase()
  if (lookupKey && overrides.has(lookupKey)) return overrides.get(lookupKey) as Seniority
  return defaultSeniority(rawTitle, rawSeniority)
}

/** Resolve a canonical job title, consulting overrides first. */
export async function resolveTitle(rawTitle?: string | null): Promise<string | undefined> {
  const overrides = await loadCategory('title')
  const lookupKey = (rawTitle || '').trim().toLowerCase()
  if (lookupKey && overrides.has(lookupKey)) return overrides.get(lookupKey)
  return defaultTitle(rawTitle)
}

/** List all overrides for the settings UI. */
export async function listOverrides(category: Category): Promise<Override[]> {
  const { data, error } = await client()
    .from('classification_overrides')
    .select('*')
    .eq('category', category)
    .order('raw_value', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []) as Override[]
}

/** Insert or update an override. */
export async function upsertOverride(category: Category, raw_value: string, mapped_to: string, notes?: string): Promise<Override> {
  const { data, error } = await client()
    .from('classification_overrides')
    .upsert({
      category,
      raw_value: raw_value.trim().toLowerCase(),
      mapped_to: mapped_to.trim(),
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'category,raw_value' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  invalidateCache(category)
  return data as Override
}

/** Remove an override by id. */
export async function deleteOverride(id: string): Promise<Category | null> {
  const { data, error } = await client()
    .from('classification_overrides')
    .delete()
    .eq('id', id)
    .select('category')
    .single()
  if (error) throw new Error(error.message)
  const cat = (data?.category || null) as Category | null
  if (cat) invalidateCache(cat)
  return cat
}
