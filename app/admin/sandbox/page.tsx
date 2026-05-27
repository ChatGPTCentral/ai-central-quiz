import { createClient } from '@supabase/supabase-js'
import SandboxPanel from './SandboxPanel.client'

export const dynamic = 'force-dynamic'

interface RowSlice {
  stage: string | null
  persona: string | null
  segment: string | null
  lifetime_value_usd: number | string | null
  beehiiv_status: string | null
}

async function loadSnapshot(): Promise<{
  rows: RowSlice[]
}> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return { rows: [] }
    const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await c
      .from('submissions')
      .select('stage, persona, segment, lifetime_value_usd, beehiiv_status')
      .is('archived_at', null)
    if (error || !data) return { rows: [] }
    return { rows: data as RowSlice[] }
  } catch {
    return { rows: [] }
  }
}

/**
 * Sandbox — the laddered Stage + Persona segmentation, parallel to
 * the production `segment` system. Lets us compare the two before
 * committing to a cutover.
 */
export default async function SandboxPage() {
  const { rows } = await loadSnapshot()
  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#FFFDFA] bg-[#E48715] px-2 py-0.5 rounded">🧪 Sandbox</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">Non-destructive · parallel system</span>
        </div>
        <h1 className="text-2xl font-black text-[#333333] mb-1">Laddered segmentation v2</h1>
        <p className="text-sm text-[#9C9C9C] max-w-3xl">
          Two-axis classification: <strong>Stage</strong> (the mutable AI-adoption ladder S0 - - S5) ×{' '}
          <strong>Persona</strong> (the fixed role context). Writes to new columns - - the production{' '}
          <code className="bg-[#F5F5F5] px-1 rounded text-[11px]">segment</code> system is untouched.
        </p>
      </div>

      <SandboxPanel rows={rows} />
    </div>
  )
}
