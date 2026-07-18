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
// Public launch of the quiz (newsletter blast). First-party events only
// began Jul 9, so the launch cohort's top-of-funnel is measured only from
// then; the CRM (completions + payments) covers the whole launch.
const LAUNCH_ISO = '2026-07-05T00:00:00Z'

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
    .select('id, email, created_at, staged_at, stripe_first_charge_at, utm_source')
    .eq('source', 'quiz_v2')
    .is('archived_at', null)
    .gte('created_at', sinceIso)
  return (data ?? []) as { id: string; email: string; created_at: string | null; staged_at: string | null; stripe_first_charge_at: string | null; utm_source: string | null }[]
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
  // Quiz-completion time = the IMMUTABLE created_at. staged_at gets re-stamped
  // by enrichment / re-segmentation, which was silently hiding real conversions
  // (the charge looked "before" the bumped quiz time). Attribute on created_at.
  const qtime = (s: { created_at?: string | null; staged_at?: string | null }) =>
    new Date(s.created_at || s.staged_at || 0).getTime()
  const eventsStartMs = firstEventTs ? new Date(firstEventTs).getTime() : null
  const subsEventsEra = eventsStartMs ? subs.filter(s => qtime(s) >= eventsStartMs) : subs
  const paidOf = (rows: typeof subs) => rows.filter(s =>
    s.stripe_first_charge_at && new Date(s.stripe_first_charge_at).getTime() > qtime(s),
  ).length

  // ── Launch cohort (since Jul 5): the CRM truth over the whole launch,
  // including the pre-tracking wave. This is the real business funnel; the
  // event-based steps below only exist from Jul 9 so they live in their own
  // panel rather than lying about a %-chain across two windows.
  const launchMs = new Date(LAUNCH_ISO).getTime()
  const launchSubs = subs.filter(s => qtime(s) >= launchMs)
  const launchCompleted = launchSubs.length
  const launchPaid = paidOf(launchSubs)
  const launchPretracking = eventsStartMs ? launchSubs.filter(s => qtime(s) < eventsStartMs).length : 0
  const launchCvr = launchCompleted > 0 ? (launchPaid / launchCompleted) * 100 : 0

  // On-page funnel: the monotonic path through the pages, one person per
  // step, all in the events window. Result-page opens and paid are shown as
  // context below (result opens counts revisits/shares so it isn't a clean
  // step; paid is a CRM outcome owned by the launch panel), which keeps
  // every bar a true subset of the one above it.
  const steps: { key: string; label: string; n: number }[] = [
    { key: 'quiz_view', label: 'Landing view', n: uniquePeople(by('quiz_view')) },
    { key: 'quiz_start', label: 'Quiz started', n: uniquePeople(by('quiz_start')) },
    { key: 'email_submitted', label: 'Quiz completed', n: subsEventsEra.length },
    { key: 'checkout_click', label: 'Checkout clicked', n: uniquePeople(by('checkout_click')) },
  ]
  const maxN = Math.max(...steps.map(s => s.n), 1)
  const resultOpens = uniquePeople(by('result_view'))
  const trackedPaid = paidOf(subsEventsEra)

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
      s.stripe_first_charge_at && new Date(s.stripe_first_charge_at).getTime() > qtime(s),
    ).length,
  }

  // Completions + conversions by utm_source (submissions = reliable attribution)
  const utm = new Map<string, { subs: number; paid: number }>()
  for (const s of subs) {
    const k = (s.utm_source || 'Direct / unknown').trim()
    const e = utm.get(k) || { subs: 0, paid: 0 }
    e.subs++
    if (s.stripe_first_charge_at && new Date(s.stripe_first_charge_at).getTime() > qtime(s)) e.paid++
    utm.set(k, e)
  }
  const utmRows = Array.from(utm.entries()).sort((a, b) => b[1].subs - a[1].subs).slice(0, 12)

  // Clarity UX snapshots (best-effort; empty until the first pull lands)
  let ux: Awaited<ReturnType<typeof clarityUxByPage>> = { rows: [], snapshotDays: 0, lastFetched: null }
  try { ux = await clarityUxByPage(7) } catch { /* strip shows its empty state */ }
  const uxPath = (u: string) => { try { return new URL(u).pathname || '/' } catch { return u } }
  const uxRows: UxPageRow[] = ux.rows.slice(0, 8)

  // ── 2b render: horizontal funnel + hard-edge tables ──────────────
  const INK = '#1A1A1A'
  const MUTE = '#9C9C9C'
  const HAIR = '#E8E2D4'
  const ROWHAIR = '#F1ECE2'
  const LATTE = '#FEF7E7'
  const eyebrow = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTE } as const
  const th = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B6B6B' } as const
  const tnum = { fontVariantNumeric: 'tabular-nums' } as const
  const fmt = (n: number) => n.toLocaleString()

  // SVG funnel geometry (square-root scale so the tail stays readable).
  const stations = [
    ...steps.map(s => ({ label: s.label, n: s.n, last: false })),
    { label: 'Net-new paid', n: trackedPaid, last: true },
  ]
  const FX = [20, 272, 524, 776, 1028]
  const FBW = 10
  const FCY = 170
  const fMax = Math.max(...stations.map(s => s.n), 1)
  const fh = stations.map(s => Math.sqrt(s.n) / Math.sqrt(fMax) * 240)
  const F_FILLS = ['rgba(4,107,177,0.85)', 'rgba(4,107,177,0.6)', 'rgba(4,107,177,0.38)', 'rgba(4,107,177,0.22)']
  const segs = stations.slice(0, -1).map((s, i) => {
    const x1 = FX[i] + FBW, x2 = FX[i + 1]
    const pts = `${x1},${(FCY - fh[i] / 2).toFixed(1)} ${x2},${(FCY - fh[i + 1] / 2).toFixed(1)} ${x2},${(FCY + fh[i + 1] / 2).toFixed(1)} ${x1},${(FCY + fh[i] / 2).toFixed(1)}`
    const rate = s.n > 0 ? (stations[i + 1].n / s.n) * 100 : 0
    const drop = s.n - stations[i + 1].n
    return { pts, fill: F_FILLS[i], midX: (x1 + x2) / 2, rate, drop, darkLabel: i >= 2 }
  })
  const DROP_CAPTIONS = ['left on landing', 'abandoned mid-quiz', 'saw result, no checkout', 'checkout, no charge']
  const overallPct = stations[0].n > 0 ? (trackedPaid / stations[0].n) * 100 : 0
  const bestCtrPl = placements.reduce<{ pl: string; ctr: number } | null>((best, p) => {
    if (p.views === 0 || p.clicks === 0) return best
    const ctr = p.clicks / p.views
    return !best || ctr > best.ctr ? { pl: p.pl, ctr } : best
  }, null)
  const eventsSinceLabel = firstEventTs
    ? new Date(firstEventTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'tracking'

  return (
    <div>
      <header className="flex items-end justify-between flex-wrap" style={{ padding: '26px 36px 18px', borderBottom: '2px solid #333333', gap: 16 }}>
        <div>
          <div style={{ ...eyebrow, marginBottom: 4 }}>Conversion · two windows, kept separate on purpose</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Funnel</h1>
          {error && <p style={{ fontSize: 12.5, color: '#BE3B3B', marginTop: 6 }}>Error: {error}</p>}
        </div>
        <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
          <span style={{ border: '1px solid #333333', padding: '6px 12px', fontSize: 11, fontWeight: 700, background: '#FFFDFA', ...tnum }}>CRM · since Jul 5</span>
          <span style={{ border: '1px solid #333333', padding: '6px 12px', fontSize: 11, fontWeight: 700, background: LATTE, ...tnum }}>Events · since {eventsSinceLabel}</span>
          <a href="/api/admin/export.csv" style={{ padding: '8px 15px', fontSize: 12, fontWeight: 700, background: '#333333', color: '#FFFDFA' }}>Export csv ↗</a>
        </div>
      </header>

      <div style={{ padding: '28px 36px 44px' }}>
        {/* Launch cohort strip — CRM truth since Jul 5 */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid #333333', background: '#FFFFFF', marginBottom: 24 }}>
          {[
            { label: 'Quiz completed', n: fmt(launchCompleted), sub: `${fmt(launchPretracking)} before tracking` },
            { label: 'Net-new paid', n: fmt(launchPaid), sub: 'charged after the quiz' },
            { label: 'Completed → paid', n: `${launchCvr.toFixed(1)}%`, sub: 'launch conversion' },
          ].map((c, i) => (
            <div key={c.label} style={{ padding: '18px 22px', borderLeft: i > 0 ? '1px solid #333333' : 'none' }}>
              <div style={eyebrow}>{c.label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: INK, lineHeight: 1, marginTop: 10, ...tnum }}>{c.n}</div>
              <div style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Hero: horizontal funnel */}
        <div style={{ border: '2px solid #333333', background: '#FFFFFF' }}>
          <div className="flex items-baseline justify-between" style={{ padding: '12px 20px', background: LATTE, borderBottom: '1px solid #333333' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>On-page funnel · since tracking ({eventsSinceLabel})</span>
            <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>unique people per station · band height on a square-root scale so the tail stays readable</span>
          </div>
          <div style={{ padding: '18px 24px 6px' }}>
            <svg viewBox="0 0 1060 340" style={{ width: '100%', display: 'block' }} preserveAspectRatio="xMidYMid meet">
              {segs.map((g, i) => <polygon key={i} points={g.pts} fill={g.fill} />)}
              {stations.map((s, i) => (
                <rect key={i} x={FX[i]} y={(FCY - fh[i] / 2 - 6).toFixed(1)} width={FBW} height={(fh[i] + 12).toFixed(1)} fill={s.last ? '#62A758' : '#333333'} />
              ))}
              {stations.map((s, i) => {
                const end = i === stations.length - 1
                return (
                  <g key={`t${i}`}>
                    <text x={end ? 1038 : FX[i]} y={16} textAnchor={end ? 'end' : 'start'} fill={MUTE} style={{ font: '700 10.5px Inter,sans-serif', letterSpacing: '0.06em' }}>{s.label}</text>
                    <text x={end ? 1038 : FX[i]} y={38} textAnchor={end ? 'end' : 'start'} fill={s.last ? '#62A758' : INK} style={{ font: '800 21px Inter,sans-serif' }}>{fmt(s.n)}</text>
                  </g>
                )
              })}
              {segs.map((g, i) => (
                <g key={`r${i}`}>
                  <text x={g.midX} y={176} textAnchor="middle" fill={g.darkLabel ? '#046BB1' : '#FFFDFA'} style={{ font: '800 14px Inter,sans-serif' }}>{g.rate.toFixed(0)}%</text>
                  <text x={g.midX} y={196} textAnchor="middle" fill={g.darkLabel ? '#6B6B6B' : 'rgba(255,253,250,0.75)'} style={{ font: '500 9.5px Inter,sans-serif' }}>continue</text>
                  <text x={g.midX} y={322} textAnchor="middle" fill="#8A8375" style={{ font: '700 11px Inter,sans-serif' }}>−{fmt(g.drop)} · {DROP_CAPTIONS[i]}</text>
                </g>
              ))}
            </svg>
          </div>
          <div className="flex flex-wrap" style={{ borderTop: `1px solid ${HAIR}`, padding: '10px 20px', columnGap: 28, rowGap: 6, fontSize: 11.5, color: '#6B6B6B' }}>
            <span>Overall landing → paid: <strong style={{ color: '#BE3B3B', ...tnum }}>{overallPct.toFixed(1)}%</strong></span>
            <span>Completed → paid: <strong style={{ color: INK, ...tnum }}>{launchCvr.toFixed(1)}%</strong></span>
            <span>Result page opens: <strong style={{ color: INK, ...tnum }}>{fmt(resultOpens)}</strong> · tracked separately, revisits and shared links inflate it</span>
            <span>Net-new paid in this slice: <strong style={{ color: INK, ...tnum }}>{fmt(trackedPaid)}</strong> of the {fmt(launchPaid)} launch total</span>
          </div>
        </div>

        {/* CTA by placement + completions by source */}
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 20, marginTop: 24 }}>
          <div style={{ border: '1px solid #333333', background: '#FFFFFF' }}>
            <div className="flex items-baseline justify-between" style={{ padding: '12px 16px', background: LATTE, borderBottom: '1px solid #333333' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>CTA view → click by placement</span>
              <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>unique viewers vs clickers</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 80px 76px 62px', ...th, borderBottom: `1px solid ${HAIR}`, padding: '0 16px' }}>
              <span style={{ padding: '8px 0' }}>Placement</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Viewers</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Clickers</span><span style={{ padding: '8px 0', textAlign: 'right' }}>CTR</span>
            </div>
            {placements.length === 0 && <p style={{ padding: '10px 16px', fontSize: 12, color: MUTE }}>No placement events yet.</p>}
            {placements.map(p => (
              <div key={p.pl} className="grid items-center hover:bg-[#FEF7E7]" style={{ gridTemplateColumns: '1fr 80px 76px 62px', fontSize: 12, borderBottom: `1px solid ${ROWHAIR}`, padding: '0 16px' }}>
                <span className="flex items-center" style={{ padding: '8px 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: INK, gap: 8, minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.pl}</span>
                  {bestCtrPl?.pl === p.pl && <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: '#E7B02F', color: '#333333', padding: '1px 6px', flexShrink: 0 }}>Best</span>}
                </span>
                <span style={{ padding: '8px 0', textAlign: 'right', ...tnum }}>{p.views > 0 ? fmt(p.views) : '–'}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, ...tnum }}>{fmt(p.clicks)}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: '#046BB1', ...tnum }}>{p.views > 0 ? `${((p.clicks / p.views) * 100).toFixed(1)}%` : '–'}</span>
              </div>
            ))}
            <p style={{ padding: '8px 16px 10px', fontSize: 10.5, color: MUTE }}>Viewers accrue from when impression tracking shipped; &ndash; means the placement predates it.</p>
          </div>

          <div style={{ border: '1px solid #333333', background: '#FFFFFF' }}>
            <div className="flex items-baseline justify-between" style={{ padding: '12px 16px', background: LATTE, borderBottom: '1px solid #333333' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Completions → paid, by source</span>
              <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>submissions = reliable attribution</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 84px 90px 62px', ...th, borderBottom: `1px solid ${HAIR}`, padding: '0 16px' }}>
              <span style={{ padding: '8px 0' }}>Source</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Completed</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Net-new</span><span style={{ padding: '8px 0', textAlign: 'right' }}>CVR</span>
            </div>
            {utmRows.length === 0 && <p style={{ padding: '10px 16px', fontSize: 12, color: MUTE }}>No submissions in the window.</p>}
            {utmRows.map(([k, v]) => (
              <div key={k} className="grid items-center hover:bg-[#FEF7E7]" style={{ gridTemplateColumns: '1fr 84px 90px 62px', fontSize: 12, borderBottom: `1px solid ${ROWHAIR}`, padding: '0 16px' }}>
                <span style={{ padding: '8px 0', color: INK, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', ...tnum }}>{fmt(v.subs)}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, ...tnum }}>{fmt(v.paid)}</span>
                <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: '#046BB1', ...tnum }}>{v.subs > 0 ? `${((v.paid / v.subs) * 100).toFixed(1)}%` : '–'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Viral loop chain */}
        <div className="flex items-stretch flex-wrap" style={{ border: '1px solid #333333', background: '#FFFFFF', marginTop: 20 }}>
          <div className="flex items-center" style={{ padding: '14px 20px', background: '#333333' }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#E7B02F' }}>Viral loop</span>
          </div>
          {[
            { n: viral.shares, label: 'shares clicked' },
            { n: viral.passViews, label: 'pass views' },
            { n: viral.takers, label: 'takers via share' },
            { n: viral.paid, label: 'net-new paid' },
          ].map((v, i, arr) => (
            <div key={v.label} className="flex items-center" style={{ flex: 1, gap: 14, padding: '14px 20px', borderLeft: `1px solid ${HAIR}`, minWidth: 130 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: INK, lineHeight: 1, ...tnum }}>{fmt(v.n)}</div>
                <div style={{ fontSize: 10.5, color: MUTE, marginTop: 4 }}>{v.label}</div>
              </div>
              {i < arr.length - 1 && <span style={{ marginLeft: 'auto', color: '#C4BDB2', fontSize: 15 }}>→</span>}
            </div>
          ))}
          <div className="flex items-center" style={{ padding: '0 20px 0 4px' }}>
            <a href="/admin/referrers" style={{ fontSize: 11, color: '#046BB1', fontWeight: 700, maxWidth: 190, lineHeight: 1.4 }} className="hover:underline">
              {viral.paid} of the {fmt(launchPaid)} net-new paid came through shared passes · who referred who →
            </a>
          </div>
        </div>

        {/* UX health · Clarity */}
        <div style={{ border: '1px solid #333333', background: '#FFFFFF', marginTop: 20 }}>
          <div className="flex items-baseline justify-between flex-wrap" style={{ padding: '12px 16px', background: LATTE, borderBottom: '1px solid #333333', gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>UX health · Clarity</span>
            <span className="inline-flex items-center" style={{ gap: 10 }}>
              <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>
                {ux.snapshotDays || 0} daily snapshot{ux.snapshotDays === 1 ? '' : 's'}{ux.lastFetched ? ` · last pull ${new Date(ux.lastFetched).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
              <ClarityPullNow />
            </span>
          </div>
          {uxRows.length === 0 ? (
            <p style={{ padding: '12px 16px', fontSize: 12.5, color: MUTE }}>
              No snapshots yet. The cron pulls daily at 06:30 UTC once CLARITY_API_TOKEN is set on Vercel, or hit Pull now for the trailing day.
            </p>
          ) : (
            <>
              <div className="grid" style={{ gridTemplateColumns: 'minmax(90px,1fr) 84px 100px 60px 60px 96px 84px', ...th, borderBottom: `1px solid ${HAIR}`, padding: '0 16px' }}>
                <span style={{ padding: '8px 0' }}>Page</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Sessions</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Scroll depth</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Rage</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Dead</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Quick-backs</span><span style={{ padding: '8px 0', textAlign: 'right' }}>JS errors</span>
              </div>
              {uxRows.map(r => (
                <div key={r.url} className="grid items-center hover:bg-[#FEF7E7]" style={{ gridTemplateColumns: 'minmax(90px,1fr) 84px 100px 60px 60px 96px 84px', fontSize: 12, borderBottom: `1px solid ${ROWHAIR}`, padding: '0 16px' }}>
                  <span style={{ padding: '8px 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: INK }} title={r.url}>{uxPath(r.url)}</span>
                  <span style={{ padding: '8px 0', textAlign: 'right', ...tnum }}>{fmt(r.sessions)}</span>
                  <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: 700, color: '#046BB1', ...tnum }}>{r.scrollDepth === null ? '–' : `${r.scrollDepth}%`}</span>
                  <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: r.rage > 0 ? 800 : 400, color: r.rage > 0 ? '#BE3B3B' : undefined, ...tnum }}>{r.rage}</span>
                  <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: r.dead > 0 ? 800 : 400, color: r.dead > 0 ? '#BE593B' : undefined, ...tnum }}>{r.dead}</span>
                  <span style={{ padding: '8px 0', textAlign: 'right', ...tnum }}>{r.quickback}</span>
                  <span style={{ padding: '8px 0', textAlign: 'right', fontWeight: r.scriptErrors > 0 ? 800 : 400, color: r.scriptErrors > 0 ? '#BE3B3B' : undefined, ...tnum }}>{r.scriptErrors}</span>
                </div>
              ))}
              <p style={{ padding: '8px 16px 10px', fontSize: 10.5, color: MUTE }}>Recordings and heatmaps stay in the Clarity dashboard.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
