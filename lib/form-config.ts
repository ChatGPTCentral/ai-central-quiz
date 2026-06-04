// Form config — DB-backed source of truth for editable form definitions.
// Mirrors the lazy Supabase client pattern from lib/kv.ts. Cached via
// Next.js `unstable_cache` and invalidated by tag on publish.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache, revalidateTag } from 'next/cache'
import type { V2Question } from './form-schema'

export interface FormTheme {
  accent?: string
  accentBg?: string
  font?: string
  buttonRadius?: 'sm' | 'md' | 'lg' | 'xl'
}

export interface FormConfig {
  id: string
  slug: string
  version: number
  status: 'draft' | 'published' | 'archived'
  questions: V2Question[]
  theme: FormTheme | null
  updatedAt: string
  updatedByEmail: string | null
}

let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing — need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)',
    )
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

interface DbRow {
  id: string
  slug: string
  version: number
  status: 'draft' | 'published' | 'archived'
  questions: V2Question[]
  theme: FormTheme | null
  updated_at: string
  updated_by_email: string | null
}

function fromRow(r: DbRow): FormConfig {
  return {
    id: r.id,
    slug: r.slug,
    version: r.version,
    status: r.status,
    questions: r.questions,
    theme: r.theme,
    updatedAt: r.updated_at,
    updatedByEmail: r.updated_by_email,
  }
}

export function configCacheTag(slug: string): string {
  return `form-config:${slug}`
}

/** Read the currently-live published config. Cached 60s + tag-invalidated on publish. */
export async function getLivePublishedConfig(slug: string): Promise<FormConfig | null> {
  return unstable_cache(
    async () => {
      const { data, error } = await client()
        .from('form_publish_pointer')
        .select('live_version_id, form_configs!inner(id, slug, version, status, questions, theme, updated_at, updated_by_email)')
        .eq('slug', slug)
        .maybeSingle()
      if (error) {
        if (error.code === '42P01') {
          console.warn(`[form-config] tables not migrated yet for slug=${slug}; falling back to seed`)
          return null
        }
        throw new Error(`form_publish_pointer fetch failed: ${error.message}`)
      }
      if (!data) return null
      const cfg = (data as unknown as { form_configs: DbRow }).form_configs
      return fromRow(cfg)
    },
    [`form-config-live-${slug}`],
    { revalidate: 60, tags: [configCacheTag(slug)] },
  )()
}

/** Return the most recent draft row (status='draft') for editor open. */
export async function getLatestDraft(slug: string): Promise<FormConfig | null> {
  const { data, error } = await client()
    .from('form_configs')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'draft')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (error.code === '42P01') {
      console.warn(`[form-config] form_configs table missing; returning null draft for slug=${slug}`)
      return null
    }
    throw new Error(`form_configs draft fetch failed: ${error.message}`)
  }
  return data ? fromRow(data as DbRow) : null
}

/** Fetch a specific version (for diff/preview/rollback). */
export async function getVersion(slug: string, versionId: string): Promise<FormConfig | null> {
  const { data, error } = await client()
    .from('form_configs')
    .select('*')
    .eq('slug', slug)
    .eq('id', versionId)
    .maybeSingle()
  if (error) throw new Error(`form_configs version fetch failed: ${error.message}`)
  return data ? fromRow(data as DbRow) : null
}

/** Persist a new draft as the next version. Returns the new row. */
export async function saveDraft(
  slug: string,
  questions: V2Question[],
  theme: FormTheme | null,
  updatedByEmail: string,
): Promise<FormConfig> {
  const { data: maxRow, error: maxErr } = await client()
    .from('form_configs')
    .select('version')
    .eq('slug', slug)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxErr) throw new Error(`form_configs max version fetch failed: ${maxErr.message}`)
  const nextVersion = (maxRow?.version ?? 0) + 1

  const { data, error } = await client()
    .from('form_configs')
    .insert({
      slug,
      version: nextVersion,
      status: 'draft',
      questions,
      theme,
      updated_by_email: updatedByEmail,
    })
    .select('*')
    .single()
  if (error) throw new Error(`form_configs draft insert failed: ${error.message}`)
  return fromRow(data as DbRow)
}

/** Promote a draft to published and point the pointer at it.
 *  Two-step rather than atomic — we accept a brief window where the pointer
 *  lags the status flip; readers always go through the pointer so that's
 *  the consistency boundary that matters. */
export async function publishDraft(
  slug: string,
  draftVersionId: string,
  updatedByEmail: string,
): Promise<FormConfig> {
  const { data: promoted, error: promoteErr } = await client()
    .from('form_configs')
    .update({ status: 'published', updated_by_email: updatedByEmail, updated_at: new Date().toISOString() })
    .eq('id', draftVersionId)
    .eq('slug', slug)
    .select('*')
    .single()
  if (promoteErr) throw new Error(`form_configs publish promote failed: ${promoteErr.message}`)

  const { error: pointerErr } = await client()
    .from('form_publish_pointer')
    .upsert({
      slug,
      live_version_id: draftVersionId,
      updated_at: new Date().toISOString(),
      updated_by_email: updatedByEmail,
    })
  if (pointerErr) throw new Error(`form_publish_pointer upsert failed: ${pointerErr.message}`)

  revalidateTag(configCacheTag(slug))
  return fromRow(promoted as DbRow)
}

export async function listVersions(slug: string): Promise<FormConfig[]> {
  const { data, error } = await client()
    .from('form_configs')
    .select('*')
    .eq('slug', slug)
    .order('version', { ascending: false })
  if (error) throw new Error(`form_configs list failed: ${error.message}`)
  return (data ?? []).map(r => fromRow(r as DbRow))
}
