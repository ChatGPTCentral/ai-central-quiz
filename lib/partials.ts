// In-progress quiz captures. A "partial" is written once we have a name + a
// valid email but the user hasn't completed the funnel. Stored in its own
// table (quiz_partials) so it never touches the submissions analytics. On a
// successful complete submission the matching partial is deleted, so the
// "In progress" admin view literally means "started but not finished".
//
// No enrichment, no Beehiiv, no email notification ever runs on partials.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface PartialRow {
  id: string
  email: string
  name: string | null
  answers: Record<string, unknown> | null
  utm_source: string | null
  utm_ref: string | null
  ip_country: string | null
  created_at: string
  updated_at: string
}

let _client: SupabaseClient | null = null
function client(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing for quiz_partials')
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _client
}

/** Upsert an in-progress capture keyed on email. Idempotent — repeated calls
 *  for the same email just refresh the answers + updated_at. */
export async function savePartial(input: {
  email: string
  name?: string | null
  answers?: Record<string, unknown> | null
  utmSource?: string | null
  utmRef?: string | null
  ipCountry?: string | null
}): Promise<void> {
  const email = input.email.trim().toLowerCase()
  if (!email) return
  const { error } = await client()
    .from('quiz_partials')
    .upsert(
      {
        email,
        name: input.name ?? null,
        answers: input.answers ?? null,
        utm_source: input.utmSource ?? null,
        utm_ref: input.utmRef ?? null,
        ip_country: input.ipCountry ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' },
    )
  if (error) console.error('[partials] upsert failed:', error.message)
}

/** Remove a partial once the full submission lands (promotes the lead out of
 *  the "In progress" list). Safe to call when no partial exists. */
export async function deletePartial(email: string): Promise<void> {
  const clean = email.trim().toLowerCase()
  if (!clean) return
  const { error } = await client().from('quiz_partials').delete().ilike('email', clean)
  if (error) console.error('[partials] delete failed:', error.message)
}

/** Admin: list in-progress captures, newest activity first. */
export async function listPartials(limit = 500): Promise<PartialRow[]> {
  const { data, error } = await client()
    .from('quiz_partials')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (error.code === '42P01') return [] // table not migrated yet
    throw new Error(`quiz_partials list failed: ${error.message}`)
  }
  return (data ?? []) as PartialRow[]
}
