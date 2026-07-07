import { createClient } from '@supabase/supabase-js'
import SeniorityClassifier from './SeniorityClassifier.client'
import StripeSync from './StripeSync.client'
import SegmentsPanel from './SegmentsPanel.client'
import ResendNotification from './ResendNotification.client'

export const dynamic = 'force-dynamic'

/**
 * Full-population Stage + Persona distribution. Paginates past PostgREST's
 * 1000-row default cap (the old v1 segment panel silently capped at 1000 and
 * folded null into 'unclassified' — both fixed here) and keeps null distinct.
 */
async function getStagePersonaDistribution(): Promise<{
  stageDist: Record<string, number>
  personaDist: Record<string, number>
  total: number
}> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return { stageDist: {}, personaDist: {}, total: 0 }
    const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const PAGE = 1000
    const stageDist: Record<string, number> = {}
    const personaDist: Record<string, number> = {}
    let total = 0
    for (let offset = 0; offset < 50000; offset += PAGE) {
      const { data, error } = await c
        .from('submissions')
        .select('stage, persona')
        .is('archived_at', null)
        .range(offset, offset + PAGE - 1)
      if (error || !data) break
      for (const r of data as { stage: string | null; persona: string | null }[]) {
        total++
        const sk = r.stage || '(unclassified)'
        const pk = r.persona || '(unclassified)'
        stageDist[sk] = (stageDist[sk] || 0) + 1
        personaDist[pk] = (personaDist[pk] || 0) + 1
      }
      if (data.length < PAGE) break
    }
    return { stageDist, personaDist, total }
  } catch {
    return { stageDist: {}, personaDist: {}, total: 0 }
  }
}

/**
 * Settings — surfaces the underlying data model so the user understands
 * (and can override) how raw signals get classified into canonical buckets.
 */
export default async function SettingsPage() {
  const { stageDist, personaDist, total } = await getStagePersonaDistribution()
  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Settings</h1>
        <p className="text-sm text-[#9C9C9C]">
          Inspect and override the classification that powers the dashboard.
        </p>
      </div>

      <SegmentsPanel stageDist={stageDist} personaDist={personaDist} total={total} />
      <SeniorityClassifier />
      <StripeSync />
      <ResendNotification />
    </div>
  )
}
