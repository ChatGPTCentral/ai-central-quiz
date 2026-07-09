import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// ── Funnel view: where do people actually drop? ─────────────────────
// Steps come from two sources:
//   - funnel_events (first-party beacons; accrue from the day this shipped)
//   - submissions   (completions + net-new paid, the ground truth)
// Uniqueness = anon_id when present, else session_id, else row id.

const WINDOW_DAYS = 30

interface EvRow {
  event: string
  anon_id: string | null
  session_id: string | null
  props: Record<string, unknown> | null
  utm_source: string | null
  ts: string
}

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function loadEvents(sinceIso: string): Promise<EvRow[]> {
  const c = sb()
  const PAGE = 1000
  const all: EvRow[] = []
  for (let offset = 0; offset < 50_000; offset += PAGE) {
    const { data, error } = await c
      .from('funnel_events')
      .select('event, anon_id, session_id, props, utm_source, ts')
      .gte('ts', sinceIso)
      .order('ts', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error || !data) break
    all.push(...(data as EvRow[]))
    if (data.length < PAGE) break
  }
  return all
}

async function loadSubmissions(sinceIso: string) {
  const c = sb()
  const { data } = await c
    .from('submissions')
    .select('id, email, staged_at, stripe_first_charge_at, utm_source')
    .eq('source', 'quiz_v2')
    .is('archived_at', null)
    .gte('staged_at', sinceIso)
  return (data ?? []) as { id: string; email: string; staged_at: string | null; stripe_first_charge_at: string | null; utm_source: string | null }[]
}

function uniquePeople(rows: EvRow[]): number {
  const s = new Set<string>()
  for (const r of rows) s.add(r.anon_id || r.session_id || String(Math.random()))
  return s.size
}

