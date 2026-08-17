// Every trial and its status — the owner's trials spreadsheet, live.
//
// Its own screen since 2026-08-16: it was section 3 of a five-section page
// and "deserves a place of its own" (owner). Same loader, same state
// machinery as /admin/revenue and /admin/revenue/recovery — one dataset,
// three views.

import TrialsTable, { type TrialRow } from '@/components/admin/TrialsTable.client'
import { fmtDay } from '@/lib/dates'
import {
  loadRevenueData, buildStateMachinery, inNoCardEra,
  STATE_LABEL, STATE_COLOR, ATTR_LABEL, type State,
} from '@/lib/revenue-shared'
import { classifyLedger } from '@/lib/trial-entries'

export const dynamic = 'force-dynamic'
export const revalidate = 60

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const LATTE = '#FEF7E7'

const navChip: React.CSSProperties = {
  padding: '6px 12px', fontSize: 11.5, fontWeight: 700,
  border: '2px solid #1A1A1A', background: '#FFFDFA', color: '#1A1A1A', textDecoration: 'none',
}

export default async function TrialsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  let d: Awaited<ReturnType<typeof loadRevenueData>> | null = null
  let err: string | null = null
  // NET money per trial (rule 6): the Total column sums the classifier's
  // netted emissions for the trial's own charge, its lifetime half, and its
  // claimed renewal — the same entries the money page and the matrix sum,
  // so this column can never disagree with them. The ledger's gross_cents
  // is deliberately not displayed anywhere (owner, 2026-08-17, twice:
  // "i only want to see the NET MONEY not the GROSS").
  const netByCharge = new Map<string, number>()
  const convertedIdBy = new Map<string, string | null>()
  try {
    d = await loadRevenueData()
    // Classified from the SAME single read as everything else on the page
    // (a second fetch can straddle the hourly sync's upsert and disagree).
    for (const t of d.ledger) convertedIdBy.set(t.charge_id, t.converted_charge_id ?? null)
    for (const e of classifyLedger(d.ledger, d.chargeRows, '2023-01-01').entries) {
      netByCharge.set(e.chargeId, (netByCharge.get(e.chargeId) ?? 0) + e.usd)
    }
  } catch (e) { err = e instanceof Error ? e.message : String(e) }
  if (err || !d) {
    return <div style={{ padding: 26 }}><h1 style={{ fontWeight: 800, fontSize: 24 }}>Trials</h1><p style={{ color: '#B00020' }}>{err}</p></div>
  }
  const netOf = (chargeId: string): number => {
    const cid = convertedIdBy.get(chargeId)
    return (netByCharge.get(chargeId) ?? 0)
      + (netByCharge.get(`${chargeId}-lt`) ?? 0)
      + (netByCharge.get(`${chargeId}-cost`) ?? 0)
      + (cid && cid !== chargeId
        ? (netByCharge.get(cid) ?? 0) + (netByCharge.get(`${cid}-cost`) ?? 0)
        : 0)
  }

  const L = d.ledger
  const { personOutcome, paysOffLedger, effState } = buildStateMachinery(d)

  const fState = (searchParams.state || '') as State | ''
  const fEra = searchParams.era ? Number(searchParams.era) : 0
  const fAttr = searchParams.attr || ''
  const includeIndia = searchParams.india === '1'
  const includeNoCard = searchParams.nocard === '1'
  const q = (searchParams.q || '').trim().toLowerCase()
  const limit = Math.min(2000, Math.max(50, Number(searchParams.limit) || 200))

  const L3 = L.filter(r => (includeIndia || r.country !== 'India') && (includeNoCard || !inNoCardEra(r)))
  const filtered = L3.filter(r =>
    (!fState || effState(r) === fState) &&
    (!fEra || r.era === fEra) &&
    (!fAttr || r.attribution === fAttr) &&
    (!q || r.person_key.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q)))

  const people = [...filtered].sort((a, b) => b.trial_at.localeCompare(a.trial_at)).slice(0, limit)
  const tableRows: TrialRow[] = people.map(r => {
    const st = effState(r)
    return {
      personNote: st === 'lapsed_covered' ? personOutcome.get(r.person_key) ?? paysOffLedger(r) : null,
      charge_id: r.charge_id, person_key: r.person_key, customer_id: r.customer_id,
      name: r.name, country: r.country, utm_source: r.utm_source,
      trial_at: r.trial_at, trial_cents: r.trial_cents, era: r.era, attribution: r.attribution,
      converted: r.converted, converted_at: r.converted_at, converted_cents: r.converted_cents,
      net_cents: Math.round(netOf(r.charge_id) * 100), lifetime_bundle: r.lifetime_bundle,
      derivedState: st, derivedLabel: STATE_LABEL[st], derivedColor: STATE_COLOR[st],
      override: d!.overrideBy.get(r.charge_id) ?? null,
    }
  })
  const counts: Record<State, number> = { converted: 0, lifetime: 0, lapsed: 0, lapsed_covered: 0, not_due: 0, refunded: 0, manual: 0 }
  for (const r of L3) counts[effState(r)]++
  const erasPresent = new Set(L.map(r => r.era))

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { state: fState || undefined, era: fEra ? String(fEra) : undefined, attr: fAttr || undefined, india: includeIndia ? '1' : undefined, nocard: includeNoCard ? '1' : undefined, q: q || undefined, ...patch }
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    const s = p.toString()
    return `/admin/revenue/trials${s ? `?${s}` : ''}`
  }
  const chip = (active: boolean): React.CSSProperties => ({
    display: 'inline-block', padding: '5px 10px', fontSize: 11.5, fontWeight: 700,
    border: `2px solid ${INK}`, background: active ? INK : '#FFFDFA', color: active ? LATTE : INK,
    textDecoration: 'none',
  })

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 1240 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Every trial &amp; its status</h1>
      <p style={{ fontSize: 12.5, color: MUTE, marginTop: 6, maxWidth: 860, lineHeight: 1.6 }}>
        Laid out like your trials spreadsheet: date, email, name, status, channel, source, country, payments. Status is
        editable and saves as you change it; &ldquo;Auto&rdquo; means the charges decide, your dropdown always wins, and
        your sheet&rsquo;s judgments import every morning. Each trial is in exactly one state, so the counts always add up
        to {L3.length.toLocaleString()}{includeIndia ? '' : ' (India hidden)'}. Last sync: {d.lastSyncedAt ? fmtDay(d.lastSyncedAt) : 'unknown'}.
      </p>
      <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 10 }}>
        <a href="/admin/revenue" style={navChip}>← Revenue</a>
        <a href="/admin/revenue/recovery" style={navChip}>Trial recovery →</a>
      </div>

      <div className="flex flex-wrap items-center" style={{ gap: 7, marginTop: 14 }}>
        <a href={qs({ state: undefined })} style={chip(!fState)}>All {L3.length}</a>
        {(['converted', 'lifetime', 'lapsed', 'lapsed_covered', 'not_due', 'refunded', 'manual'] as State[]).map(s => (
          <a key={s} href={qs({ state: fState === s ? undefined : s })} style={chip(fState === s)}>
            {STATE_LABEL[s]} {counts[s]}
          </a>
        ))}
        <span style={{ width: 12 }} />
        {d.eras.filter(e => erasPresent.has(e.era)).map(e => (
          <a key={e.era} href={qs({ era: fEra === e.era ? undefined : String(e.era) })} style={chip(fEra === e.era)}>
            Era {e.era}
          </a>
        ))}
        <span style={{ width: 12 }} />
        {Object.entries(ATTR_LABEL).map(([k, v]) => (
          <a key={k} href={qs({ attr: fAttr === k ? undefined : k })} style={chip(fAttr === k)}>{v}</a>
        ))}
        <span style={{ width: 12 }} />
        <a href={qs({ india: includeIndia ? undefined : '1' })} style={chip(includeIndia)}
          title="India is hidden by default: 0 of 43 due trials there ever renewed, which is why India is sold the lifetime.">
          {includeIndia ? 'India: shown' : 'India: hidden'}
        </a>
        <a href={qs({ nocard: includeNoCard ? undefined : '1' })} style={chip(includeNoCard)}
          title="Trials sold 2025-05-25 to 2025-06-21 saved no card and can never be one-click charged. The ledger and money keep them; this table hides them.">
          {includeNoCard ? 'No-card era: shown' : 'No-card era: hidden'}
        </a>
        <form method="get" action="/admin/revenue/trials#top" style={{ display: 'inline-flex', gap: 5, marginLeft: 12 }}>
          {fState && <input type="hidden" name="state" value={fState} />}
          {fEra ? <input type="hidden" name="era" value={String(fEra)} /> : null}
          {fAttr && <input type="hidden" name="attr" value={fAttr} />}
          {includeIndia && <input type="hidden" name="india" value="1" />}
          {includeNoCard && <input type="hidden" name="nocard" value="1" />}
          <input name="q" defaultValue={q} placeholder="search email or name…"
            style={{ border: `2px solid ${INK}`, background: '#FFFDFA', fontSize: 11.5, padding: '5px 9px', width: 190 }} />
          <button type="submit" style={{ border: `2px solid ${INK}`, background: INK, color: LATTE, fontSize: 11, fontWeight: 700, padding: '5px 10px', cursor: 'pointer' }}>Search</button>
          {q && <a href={qs({ q: undefined })} style={{ ...navChip, padding: '5px 9px', fontSize: 11 }}>×</a>}
        </form>
      </div>

      <TrialsTable rows={tableRows} initialOrder={d.colOrder} initialHidden={d.colHidden} />
    </div>
  )
}
