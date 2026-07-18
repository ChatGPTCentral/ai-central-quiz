// Referrers — who brings in new quiz-takers through the pass share loop.
// Standalone section (extracted from the Funnel page): each referrer with
// their face, LinkedIn and score, expandable to the actual people they
// brought in (faces, LinkedIn, score, paid flag) so you can see who
// brought who at a glance. The viral-loop chain strip (shares → pass views
// → takers → paid) moved here when the Funnel page was retired.

import { createClient } from '@supabase/supabase-js'
import { topReferrersDetailed } from '@/lib/referrer'
import ReferrersList from './ReferrersList.client'

export const dynamic = 'force-dynamic'

interface ViralStats { shares: number; passViews: number; takers: number; paid: number }

/** Viral loop chain: unique share clicks → unique pass views → takers via
 *  pass_share → those who paid after taking. Best-effort; null hides the strip. */
async function viralLoopStats(): Promise<ViralStats | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return null
    const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    // Unique people (anon_id, else session_id) per event, paged past PostgREST's cap.
    const uniq: Record<'share_click' | 'pass_view', Set<string>> = { share_click: new Set(), pass_view: new Set() }
    const PAGE = 1000
    for (let offset = 0; offset < 50_000; offset += PAGE) {
      const { data, error } = await c
        .from('funnel_events')
        .select('event, anon_id, session_id')
        .in('event', ['share_click', 'pass_view'])
        .range(offset, offset + PAGE - 1)
      if (error) throw new Error(error.message)
      if (!data) break
      ;(data as { event: string; anon_id: string | null; session_id: string | null }[]).forEach((r, i) => {
        const set = uniq[r.event as 'share_click' | 'pass_view']
        if (set) set.add(r.anon_id || r.session_id || `row-${offset + i}`)
      })
      if (data.length < PAGE) break
    }

    const { data: takerRows, error: subErr } = await c
      .from('submissions')
      .select('created_at, staged_at, stripe_first_charge_at')
      .eq('source', 'quiz_v2')
      .is('archived_at', null)
      .eq('utm_source', 'pass_share')
    if (subErr) throw new Error(subErr.message)
    const takers = (takerRows ?? []) as { created_at: string | null; staged_at: string | null; stripe_first_charge_at: string | null }[]
    const paid = takers.filter(s =>
      s.stripe_first_charge_at &&
      new Date(s.stripe_first_charge_at).getTime() > new Date(s.created_at || s.staged_at || 0).getTime(),
    ).length

    return { shares: uniq.share_click.size, passViews: uniq.pass_view.size, takers: takers.length, paid }
  } catch {
    return null
  }
}

export default async function ReferrersPage() {
  let referrers: Awaited<ReturnType<typeof topReferrersDetailed>> = []
  let error: string | null = null
  const [viral] = await Promise.all([
    viralLoopStats(),
    topReferrersDetailed().then(r => { referrers = r }).catch(e => { error = e instanceof Error ? e.message : String(e) }),
  ])

  const totalReferred = referrers.reduce((n, r) => n + r.referred, 0)
  const totalPaid = referrers.reduce((n, r) => n + r.referredPaid, 0)

  return (
    <div>
      <header style={{ padding: '26px 36px 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>Records · pass share loop</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Referrers</h1>
        <p className="text-sm text-[#9C9C9C] mt-1">
          People whose shared pass brought in new quiz-takers (utm_source pass_share). Expand a row to see exactly who they brought in.
        </p>
        {error && <p className="text-sm text-[#BE3B3B] mt-2">Error: {error}</p>}
      </header>

      <div className="p-8 pt-1 max-w-4xl">
        {viral && (
          <div className="flex items-stretch flex-wrap mb-6" style={{ border: '1px solid #333333', background: '#FFFFFF' }}>
            <div className="flex items-center" style={{ padding: '14px 20px', background: '#333333' }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#E7B02F' }}>Viral loop</span>
            </div>
            {[
              { n: viral.shares, label: 'shares clicked' },
              { n: viral.passViews, label: 'pass views' },
              { n: viral.takers, label: 'takers via share' },
              { n: viral.paid, label: 'net-new paid' },
            ].map((v, i, arr) => (
              <div key={v.label} className="flex items-center" style={{ flex: 1, gap: 14, padding: '14px 20px', borderLeft: '1px solid #E8E2D4', minWidth: 130 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#1A1A1A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v.n.toLocaleString()}</div>
                  <div style={{ fontSize: 10.5, color: '#9C9C9C', marginTop: 4 }}>{v.label}</div>
                </div>
                {i < arr.length - 1 && <span style={{ marginLeft: 'auto', color: '#C4BDB2', fontSize: 15 }}>→</span>}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Referrers', n: referrers.length },
            { label: 'People referred', n: totalReferred },
            { label: 'Of those, paid', n: totalPaid },
          ].map(c => (
            <div key={c.label} className="bg-white border border-[#E8E4DF] rounded-xl px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#9C9C9C]">{c.label}</div>
              <div className="text-2xl font-black text-[#333333] tabular-nums mt-0.5">{c.n.toLocaleString()}</div>
            </div>
          ))}
        </div>

        <ReferrersList referrers={referrers} />

        <p className="text-[11px] text-[#9C9C9C] mt-4">
          Matched by the pass ref (AC- + the first 4 characters of the sharer&rsquo;s id); a sharer must predate the lead. The 4-character ref can rarely collide, so a very high count is worth a spot-check.
        </p>
      </div>
    </div>
  )
}
