// Server-side read of the saved LTV model.
//
// Separate from lib/ltv-model.ts because that one is imported by a CLIENT
// component (the simulator panel) and must stay free of server code, and
// separate from the route because a Next.js route file may only export request
// handlers. Both the ads API and the simulator read through here, so there is
// exactly one path from the stored assumptions to a screen.

import { createClient } from '@supabase/supabase-js'
import { LTV_SETTINGS_KEY, LTV_DEFAULTS, parseLtvModel, type LtvModel } from './ltv-model'

export async function readLtvModel(): Promise<LtvModel> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return LTV_DEFAULTS
  try {
    const c = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      // A page that prices advertising must never read a stale assumption.
      global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
    })
    const { data } = await c
      .from('app_settings')
      .select('value')
      .eq('key', LTV_SETTINGS_KEY)
      .maybeSingle()
    return parseLtvModel((data as { value?: unknown } | null)?.value ?? LTV_DEFAULTS)
  } catch {
    return LTV_DEFAULTS
  }
}
