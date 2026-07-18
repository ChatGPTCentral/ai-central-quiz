// Referrers — who brings in new quiz-takers through the pass share loop.
// Standalone section (extracted from the Funnel page): each referrer with
// their face, LinkedIn and score, expandable to the actual people they
// brought in (faces, LinkedIn, score, paid flag) so you can see who
// brought who at a glance.

import { topReferrersDetailed } from '@/lib/referrer'
import ReferrersList from './ReferrersList.client'

export const dynamic = 'force-dynamic'

export default async function ReferrersPage() {
  let referrers: Awaited<ReturnType<typeof topReferrersDetailed>> = []
  let error: string | null = null
  try { referrers = await topReferrersDetailed() } catch (e) { error = e instanceof Error ? e.message : String(e) }

  const totalReferred = referrers.reduce((n, r) => n + r.referred, 0)
  const totalPaid = referrers.reduce((n, r) => n + r.referredPaid, 0)

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Referrers</h1>
        <p className="text-sm text-[#9C9C9C]">
          People whose shared pass brought in new quiz-takers (utm_source pass_share). Expand a row to see exactly who they brought in.
        </p>
        {error && <p className="text-sm text-[#BE3B3B] mt-2">Error: {error}</p>}
      </div>

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
  )
}
