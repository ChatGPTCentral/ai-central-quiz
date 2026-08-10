// Checkout Recovery — did the payment-moment email actually add value?
//
// Same evidentiary setup as Pass Recovery, one page over: of every quiz
// completer who did not buy within the hour, ZERO ever bought later on their
// own. Checkout clickers are a subset of that population, so an enrolled
// clicker who pays after the email is net new by construction. The baseline is
// recomputed live below; the day it stops being zero this page says so.
//
// The two sequences are mutually exclusive by design (first enrolment stamp
// wins), so a convert here was NOT also inside Pass Recovery — the attribution
// is clean per person, not shared.
//
// THE KILL NUMBER, written before launch: if fewer than 2% of enrolled have
// paid once 100 people are enrolled, the sequence comes out. Prediction was
// 3-5% (about +4-6 paid a week).

import { createClient } from '@supabase/supabase-js'
import { readLtvModel } from '@/lib/ltv-settings'
import { ltvFrom } from '@/lib/ltv-model'

export const dynamic = 'force-dynamic'

const INK = '#1A1A1A'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const MUTE = '#7A7A7A'

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

interface Enrolled {
  id: string
  email: string | null
  name: string | null
  stage: string | null
  checkout_recovery_enrolled_at: string
  stripe_first_charge_at: string | null
}

async function load() {
  const c = sb()

  const { data: enrRows, error: enrErr } = await c
    .from('submissions')
    .select('id, email, name, stage, checkout_recovery_enrolled_at, stripe_first_charge_at')
    .not('checkout_recovery_enrolled_at', 'is', null)
    .order('checkout_recovery_enrolled_at', { ascending: false })
    .limit(5000)
  if (enrErr) throw new Error(enrErr.message)
  const enrolled = (enrRows ?? []) as Enrolled[]

  // The money number. Candidates enter with NO charge on record, so any charge
  // at all after enrolment is a recovery.
  const converted = enrolled.filter(
    r => r.stripe_first_charge_at && r.stripe_first_charge_at > r.checkout_recovery_enrolled_at,
  )

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const enrolled7d = enrolled.filter(r => r.checkout_recovery_enrolled_at > weekAgo).length

  // Return traffic, tagged by CHECKOUT_RECOVERY_UTM on the result_url merge field.
  const uniq = { visits: new Set<string>(), clicks: new Set<string>() }
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data, error } = await c
      .from('funnel_events')
      .select('event, anon_id, session_id')
      .eq('utm_source', 'checkrec')
      .range(offset, offset + 999)
    if (error) break
    if (!data || data.length === 0) break
    for (const r of data as { event: string; anon_id: string | null; session_id: string | null }[]) {
      const who = r.anon_id || r.session_id
      if (!who) continue
      uniq.visits.add(who)
      if (r.event === 'checkout_click') uniq.clicks.add(who)
    }
    if (data.length < 1000) break
  }

  // Baseline, recomputed live: completers older than 7 days, never enrolled in
  // EITHER recovery sequence, who did not buy inside 60 minutes — how many ever
  // bought at all. If this stops being 0, "net new by construction" is void.
  const { data: baseRows } = await c
    .from('submissions')
    .select('created_at, stripe_first_charge_at, pass_recovery_enrolled_at, checkout_recovery_enrolled_at')
    .eq('population', 'quiz_current')
    .lt('created_at', new Date(Date.now() - 7 * 864e5).toISOString())
    .limit(5000)
  const base = (baseRows ?? []) as {
    created_at: string; stripe_first_charge_at: string | null
    pass_recovery_enrolled_at: string | null; checkout_recovery_enrolled_at: string | null
  }[]
  const baseAbandoners = base.filter(r => {
    if (r.pass_recovery_enrolled_at || r.checkout_recovery_enrolled_at) return false
    if (!r.stripe_first_charge_at) return true
    return new Date(r.stripe_first_charge_at).getTime() > new Date(r.created_at).getTime() + 3600_000
  })
  const baseLate = baseAbandoners.filter(r => r.stripe_first_charge_at).length

  const ltv = await readLtvModel()

  return {
    enrolled, enrolled7d, converted,
    visits: uniq.visits.size, clicks: uniq.clicks.size,
    baseAbandoners: baseAbandoners.length, baseLate,
    ltv,
  }
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      border: `3px solid ${INK}`, background: accent ? INK : CREAM,
      padding: '16px 18px', boxShadow: `5px 6px 0 ${accent ? FULVOUS : INK}`, minWidth: 0,
    }}>
      <div className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: '.16em', color: accent ? FULVOUS : MUTE, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, marginTop: 6, color: accent ? CREAM : INK, letterSpacing: '-0.03em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: accent ? '#C9C9C9' : MUTE, marginTop: 4, lineHeight: 1.35 }}>{sub}</div>}
    </div>
  )
}

