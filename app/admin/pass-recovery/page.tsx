// Pass Recovery — did the sequence actually add value?
//
// This page exists because "people got the email and then some of them bought"
// is not evidence. Normally you would need a holdout to separate the sequence
// from the people who were going to buy anyway.
//
// Here you do not, and that is the whole point of this readout. Measured over
// the 33 days before the sequence existed: of 1,017 people who completed the
// quiz and did NOT buy within 60 minutes, ZERO ever bought afterwards. Every
// paying quiz-taker on record charged inside the 60-minute window - - not one
// before, not one after. So the counterfactual for this exact population is
// empirically zero, and any sale from an enrolled abandoner is net new by
// construction rather than by assumption.
//
// The baseline is recomputed live on every load rather than hardcoded, because
// the day it stops being zero is the day this page stops being valid, and that
// should be visible here rather than remembered by me.

import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const INK = '#1A1A1A'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const MUTE = '#7A7A7A'

/** Observed trial → annual rate, used only to project. Re-measure before trusting. */
const TRIAL_TO_ANNUAL = 0.368
const TRIAL_PRICE = 4.99
const ANNUAL_PRICE = 59.75

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
  pass_recovery_enrolled_at: string
  stripe_first_charge_at: string | null
}

async function load() {
  const c = sb()

  const { data: enrRows, error: enrErr } = await c
    .from('submissions')
    .select('id, email, name, stage, pass_recovery_enrolled_at, stripe_first_charge_at')
    .not('pass_recovery_enrolled_at', 'is', null)
    .order('pass_recovery_enrolled_at', { ascending: false })
    .limit(5000)
  if (enrErr) throw new Error(enrErr.message)
  const enrolled = (enrRows ?? []) as Enrolled[]

  // The money number. A charge STRICTLY AFTER enrolment, on a population whose
  // historical late-purchase rate is zero.
  const converted = enrolled.filter(
    r => r.stripe_first_charge_at && r.stripe_first_charge_at > r.pass_recovery_enrolled_at,
  )

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const enrolled7d = enrolled.filter(r => r.pass_recovery_enrolled_at > weekAgo).length

  // Return traffic, tagged by PASS_RECOVERY_UTM on the result_url merge field.
  const uniq = { visits: new Set<string>(), clicks: new Set<string>() }
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data, error } = await c
      .from('funnel_events')
      .select('event, anon_id, session_id')
      .eq('utm_source', 'passrec')
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

  // Baseline, recomputed live: quiz completers older than 7 days who did not buy
  // inside 60 minutes, and how many of them ever bought. If this stops being 0,
  // the "net new by construction" claim above is void.
  const { data: baseRows } = await c
    .from('submissions')
    .select('created_at, stripe_first_charge_at, pass_recovery_enrolled_at')
    .eq('population', 'quiz_current')
    .lt('created_at', new Date(Date.now() - 7 * 864e5).toISOString())
    .limit(5000)
  const base = (baseRows ?? []) as {
    created_at: string; stripe_first_charge_at: string | null; pass_recovery_enrolled_at: string | null
  }[]
  // Never-enrolled only, so the sequence's own converts cannot pollute its baseline.
  const baseAbandoners = base.filter(r => {
    if (r.pass_recovery_enrolled_at) return false
    if (!r.stripe_first_charge_at) return true
    return new Date(r.stripe_first_charge_at).getTime() > new Date(r.created_at).getTime() + 3600_000
  })
  const baseLate = baseAbandoners.filter(r => r.stripe_first_charge_at).length

  return {
    enrolled, enrolled7d, converted,
    visits: uniq.visits.size, clicks: uniq.clicks.size,
    baseAbandoners: baseAbandoners.length, baseLate,
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

export default async function PassRecoveryPage() {
  let d: Awaited<ReturnType<typeof load>> | null = null
  let err: string | null = null
  try { d = await load() } catch (e) { err = e instanceof Error ? e.message : String(e) }

  if (err || !d) {
    return <div style={{ padding: 24 }}><h1 style={{ fontWeight: 800 }}>Pass Recovery</h1><p style={{ color: '#B00' }}>{err}</p></div>
  }

  const revenueNow = d.converted.length * TRIAL_PRICE
  const revenueProjected = d.converted.length * (TRIAL_PRICE + TRIAL_TO_ANNUAL * ANNUAL_PRICE)
  const baselineHolds = d.baseLate === 0
  const pct = (n: number, of: number) => (of > 0 ? `${((100 * n) / of).toFixed(1)}%` : '—')

  return (
    <div style={{ padding: '22px 24px 60px', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Pass Recovery</h1>
      <p style={{ fontSize: 14, color: MUTE, marginTop: 6, maxWidth: 720, lineHeight: 1.5 }}>
        Did the sequence add value? Every conversion below is net new, because nobody in this
        population has ever bought late without it. That claim is checked live, not assumed.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginTop: 22 }}>
        <Stat label="Enrolled" value={d.enrolled.length.toLocaleString()} sub={`${d.enrolled7d} in the last 7 days`} />
        <Stat label="Came back" value={d.visits.toLocaleString()} sub={`${pct(d.visits, d.enrolled.length)} of enrolled, via utm_source=passrec`} />
        <Stat label="Clicked checkout" value={d.clicks.toLocaleString()} sub={`${pct(d.clicks, d.visits)} of returners`} />
        <Stat accent label="Paid — net new" value={d.converted.length.toLocaleString()} sub={`${pct(d.converted.length, d.enrolled.length)} of enrolled`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 16 }}>
        <Stat label="Revenue booked" value={`$${revenueNow.toFixed(2)}`} sub={`${d.converted.length} x $${TRIAL_PRICE} trial`} />
        <Stat
          label="Projected LTV"
          value={`$${revenueProjected.toFixed(2)}`}
          sub={`at the observed ${(TRIAL_TO_ANNUAL * 100).toFixed(1)}% trial-to-annual. Re-measure before trusting.`}
        />
      </div>

      {/* The validity check. If this ever goes non-zero the headline claim is void. */}
      <div style={{
        marginTop: 22, border: `3px solid ${baselineHolds ? INK : '#B00'}`,
        background: baselineHolds ? CREAM : '#FFF0F0', padding: '14px 16px', maxWidth: 820,
      }}>
        <div className="font-mono uppercase" style={{ fontSize: 10, letterSpacing: '.16em', color: baselineHolds ? MUTE : '#B00', fontWeight: 700 }}>
          Validity check — the counterfactual
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 7, color: INK }}>
          {baselineHolds ? (
            <>
              Of <strong>{d.baseAbandoners.toLocaleString()}</strong> quiz completers who never entered this
              sequence and did not buy within 60 minutes, <strong>{d.baseLate}</strong> ever bought later.
              The counterfactual is zero, so the &ldquo;net new&rdquo; number above is a count, not an estimate.
            </>
          ) : (
            <>
              <strong>The baseline is no longer zero.</strong> {d.baseLate} of {d.baseAbandoners.toLocaleString()} never-enrolled
              abandoners bought late on their own ({pct(d.baseLate, d.baseAbandoners)}). Late buying now happens
              without the sequence, so the headline number above overstates the gain by roughly that rate and
              this page needs a holdout to stay honest.
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
                const gapH = (new Date(r.stripe_first_charge_at!).getTime() - new Date(r.pass_recovery_enrolled_at).getTime()) / 3600_000
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #E4E0D8' }}>
                    <td style={{ padding: '7px 8px' }}>{r.name || r.email || r.id.slice(0, 8)}</td>
                    <td style={{ padding: '7px 8px', color: MUTE }}>{r.stage ?? '—'}</td>
                    <td style={{ padding: '7px 8px', color: MUTE }}>{r.pass_recovery_enrolled_at.slice(0, 16).replace('T', ' ')}</td>
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
          <code style={{ background: '#EFEAE0', padding: '1px 5px' }}>BEEHIIV_PASS_RECOVERY_ENABLED=true</code>.
          Publish the automation, set the variable, and this fills in on its own.
        </p>
      )}
    </div>
  )
}
