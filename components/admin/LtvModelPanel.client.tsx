'use client'

// The LTV model panel — fields, the LTV readout, and the measured-vs-assumed
// note. CONTROLLED: state lives in the simulator Workbench, because the chart
// below it and the funnel below that read the same model, and three panels
// with private copies of the economics was exactly the confusion the owner
// reported ("they do not talk to each other").
//
// Owner's formula:
//   LTV = trial + (year-1 renewal % x annual) + (year-2 renewal % x annual)
//
// Year 2 is a separate rate rather than year-1 squared on purpose: a second
// renewal is a different decision from the first, so compounding one rate
// would be a modelling assumption dressed up as arithmetic.

import { ltvFrom, type LtvModel } from '@/lib/ltv-model'

const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'
const GOOD = '#2E7D32'
const LATTE = '#FEF7E7'

const usd = (n: number) => `$${n.toFixed(2)}`

export default function LtvModelPanel({
  model,
  onChange,
  onSave,
  saving,
  savedAt,
  measuredYear1,
  measuredDue,
}: {
  model: LtvModel
  onChange: (m: LtvModel) => void
  onSave: () => void
  saving: boolean
  savedAt: string | null
  /** Trial→yearly from the owner's SHEET, mature months only. */
  measuredYear1: number | null
  /** How many mature trials that rate rests on. */
  measuredDue: number
}) {
  const ltv = ltvFrom(model)

  const field = (label: string, value: number, set: (n: number) => void, suffix: string, hint: string) => (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, marginBottom: 5 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number" step="0.01" min="0"
          value={Number.isFinite(value) ? value : 0}
          onChange={e => set(Number(e.target.value))}
          style={{ width: 92, border: `2px solid ${INK}`, padding: '5px 8px', fontSize: 14, fontWeight: 700, color: RICH }}
        />
        <span style={{ fontSize: 12.5, color: MUTE }}>{suffix}</span>
      </span>
      <span style={{ display: 'block', fontSize: 10.5, color: MUTE, marginTop: 4, lineHeight: 1.4 }}>{hint}</span>
    </label>
  )

  return (
    <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA' }}>
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: 10, padding: '12px 18px', background: LATTE, borderBottom: `1px solid ${INK}` }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>What a customer is worth</span>
        <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>
          drives the assumed forecast line below, and the Ads page break-even
        </span>
      </div>

      <div style={{ padding: 18 }}>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4" style={{ marginBottom: 16 }}>
          {field('Trial', model.trialUsd, n => onChange({ ...model, trialUsd: n }), 'USD', 'charged today')}
          {field('Annual', model.annualUsd, n => onChange({ ...model, annualUsd: n }), 'USD', 'bills a month after the trial')}
          {field('Year 1 renewal', Math.round(model.year1Pct * 100), n => onChange({ ...model, year1Pct: Math.min(1, Math.max(0, n / 100)) }), '%', 'trials that reach the first annual')}
          {field('Year 2 renewal', Math.round(model.year2Pct * 100), n => onChange({ ...model, year2Pct: Math.min(1, Math.max(0, n / 100)) }), '%', 'still paying a year later')}
        </div>

        <div className="flex items-baseline flex-wrap" style={{ gap: 14, padding: '12px 14px', border: `2px solid ${INK}`, background: '#FFFFFF', marginBottom: 12 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTE }}>LTV per trial</span>
          <span style={{ fontSize: 26, fontWeight: 800, color: GOOD, lineHeight: 1 }}>{usd(ltv)}</span>
          <span style={{ fontSize: 12, color: '#4A4A4A' }}>
            {usd(model.trialUsd)} + {Math.round(model.year1Pct * 100)}% x {usd(model.annualUsd)} + {Math.round(model.year2Pct * 100)}% x {usd(model.annualUsd)}
          </span>
          <button
            type="button" onClick={onSave} disabled={saving}
            style={{ marginLeft: 'auto', background: RICH, color: '#FEF7E7', border: 'none', padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {savedAt && <span style={{ fontSize: 11, color: GOOD }}>saved {savedAt}</span>}
        </div>

        <p style={{ fontSize: 12, color: '#4A4A4A', lineHeight: 1.5, margin: 0 }}>
          {measuredYear1 !== null && measuredDue > 0 ? (
            <>
              <strong style={{ color: RICH }}>Measured year 1: {(measuredYear1 * 100).toFixed(1)}%</strong>, from the trials
              sheet, mature months only, {measuredDue} trials. Your assumption is {Math.round(model.year1Pct * 100)}% —
              the chart below draws both, so the gap between belief and history stays visible.
            </>
          ) : (
            <>No mature trials yet, so year 1 is entirely an assumption.</>
          )}
          {' '}Year 2 has <strong style={{ color: RICH }}>no data at all</strong>: the product has not been on this price for two years.
        </p>
      </div>
    </div>
  )
}
