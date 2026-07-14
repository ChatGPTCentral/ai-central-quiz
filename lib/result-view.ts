// Which result page a person actually saw, from their result_view events.
// pageVariant marks the era: v2 (first rebuild), v3 (the ended A/B), v4 (the
// current restructure). Also builds the Clarity recordings link so the admin
// can find that person's session (filter by the submissionId custom tag).

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

const VARIANT_LABEL: Record<string, string> = {
  v2: 'v2 (video-first)',
  v3: 'v3 (pass-first A/B)',
  v4: 'v4 (pass at bottom, LinkedIn-gated)',
}

export interface ResultViewInfo {
  variant: string
  variantLabel: string
  lastSeen: string
  views: number
  clarityUrl: string | null
}

export async function lastResultView(submissionId?: string | null): Promise<ResultViewInfo | null> {
  if (!submissionId) return null
  try {
    const { data } = await sb()
      .from('funnel_events')
      .select('props, ts')
      .eq('event', 'result_view')
      .eq('submission_id', submissionId)
      .order('ts', { ascending: false })
      .limit(200)
    if (!data || data.length === 0) return null
    const variant = ((data[0].props as { pageVariant?: string } | null)?.pageVariant) || 'unknown'
    const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
    return {
      variant,
      variantLabel: VARIANT_LABEL[variant] || variant,
      lastSeen: data[0].ts as string,
      views: data.length,
      clarityUrl: projectId ? `https://clarity.microsoft.com/projects/view/${projectId}/impressions` : null,
    }
  } catch {
    return null
  }
}