export default async function FunnelPage() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const sinceIso = since.toISOString()

  let events: EvRow[] = []
  let subs: Awaited<ReturnType<typeof loadSubmissions>> = []
  let error: string | null = null
  try {
    ;[events, subs] = await Promise.all([loadEvents(sinceIso), loadSubmissions(sinceIso)])
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const by = (ev: string) => events.filter(r => r.event === ev)
  const firstEventTs = events[0]?.ts

  // Funnel steps (unique people per step)
  const steps: { key: string; label: string; n: number; source: 'events' | 'submissions' }[] = [
    { key: 'quiz_view', label: 'Landing view', n: uniquePeople(by('quiz_view')), source: 'events' },
    { key: 'quiz_start', label: 'Quiz started', n: uniquePeople(by('quiz_start')), source: 'events' },
    { key: 'email_submitted', label: 'Quiz completed', n: subs.length, source: 'submissions' },
    { key: 'result_view', label: 'Result viewed', n: uniquePeople(by('result_view')), source: 'events' },
    { key: 'checkout_click', label: 'Checkout clicked', n: uniquePeople(by('checkout_click')), source: 'events' },
    {
      key: 'net_new_paid',
      label: 'Net-new paid',
      n: subs.filter(s =>
        s.stripe_first_charge_at && s.staged_at &&
        new Date(s.stripe_first_charge_at).getTime() > new Date(s.staged_at).getTime(),
      ).length,
      source: 'submissions',
    },
  ]
  const maxN = Math.max(...steps.map(s => s.n), 1)

  // Checkout clicks by placement
  const placementCounts = new Map<string, number>()
  for (const r of by('checkout_click')) {
    const pl = typeof r.props?.placement === 'string' ? (r.props.placement as string) : '(unknown)'
    placementCounts.set(pl, (placementCounts.get(pl) || 0) + 1)
  }
  const placements = Array.from(placementCounts.entries()).sort((a, b) => b[1] - a[1])

  // Completions + conversions by utm_source (submissions = reliable attribution)
  const utm = new Map<string, { subs: number; paid: number }>()
  for (const s of subs) {
    const k = (s.utm_source || 'Direct / unknown').trim()
    const e = utm.get(k) || { subs: 0, paid: 0 }
    e.subs++
    if (s.stripe_first_charge_at && s.staged_at && new Date(s.stripe_first_charge_at).getTime() > new Date(s.staged_at).getTime()) e.paid++
    utm.set(k, e)
  }
  const utmRows = Array.from(utm.entries()).sort((a, b) => b[1].subs - a[1].subs).slice(0, 12)

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#333333] mb-1">Funnel</h1>
        <p className="text-sm text-[#9C9C9C]">
          Last {WINDOW_DAYS} days.{' '}
          {firstEventTs
            ? <>First-party events since <strong className="text-[#333333]">{new Date(firstEventTs).toLocaleDateString()}</strong>; completions and payments come from the CRM.</>
            : <>No first-party events yet — they start accruing from the moment this feature deployed. Completions and payments come from the CRM.</>}
        </p>
        {error && <p className="text-sm text-[#BE3B3B] mt-2">Error: {error}</p>}
      </div>

      {/* Funnel bars */}
      <section className="bg-white border border-[#E8E4DF] rounded-xl p-6 mb-6">
        <h2 className="text-sm font-black text-[#333333] mb-4">Steps (unique people)</h2>
        <div className="flex flex-col gap-2">
          {steps.map((s, i) => {
            const prev = i > 0 ? steps[i - 1].n : null
            const rate = prev && prev > 0 ? (s.n / prev) * 100 : null
            return (
              <div key={s.key} className="flex items-center gap-3 text-[13px]">
                <div className="w-40 shrink-0 font-medium text-[#333333]">{s.label}</div>
                <div className="flex-1 relative h-6 bg-[#F5F5F5] rounded">
                  <div
                    className="absolute inset-y-0 left-0 rounded transition-all"
                    style={{ width: `${(s.n / maxN) * 100}%`, backgroundColor: s.key === 'net_new_paid' ? '#62A758' : '#046BB1' }}
                  />
                </div>
                <div className="w-14 shrink-0 text-right tabular-nums font-bold text-[#333333]">{s.n.toLocaleString()}</div>
                <div className="w-20 shrink-0 text-right tabular-nums text-[#9C9C9C]">
                  {rate !== null ? `${rate.toFixed(0)}% of prev` : ''}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-[#9C9C9C] mt-3">
          Landing/start/result/checkout come from first-party events; completed + paid come from the CRM (so they are complete even before events accrued).
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Checkout clicks by placement */}
        <section className="bg-white border border-[#E8E4DF] rounded-xl p-6">
          <h2 className="text-sm font-black text-[#333333] mb-4">Checkout clicks by placement</h2>
          {placements.length === 0 ? (
            <p className="text-sm text-[#9C9C9C]">No clicks recorded yet.</p>
          ) : (
            <table className="w-full text-[13px]">
              <tbody>
                {placements.map(([pl, n]) => (
                  <tr key={pl} className="border-b border-[#F5F5F5]">
                    <td className="py-1.5 font-mono text-[12px] text-[#333333]">{pl}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* By UTM source */}
        <section className="bg-white border border-[#E8E4DF] rounded-xl p-6">
          <h2 className="text-sm font-black text-[#333333] mb-4">Completions → paid, by source</h2>
          {utmRows.length === 0 ? (
            <p className="text-sm text-[#9C9C9C]">No submissions in the window.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#E8E4DF] text-[10px] uppercase tracking-wider text-[#9C9C9C]">
                  <th className="text-left py-1.5">Source</th>
                  <th className="text-right py-1.5">Completed</th>
                  <th className="text-right py-1.5">Net-new paid</th>
                  <th className="text-right py-1.5">CVR</th>
                </tr>
              </thead>
              <tbody>
                {utmRows.map(([k, v]) => (
                  <tr key={k} className="border-b border-[#F5F5F5]">
                    <td className="py-1.5 text-[#333333]">{k}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.subs}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.paid}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold text-[#046BB1]">
                      {v.subs > 0 ? `${((v.paid / v.subs) * 100).toFixed(1)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
