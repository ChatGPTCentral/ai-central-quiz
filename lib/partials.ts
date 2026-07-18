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
  ip_city: string | null
  ip_region: string | null
  client_id: string | null
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

/** Upsert an in-progress capture. Keyed on the quiz session's clientId when
 *  the client sends one — that lets later saves REPLACE the row as the person
 *  keeps typing/advancing (fixing both the "email frozen mid-typing" rows and
 *  progress stuck at 0). Falls back to email-keyed upsert for older clients. */
export async function savePartial(input: {
  email: string
  name?: string | null
  answers?: Record<string, unknown> | null
  utmSource?: string | null
  utmRef?: string | null
  ipCountry?: string | null
  ipCity?: string | null
  ipRegion?: string | null
  clientId?: string | null
}): Promise<void> {
  const email = input.email.trim().toLowerCase()
  if (!email) return
  const c = client()
  const patch = {
    email,
    name: input.name ?? null,
    answers: input.answers ?? null,
    utm_source: input.utmSource ?? null,
    utm_ref: input.utmRef ?? null,
    ip_country: input.ipCountry ?? null,
    ip_city: input.ipCity ?? null,
    ip_region: input.ipRegion ?? null,
    updated_at: new Date().toISOString(),
  }

  if (input.clientId) {
    // Same quiz session → update its row in place (email may have been
    // corrected since the first save).
    const { data: updated, error: upErr } = await c
      .from('quiz_partials')
      .update({ ...patch, client_id: input.clientId })
      .eq('client_id', input.clientId)
      .select('id')
    if (!upErr && updated && updated.length > 0) return
    if (upErr) {
      // Unique-email collision (the corrected email already has a row):
      // drop this session's stale row and fall through to the email upsert.
      await c.from('quiz_partials').delete().eq('client_id', input.clientId)
    }
    const { error } = await c
      .from('quiz_partials')
      .upsert({ ...patch, client_id: input.clientId }, { onConflict: 'email' })
    if (error) console.error('[partials] upsert failed:', error.message)
    return
  }

  const { error } = await c.from('quiz_partials').upsert(patch, { onConflict: 'email' })
  if (error) console.error('[partials] upsert failed:', error.message)
}

/** Remove a partial once the full submission lands (promotes the lead out of
 *  the "In progress" list). Safe to call when no partial exists. Also clears
 *  by clientId so a row whose email was captured mid-typing still promotes. */
export async function deletePartial(email: string, clientId?: string | null): Promise<void> {
  const clean = email.trim().toLowerCase()
  const c = client()
  if (clean) {
    const { error } = await c.from('quiz_partials').delete().ilike('email', clean)
    if (error) console.error('[partials] delete failed:', error.message)
  }
  if (clientId) {
    const { error } = await c.from('quiz_partials').delete().eq('client_id', clientId)
    if (error) console.error('[partials] delete by client failed:', error.message)
  }
}

/** Admin: remove a single in-progress capture by row id. */
export async function deletePartialById(id: string): Promise<boolean> {
  const { error } = await client().from('quiz_partials').delete().eq('id', id)
  if (error) { console.error('[partials] admin delete failed:', error.message); return false }
  return true
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
