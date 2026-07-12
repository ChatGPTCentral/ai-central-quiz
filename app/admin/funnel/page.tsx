import { createClient } from '@supabase/supabase-js'
import { clarityUxByPage, type UxPageRow } from '@/lib/clarity'
import ClarityPullNow from '@/components/admin/ClarityPullNow.client'

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

  // Funnel steps (unique people per step). The steps must share ONE time
  // window or the %-of-prev chain lies: events only exist from the day the
  // measurement layer shipped, while the CRM covers the whole window
  // (launch included). So the two CRM rows are clipped to the events era
  // for the chain, and their full-window totals ride along as notes.
  const eventsStartMs = firstEventTs ? new Date(firstEventTs).getTime() : null
  const subsEventsEra = eventsStartMs
    ? subs.filter(s => s.staged_at && new Date(s.staged_at).getTime() >= eventsStartMs)
    : subs
  const paidOf = (rows: typeof subs) => rows.filter(s =>
    s.stripe_first_charge_at && s.staged_at &&
    new Date(s.stripe_first_charge_at).getTime() > new Date(s.staged_at).getTime(),
  ).length

  const steps: { key: string; label: string; n: number; source: 'events' | 'submissions'; note?: string }[] = [
    { key: 'quiz_view', label: 'Landing view', n: uniquePeople(by('quiz_view')), source: 'events' },
    { key: 'quiz_start', label: 'Quiz started', n: uniquePeople(by('quiz_start')), source: 'events' },
    {
      key: 'email_submitted',
      label: 'Quiz completed',
      n: subsEventsEra.length,
      source: 'submissions',
      note: eventsStartMs && subs.length !== subsEventsEra.length ? `${subs.length} in the full ${WINDOW_DAYS}d (CRM, incl. pre-tracking launch)` : undefined,
    },
    { key: 'result_view', label: 'Result viewed', n: uniquePeople(by('result_view')), source: 'events' },
    { key: 'checkout_click', label: 'Checkout clicked', n: uniquePeople(by('checkout_click')), source: 'events' },
    {
      key: 'net_new_paid',
      label: 'Net-new paid',
      n: paidOf(subsEventsEra),
      source: 'submissions',
      note: eventsStartMs && paidOf(subs) !== paidOf(subsEventsEra) ? `${paidOf(subs)} in the full ${WINDOW_DAYS}d (CRM)` : undefined,
    },
  ]
  const maxN = Math.max(...steps.map(s => s.n), 1)

  // Per-placement CTA performance: unique viewers (placement_view, accrues
  // from when impression tracking shipped) vs unique clickers. Distinguishes
  // "bad copy" from "never seen".
  const placementStats = new Map<string, { views: Set<string>; clicks: Set<string> }>()
  const personKey = (r: EvRow) => r.anon_id || r.session_id || `row-${r.ts}-${Math.random()}`
  for (const r of events) {
    if (r.event !== 'placement_view' && r.event !== 'checkout_click') continue
    const pl = typeof r.props?.placement === 'string' ? (r.props.placement as string) : '(unknown)'
    const e = placementStats.get(pl) || { views: new Set<string>(), clicks: new Set<string>() }
    ;(r.event === 'placement_view' ? e.views : e.clicks).add(personKey(r))
    placementStats.set(pl, e)
  }
  const placements = Array.from(placementStats.entries())
    .map(([pl, s]) => ({ pl, views: s.views.size, clicks: s.clicks.size }))
    .sort((a, b) => b.views - a.views || b.clicks - a.clicks)

  // Viral loop: share → pass view → new takers via pass_share
  const passShareSubs = subs.filter(s => (s.utm_source || '').trim() === 'pass_share')
  const viral = {
    shares: uniquePeople(by('share_click')),
    passViews: uniquePeople(by('pass_view')),
    takers: passShareSubs.length,
    paid: passShareSubs.filter(s =>
      s.stripe_first_charge_at && s.staged_at &&
      new Date(s.stripe_first_charge_at).getTime() > new Date(s.staged_at).getTime(),
    ).length,
  }

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

  // Clarity UX snapshots (best-effort; empty until the first pull lands)
  let ux: Awaited<ReturnType<typeof clarityUxByPage>> = { rows: [], snapshotDays: 0, lastFetched: null }
  try { ux = await clarityUxByPage(7) } catch { /* strip shows its empty state */ }
  const uxPath = (u: string) => { try { return new URL(u).pathname || '/' } catch { return u } }
  const uxRows: UxPageRow[] = ux.rows.slice(0, 8)

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
                <div className="w-40 shrink-0 font-medium text-[#333333]">
                  {s.label}
                  {s.note && <span className="block text-[10px] font-normal text-[#9C9C9C] leading-tight">{s.note}</span>}
                </div>
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
          All six steps share one window: since first-party events began{firstEventTs ? ` (${new Date(firstEventTs).toLocaleDateString()})` : ''}. The CRM knows completions and payments from before tracking existed; those full-{WINDOW_DAYS}d totals show under the step labels and in the by-source table below.
        </p>
      </section>

      {/* Viral loop */}
      <section className="bg-white border border-[#E8E4DF] rounded-xl p-6 mb-6">
        <h2 className="text-sm font-black text-[#333333] mb-1">Viral loop</h2>
        <p className="text-[11px] text-[#9C9C9C] mb-4">share_click → /pass views → quiz-takers arriving with utm pass_share → net-new paid</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Shares clicked', n: viral.shares },
            { label: 'Pass views', n: viral.passViews },
            { label: 'Takers via share', n: viral.takers },
            { label: 'Net-new paid', n: viral.paid },
          ].map(s => (
            <div key={s.label} className="border border-[#F0EDE8] rounded-lg p-3">
              <div className="text-2xl font-black tabular-nums text-[#333333]">{s.n.toLocaleString()}</div>
              <div className="text-[11px] text-[#9C9C9C] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CTA performance by placement */}
        <section className="bg-white border border-[#E8E4DF] rounded-xl p-6">
          <h2 className="text-sm font-black text-[#333333] mb-4">CTA view → click by placement</h2>
          {placements.length === 0 ? (
            <p className="text-sm text-[#9C9C9C]">No placement data yet.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#E8E4DF] text-[10px] uppercase tracking-wider text-[#9C9C9C]">
                  <th className="text-left py-1.5">Placement</th>
                  <th className="text-right py-1.5">Viewers</th>
                  <th className="text-right py-1.5">Clickers</th>
                  <th className="text-right py-1.5">CTR</th>
                </tr>
              </thead>
              <tbody>
                {placements.map(p => (
                  <tr key={p.pl} className="border-b border-[#F5F5F5]">
                    <td className="py-1.5 font-mono text-[12px] text-[#333333]">{p.pl}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.views > 0 ? p.views : '–'}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold">{p.clicks}</td>
                    <td className="py-1.5 text-right tabular-nums font-semibold text-[#046BB1]">
                      {p.views > 0 ? `${((p.clicks / p.views) * 100).toFixed(1)}%` : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11px] text-[#9C9C9C] mt-3">
            Viewers accrue from when impression tracking shipped; “–” means the placement predates it.
          </p>
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

      {/* UX health from Clarity snapshots */}
      <section className="bg-white border border-[#E8E4DF] rounded-xl p-6 mt-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-sm font-black text-[#333333]">UX health (Clarity)</h2>
          <ClarityPullNow />
        </div>
        {uxRows.length === 0 ? (
          <p className="text-sm text-[#9C9C9C]">
            No snapshots yet. The cron pulls daily at 06:30 UTC once CLARITY_API_TOKEN is set on Vercel, or hit Pull now for the trailing day.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E8E4DF] text-[10px] uppercase tracking-wider text-[#9C9C9C]">
                <th className="text-left py-1.5">Page</th>
                <th className="text-right py-1.5">Sessions</th>
                <th className="text-right py-1.5">Scroll depth</th>
                <th className="text-right py-1.5">Rage</th>
                <th className="text-right py-1.5">Dead</th>
                <th className="text-right py-1.5">Quick-backs</th>
                <th className="text-right py-1.5">JS errors</th>
              </tr>
            </thead>
            <tbody>
              {uxRows.map(r => (
                <tr key={r.url} className="border-b border-[#F5F5F5]">
                  <td className="py-1.5 font-mono text-[12px] text-[#333333]" title={r.url}>{uxPath(r.url)}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.sessions.toLocaleString()}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold text-[#046BB1]">{r.scrollDepth === null ? '–' : `${r.scrollDepth}%`}</td>
                  <td className="py-1.5 text-right tabular-nums" style={{ color: r.rage > 0 ? '#BE3B3B' : undefined, fontWeight: r.rage > 0 ? 700 : 400 }}>{r.rage}</td>
                  <td className="py-1.5 text-right tabular-nums" style={{ color: r.dead > 0 ? '#BE593B' : undefined, fontWeight: r.dead > 0 ? 700 : 400 }}>{r.dead}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.quickback}</td>
                  <td className="py-1.5 text-right tabular-nums" style={{ color: r.scriptErrors > 0 ? '#BE3B3B' : undefined, fontWeight: r.scriptErrors > 0 ? 700 : 400 }}>{r.scriptErrors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-[#9C9C9C] mt-3">
          Summed over the last {ux.snapshotDays || 0} daily snapshot{ux.snapshotDays === 1 ? '' : 's'} (Clarity’s API only serves the trailing day, so history accrues here).
          {ux.lastFetched && <> Last pull {new Date(ux.lastFetched).toLocaleString()}.</>}
          {' '}Recordings and heatmaps stay in the Clarity dashboard.
        </p>
      </section>
    </div>
  )
}