export default async function CheckoutRecoveryPage() {
  let d: Awaited<ReturnType<typeof load>> | null = null
  let err: string | null = null
  try { d = await load() } catch (e) { err = e instanceof Error ? e.message : String(e) }

  if (err || !d) {
    return <div style={{ padding: 24 }}><h1 style={{ fontWeight: 800 }}>Checkout Recovery</h1><p style={{ color: '#B00' }}>{err}</p></div>
  }

  const revenueNow = d.converted.length * d.ltv.trialUsd
  const revenueProjected = d.converted.length * ltvFrom(d.ltv)
  const baselineHolds = d.baseLate === 0
  const pct = (n: number, of: number) => (of > 0 ? `${((100 * n) / of).toFixed(1)}%` : '—')

  // The pre-registered kill test, judged live.
  const rate = d.enrolled.length > 0 ? d.converted.length / d.enrolled.length : null
  const killReadable = d.enrolled.length >= 100
  const killMet = killReadable && rate !== null && rate < 0.02

  return (
    <div style={{ padding: '22px 24px 60px', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Checkout Recovery</h1>
      <p style={{ fontSize: 14, color: MUTE, marginTop: 6, maxWidth: 720, lineHeight: 1.5 }}>
        The payment-moment email, for people who clicked the buy button and walked at the form.
        Mutually exclusive with Pass Recovery, so every conversion below belongs to this sequence alone.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginTop: 22 }}>
        <Stat label="Enrolled" value={d.enrolled.length.toLocaleString()} sub={`${d.enrolled7d} in the last 7 days`} />
        <Stat label="Came back" value={d.visits.toLocaleString()} sub={`${pct(d.visits, d.enrolled.length)} of enrolled, via utm_source=checkrec`} />
        <Stat label="Clicked checkout again" value={d.clicks.toLocaleString()} sub={`${pct(d.clicks, d.visits)} of returners`} />
        <Stat accent label="Paid — net new" value={d.converted.length.toLocaleString()} sub={`${pct(d.converted.length, d.enrolled.length)} of enrolled`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
        <Stat label="Revenue booked" value={`$${revenueNow.toFixed(2)}`} sub={`${d.converted.length} x $${d.ltv.trialUsd.toFixed(2)} trial`} />
        <Stat
          label="Projected LTV"
          value={`$${revenueProjected.toFixed(2)}`}
          sub={`at the saved LTV model ($${ltvFrom(d.ltv).toFixed(2)}/trial). Edit it on the Simulator page.`}
        />
      </div>

      {/* The pre-registered prediction and kill number, judged in public. */}
      <div style={{
        marginTop: 22, border: `3px solid ${killMet ? '#B00' : INK}`,
        background: killMet ? '#FFF0F0' : CREAM, padding: '14px 16px', maxWidth: 820,
      }}>
        <div className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: '.16em', color: killMet ? '#B00' : MUTE, fontWeight: 700 }}>
          The prediction — written before launch
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 7, color: INK }}>
          3-5% of enrolled buy within 7 days. <strong>Kill rule:</strong> under 2% once 100 are enrolled.{' '}
          {!killReadable ? (
            <>Not readable yet — {d.enrolled.length} of the 100 enrolled it takes to judge.</>
          ) : killMet ? (
            <><strong>The kill condition is met</strong> ({pct(d.converted.length, d.enrolled.length)} of {d.enrolled.length}). Take the sequence out.</>
          ) : (
            <>Currently {pct(d.converted.length, d.enrolled.length)} of {d.enrolled.length} — the sequence stays.</>
          )}
        </p>
      </div>

      {/* The validity check. If this ever goes non-zero the headline claim is void. */}
      <div style={{
        marginTop: 16, border: `3px solid ${baselineHolds ? INK : '#B00'}`,
        background: baselineHolds ? CREAM : '#FFF0F0', padding: '14px 16px', maxWidth: 820,
      }}>
        <div className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: '.16em', color: baselineHolds ? MUTE : '#B00', fontWeight: 700 }}>
          Validity check — the counterfactual
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 7, color: INK }}>
          {baselineHolds ? (
            <>
              Of <strong>{d.baseAbandoners.toLocaleString()}</strong> completers never enrolled in any recovery
              sequence who did not buy within 60 minutes, <strong>{d.baseLate}</strong> ever bought later.
              The counterfactual is zero, so &ldquo;net new&rdquo; above is a count, not an estimate.
            </>
          ) : (
            <>
              <strong>The baseline is no longer zero.</strong> {d.baseLate} of {d.baseAbandoners.toLocaleString()} never-enrolled
              abandoners bought late on their own ({pct(d.baseLate, d.baseAbandoners)}). The headline number above
              overstates the gain by roughly that rate and this page needs a holdout to stay honest.
            </>
          )}
        </p>
      </div>

      {d.converted.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 800, marginTop: 30, color: INK }}>The conversions</h2>
          <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${INK}` }}>
                {['Person', 'Stage', 'Enrolled', 'Paid', 'Gap'].map(h => (
                  <th key={h} className="font-mono uppercase" style={{ textAlign: 'left', padding: '7px 8px', fontSize: 10, letterSpacing: '.12em', color: MUTE }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.converted.map(r => {
                const gapH = (new Date(r.stripe_first_charge_at!).getTime() - new Date(r.checkout_recovery_enrolled_at).getTime()) / 3600_000
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #E4E0D8' }}>
                    <td style={{ padding: '7px 8px' }}>{r.name || r.email || r.id.slice(0, 8)}</td>
                    <td style={{ padding: '7px 8px', color: MUTE }}>{r.stage ?? '—'}</td>
                    <td style={{ padding: '7px 8px', color: MUTE }}>{r.checkout_recovery_enrolled_at.slice(0, 16).replace('T', ' ')}</td>
                    <td style={{ padding: '7px 8px', color: MUTE }}>{r.stripe_first_charge_at!.slice(0, 16).replace('T', ' ')}</td>
                    <td style={{ padding: '7px 8px', fontWeight: 700 }}>{gapH < 48 ? `${gapH.toFixed(1)}h` : `${(gapH / 24).toFixed(1)}d`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {d.enrolled.length === 0 && (
        <p style={{ marginTop: 26, fontSize: 13.5, color: MUTE, maxWidth: 720, lineHeight: 1.55 }}>
          Nobody enrolled yet. The automation is a draft in beehiiv and the cron is inert until
          <code style={{ background: '#EFEAE0', padding: '1px 5px' }}>BEEHIIV_CHECKOUT_RECOVERY_ENABLED=true</code> is
          set in Vercel AND the project is redeployed. Publish the automation, set the variable, redeploy,
          and this fills in on its own.
        </p>
      )}
    </div>
  )
}
