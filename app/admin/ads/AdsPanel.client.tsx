'use client'

import { useEffect, useMemo, useState } from 'react'

interface SourceRow {
  source: string; paid: boolean
  takers: number; sawResult: number; clicked: number; buyers: number
  clickRate: number; buyRate: number
}
interface Payload {
  days: number
  rows: SourceRow[]
  economics: { trialUsd: number; annualUsd: number; renewalRate: number | null; ltv: number; ltvIsFloor: boolean; note: string }
  adsAppUrl: string | null
}

const INK = '#333333', RICH = '#1A1A1A', MUTE = '#9C9C9C', GOOD = '#2E7D32', BAD = '#C0392B'
const pct = (n: number) => `${(n * 100).toFixed(n < 0.01 && n > 0 ? 2 : 1)}%`
const usd = (n: number) => `$${n.toFixed(2)}`

export default function AdsPanel() {
  const [data, setData] = useState<Payload | null>(null)
  const [days, setDays] = useState(30)
  const [err, setErr] = useState<string | null>(null)
  // Spend is not in our database — LinkedIn owns it, and the token that could
  // read it is a per-browser cookie in the ads app. So it is entered here, and
  // everything downstream is computed honestly from it.
  const [spend, setSpend] = useState<string>('666.74')

  useEffect(() => {
    setData(null)
    fetch(`/api/admin/ads?days=${days}`)
      .then(r => r.json())
      .then(d => (d.error ? setErr(d.error) : setData(d)))
      .catch(e => setErr(String(e)))
  }, [days])

  const ltv = data?.economics.ltv ?? 0
  const paidRows = useMemo(() => (data?.rows ?? []).filter(r => r.paid && r.takers > 0), [data])
  const spendNum = Number(spend) || 0
  const paidTakers = paidRows.reduce((a, r) => a + r.takers, 0)
  const paidBuyers = paidRows.reduce((a, r) => a + r.buyers, 0)
  const costPerTaker = paidTakers > 0 ? spendNum / paidTakers : 0
  const cac = paidBuyers > 0 ? spendNum / paidBuyers : null
  // The bar: at this cost per taker, what share of takers must buy to wash its face.
  const breakEvenRate = ltv > 0 ? costPerTaker / ltv : 0
  const actualRate = paidTakers > 0 ? paidBuyers / paidTakers : 0

  if (err) return <p style={{ color: BAD }}>Failed to load: {err}</p>
  if (!data) return <p style={{ color: MUTE }}>Loading…</p>

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            style={{
              padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              border: `2px solid ${INK}`, background: days === d ? INK : 'transparent',
              color: days === d ? '#FFFDFA' : INK,
            }}>{d}d</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: MUTE }}>{data.economics.note}</span>
      </div>

      {/* ── The bar ─────────────────────────────────────────────────────── */}
      <div style={{ border: `3px solid ${INK}`, padding: 20, marginBottom: 24, background: '#FFFDFA' }}>
        <div className="flex items-baseline gap-3 mb-3">
          <h2 style={{ fontSize: 17, fontWeight: 800, color: RICH, margin: 0 }}>Does paid wash its face?</h2>
          <label style={{ marginLeft: 'auto', fontSize: 12.5, color: MUTE }}>
            spend over {days}d&nbsp;
            <input value={spend} onChange={e => setSpend(e.target.value)} inputMode="decimal"
              style={{ width: 92, border: `2px solid ${INK}`, padding: '3px 7px', fontSize: 13, fontWeight: 700 }} />
          </label>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          {[
            ['LTV per buyer', usd(ltv), data.economics.ltvIsFloor ? 'floor, no renewals yet' : `${pct(data.economics.renewalRate ?? 0)} renew`],
            ['Cost per quiz taker', usd(costPerTaker), `${paidTakers} paid takers`],
            ['Actual CAC', cac === null ? 'no buyers' : usd(cac), `${paidBuyers} buyer${paidBuyers === 1 ? '' : 's'}`],
            ['Break-even buy rate', pct(breakEvenRate), 'of takers must buy'],
            ['Actual buy rate', pct(actualRate), actualRate >= breakEvenRate ? 'clears the bar' : 'below the bar'],
          ].map(([label, value, sub]) => (
            <div key={label as string}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTE, fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 23, fontWeight: 800, color: label === 'Actual buy rate' ? (actualRate >= breakEvenRate ? GOOD : BAD) : RICH, lineHeight: 1.15 }}>{value}</div>
              <div style={{ fontSize: 11, color: MUTE }}>{sub}</div>
            </div>
          ))}
        </div>

        {breakEvenRate > 0 && (
          <p style={{ marginTop: 14, fontSize: 13, lineHeight: 1.5, color: actualRate >= breakEvenRate ? GOOD : BAD, fontWeight: 600 }}>
            {actualRate >= breakEvenRate
              ? `Paid is profitable: ${pct(actualRate)} of takers buy against a ${pct(breakEvenRate)} bar`
              : `Paid is losing money: it needs ${pct(breakEvenRate)} of takers to buy and gets ${pct(actualRate)}, a ${(breakEvenRate / Math.max(actualRate, 1e-9)).toFixed(0)}x gap. At this buy rate a taker is only worth ${usd(ltv * actualRate)}, and you are paying ${usd(costPerTaker)}.`}
          </p>
        )}
      </div>

      {/* ── Every source against that same bar ──────────────────────────── */}
      <h2 style={{ fontSize: 15, fontWeight: 800, color: RICH, marginBottom: 8 }}>Every source, same bar</h2>
      <table className="w-full" style={{ fontSize: 12.5, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${INK}`, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', color: MUTE }}>
            <th className="text-left py-1.5">Source</th>
            <th className="text-right py-1.5">Takers</th>
            <th className="text-right py-1.5">Saw result</th>
            <th className="text-right py-1.5">Clicked</th>
            <th className="text-right py-1.5">Click rate</th>
            <th className="text-right py-1.5">Buyers</th>
            <th className="text-right py-1.5">Buy rate</th>
            <th className="text-right py-1.5">Worth per taker</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.filter(r => r.takers >= 5).map(r => (
            <tr key={r.source} style={{ borderBottom: '1px solid #EEE' }}>
              <td className="py-1.5" style={{ fontWeight: r.paid ? 800 : 500 }}>
                {r.source}{r.paid && <span style={{ marginLeft: 6, fontSize: 9.5, background: INK, color: '#FFFDFA', padding: '1px 5px', fontWeight: 700 }}>PAID</span>}
              </td>
              <td className="text-right tabular-nums">{r.takers}</td>
              <td className="text-right tabular-nums">{r.sawResult}</td>
              <td className="text-right tabular-nums">{r.clicked}</td>
              <td className="text-right tabular-nums">{pct(r.clickRate)}</td>
              <td className="text-right tabular-nums">{r.buyers}</td>
              <td className="text-right tabular-nums font-bold" style={{ color: r.buyRate >= breakEvenRate ? GOOD : r.paid ? BAD : INK }}>{pct(r.buyRate)}</td>
              <td className="text-right tabular-nums">{usd(ltv * r.buyRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>
        &ldquo;Worth per taker&rdquo; is LTV x buy rate, the most you could pay for one visitor from that
        source and still break even. Sources under 5 takers are hidden. Free sources are shown for
        comparison, the bar only binds on paid ones.
      </p>

      <AdsEmbed url={data.adsAppUrl} />

      <div style={{ marginTop: 24, borderTop: `2px solid ${INK}`, paddingTop: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: RICH, marginBottom: 6 }}>Manage campaigns</h2>
        <p style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.6, marginBottom: 10 }}>
          Spend, campaigns and audiences live in the ads app, which holds the LinkedIn operator
          session. This screen owns the half LinkedIn cannot see, what those clicks did after they
          landed.
        </p>
        <div className="flex flex-wrap gap-2">
          {data.adsAppUrl
            ? [['Campaigns', '/'], ['Insights', '/insights'], ['Audiences', '/audiences'], ['Strategy', '/strategy']].map(([label, path]) => (
                <a key={label} href={`${data.adsAppUrl!.replace(/\/$/, '')}${path}`} target="_blank" rel="noreferrer"
                  style={{ border: `2px solid ${INK}`, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, color: INK, textDecoration: 'none' }}>
                  {label} ↗
                </a>
              ))
            : <span style={{ fontSize: 12.5, color: BAD }}>Set NEXT_PUBLIC_ADS_APP_URL to link through to the ads app</span>}
          <a href="https://www.linkedin.com/campaignmanager/" target="_blank" rel="noreferrer"
            style={{ border: `2px solid ${INK}`, padding: '5px 12px', fontSize: 12.5, fontWeight: 700, color: INK, textDecoration: 'none' }}>
            LinkedIn Campaign Manager ↗
          </a>
        </div>
      </div>
    </div>
  )
}

/**
 * The ads app, embedded.
 *
 * The constraint that decides this component: every auth cookie in the ads app
 * is sameSite="lax", and a browser does not send Lax cookies into a CROSS-SITE
 * iframe. "Site" means the registrable domain, so framing ads.thecentral.ai
 * from quiz.thecentral.ai works and the LinkedIn session comes with it, while
 * framing a *.vercel.app URL silently renders a logged-out app whose every call
 * 401s. That failure looks like a broken integration rather than a cookie rule,
 * so this checks the host up front and says which case you are in instead of
 * showing an empty frame.
 */
function AdsEmbed({ url }: { url: string | null }) {
  const [open, setOpen] = useState(false)
  if (!url) return null

  let sameSite = false
  let host = ''
  try {
    host = new URL(url).hostname
    const site = (h: string) => h.split('.').slice(-2).join('.')
    sameSite = typeof window !== 'undefined' && site(host) === site(window.location.hostname)
  } catch { /* malformed URL falls through to the warning */ }

  return (
    <div style={{ marginTop: 24, borderTop: `2px solid ${INK}`, paddingTop: 14 }}>
      <div className="flex items-center gap-3 mb-2">
        <h2 style={{ fontSize: 15, fontWeight: 800, color: RICH, margin: 0 }}>The ads app, in here</h2>
        <button onClick={() => setOpen(o => !o)}
          style={{ border: `2px solid ${INK}`, padding: '3px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: open ? INK : 'transparent', color: open ? '#FFFDFA' : INK }}>
          {open ? 'hide' : 'show'}
        </button>
        <span style={{ fontSize: 11.5, color: MUTE }}>{host}</span>
      </div>

      {!sameSite && (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: BAD, marginBottom: 8 }}>
          <strong>{host}</strong> is a different site from this admin, and the ads app authenticates
          with sameSite=lax cookies, which browsers will not send into a cross-site frame. Embedded
          here it would render logged out and every LinkedIn call would 401. Put it on a
          thecentral.ai subdomain and this frame starts working, session and all. Until then use the
          buttons below, which open it in its own tab where its cookies apply normally.
        </p>
      )}

      {open && sameSite && (
        <iframe src={url} title="LinkedIn ads app"
          style={{ width: '100%', height: 780, border: `2px solid ${INK}`, background: '#fff' }} />
      )}
    </div>
  )
}
