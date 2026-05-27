import { createClient } from '@supabase/supabase-js'
import SeniorityClassifier from './SeniorityClassifier.client'
import StripeSync from './StripeSync.client'
import SegmentsPanel from './SegmentsPanel.client'

export const dynamic = 'force-dynamic'

async function getSegmentDistribution(): Promise<{ distribution: Record<string, number>; total: number }> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return { distribution: {}, total: 0 }
    const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await c.from('submissions').select('segment').is('archived_at', null)
    if (error || !data) return { distribution: {}, total: 0 }
    const dist: Record<string, number> = {}
    for (const r of data as { segment: string | null }[]) {
      const k = r.segment || 'unclassified'
      dist[k] = (dist[k] || 0) + 1
    }
    return { distribution: dist, total: data.length }
  } catch {
    return { distribution: {}, total: 0 }
  }
}

/**
 * Settings — surfaces the underlying data model so the user understands
 * (and can override) how raw signals get classified into canonical buckets.
 *
 * First section: Role → Seniority mapping. Shows every unique job_title in
 * the DB with the resolved seniority, lets the user write an override that
 * trumps the hardcoded SENIORITY_BANK regex map.
 */
export default async function SettingsPage() {
  const { distribution, total } = await getSegmentDistribution()
  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Settings</h1>
        <p className="text-sm text-[#9C9C9C]">
          Inspect and override the classification dictionaries that power the dashboard segments.
        </p>
      </div>

      <SegmentsPanel distribution={distribution} total={total} />
      <SeniorityClassifier />
      <StripeSync />
    </div>
  )
}
