// The one place a service-role Supabase client is built.
//
// WHY THIS FILE EXISTS. On 2026-08-08 the Pass Recovery cron spent fourteen
// hours acting on a snapshot of the database frozen at 13:15. It mailed 49 of
// the wrong people, then silently mailed nobody, and looked healthy throughout,
// because a cached answer is fast, well-formed and confident. The cause was not
// Postgres and not the query: supabase-js talks over fetch, and inside Next
// those fetches were being served from cache.
//
// Every file used to build its own client, so the fix had to be repeated in
// every file, which means it would have been forgotten in the next one. Now
// there is a single constructor with `cache: 'no-store'` baked in, and a file
// that wants a client cannot accidentally get a cacheable one.
//
// `export const dynamic = 'force-dynamic'` does NOT protect you. The cron had
// it and was cached anyway. That is the trap this file closes.
//
// Read paths that back the admin dashboards matter as much as the crons: the
// north-star number is read through this, and a stale north star is worse than
// no north star, because you act on it.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Service-role key, checked in the order the codebase has historically used. */
function serviceKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  )
}

function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
}

/** True when a service-role client can be built. Use before calling. */
export function supabaseAdminConfigured(): boolean {
  return !!supabaseUrl() && !!serviceKey()
}

/**
 * A service-role client whose every request bypasses the fetch cache.
 *
 * NOT memoised. A module-level singleton outlives a request in a warm lambda,
 * and the whole point here is that nothing about a read should outlive the
 * moment it was asked for. Constructing a client is cheap; being wrong is not.
 *
 * @throws if the env vars are missing, so a misconfiguration fails loudly at
 *   the call site instead of returning a client that 401s later.
 */
export function supabaseAdmin(): SupabaseClient {
  const url = supabaseUrl()
  const key = serviceKey()
  if (!url || !key) throw new Error('Supabase env vars missing (url or service key)')

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // The line this file exists for. Do not remove it, and do not add a
      // revalidate: a cron and a dashboard both need the current answer.
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}

/** Null instead of throwing, for callers that degrade gracefully. */
export function supabaseAdminOrNull(): SupabaseClient | null {
  return supabaseAdminConfigured() ? supabaseAdmin() : null
}
