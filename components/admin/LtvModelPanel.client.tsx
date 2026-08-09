'use client'

// The LTV model, owned here and consumed by /admin/ads.
//
// Owner's formula:
//   LTV = $4.99 trial + (year-1 renewal % x $59.75) + (year-2 renewal % x $59.75)
//
// The percentages are editable and SAVED, because they are assumptions we do
// not yet have the data to measure. Year 1 has 12 mature trials behind it and
// year 2 has none at all, since the product has not been on this price for two
// years. A page that prices advertising against a guess must say it is a guess,
// so the measured number sits next to the assumed one rather than replacing it.
//
// Year 2 is a separate rate rather than year-1 squared on purpose. A second
// renewal is a different decision from the first, so compounding one rate would
// be a modelling assumption dressed up as arithmetic.

import { useEffect, useMemo, useState } from 'react'
import { LTV_DEFAULTS, ltvFrom, type LtvModel } from '@/lib/ltv-model'

const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'
const GOOD = '#2E7D32'
const LATTE = '#FEF7E7'
const FULVOUS = '#E48715'

const usd = (n: number) => `$${n.toFixed(2)}`

export default function LtvModelPanel({
  measuredYear1,
  measuredDue,
  trialsPerMonth,
}: {
  /** The observed trial→annual rate, so the assumption can be judged. */
  measuredYear1: number | null
  /** How many mature trials that rate rests on. */
  measuredDue: number
  /** Recent monthly trial volume, for the cashflow projection. */
  trialsPerMonth: number
}) {
  const [model, setModel] = useState<LtvModel>(LTV_DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/ltv-model')
      .then(r => r.json())
      .then(d => { if (d?.model) setModel(d.model) })
      .catch(() => { /* defaults stand */ })
      .finally(() => setLoaded(true))
  }, [])

  const ltv = ltvFrom(model)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ltv-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(model),
      })
      const d = await res.json()
      if (d?.model) setModel(d.model)
      setSavedAt(new Date().toLocaleTimeString())
    } catch { /* leave the form as-is; nothing destructive happened */ }
    finally { setSaving(false) }
  }

  // 12 months of cashflow from today's run rate. Month 0 is trials only; the
  // first annual lands a month after each cohort's trial, so the curve steps up
  // from month 1 as each month's cohort matures.
  const months = useMemo(() => {
    const out: { m: number; trial: number; annual: number; total: number; cum: number }[] = []
    let cum = 0
    for (let m = 0; m < 12; m++) {
      const trial = trialsPerMonth * model.trialUsd
      // Cohort from month m-1 bills its annual now.
      const annual = m >= 1 ? trialsPerMonth * model.year1Pct * model.annualUsd : 0
      const total = trial + annual
      cum += total
      out.push({ m, trial, annual, total, cum })
    }
    return out
  }, [trialsPerMonth, model])

  const maxTotal = Math.max(...months.map(x => x.total), 1)
  const year1Total = months[months.length - 1]?.cum ?? 0

  const field = (label: string, value: number, onChange: (n: number) => void, suffix: string, hint: string) => (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, marginBottom: 5 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number" step="0.01" min="0"
          value={Number.isFinite(value) ? value : 0}
          onChange={e => onChange(Number(e.target.value))}
          style={{ width: 92, border: `2px solid ${INK}`, padding: '5px 8px', fontSize: 14, fontWeight: 700, color: RICH }}
        />
        <span style={{ fontSize: 12.5, color: MUTE }}>{suffix}</span>
      </span>
      <span style={{ display: 'block', fontSize: 10.5, color: MUTE, marginTop: 4, lineHeight: 1.4 }}>{hint}</span>
    </label>
  )

  return (
    <div style={{ border: `3px solid ${INK}`, background: '#FFFDFA', marginBottom: 24 }}>
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: 10, padding: '12px 18px', background: LATTE, borderBottom: `1px solid ${INK}` }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>What a customer is worth</span>
        <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>
          saved here, and read by the Ads page so the two cannot disagree
        </span>
      </div>

      <div style={{ padding: 18 }}>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4" style={{ marginBottom: 16 }}>
          {field('Trial', model.trialUsd, n => setModel({ ...model, trialUsd: n }), 'USD', 'charged today')}
          {field('Annual', model.annualUsd, n => setModel({ ...model, annualUsd: n }), 'USD', 'bills a month after the trial')}
          {field('Year 1 renewal', Math.round(model.year1Pct * 100), n => setModel({ ...model, year1Pct: Math.min(1, Math.max(0, n / 100)) }), '%', 'trials that reach the first annual')}
          {field('Year 2 renewal', Math.round(model.year2Pct * 100), n => setModel({ ...model, year2Pct: Math.min(1, Math.max(0, n / 100)) }), '%', 'still paying a year later')}
        </div>

        <div className="flex items-baseline flex-wrap" style={{ gap: 14, padding: '12px 14px', border: `2px solid ${INK}`, background: '#FFFFFF', marginBottom: 14 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: MUTE }}>LTV per trial</span>
          <span style={{ fontSize: 26, fontWeight: 800, color: GOOD, lineHeight: 1 }}>{usd(ltv)}</span>
          <span style={{ fontSize: 12, color: '#4A4A4A' }}>
            {usd(model.trialUsd)} + {Math.round(model.year1Pct * 100)}% x {usd(model.annualUsd)} + {Math.round(model.year2Pct * 100)}% x {usd(model.annualUsd)}
          </span>
          <button
            type="button" onClick={save} disabled={saving || !loaded}
            style={{ marginLeft: 'auto', background: RICH, color: '#FEF7E7', border: 'none', padding: '9px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {savedAt && <span style={{ fontSize: 11, color: GOOD }}>saved {savedAt}</span>}
        </div>

        {/* The assumption judged against the only evidence we have. */}
        <p style={{ fontSize: 12, color: '#4A4A4A', lineHeight: 1.5, marginBottom: 16 }}>
          {measuredYear1 !== null && measuredDue > 0 ? (
            <>
              <strong style={{ color: RICH }}>Measured year 1: {(measuredYear1 * 100).toFixed(0)}%</strong>, on {measuredDue} trials
              whose annual bill date has actually passed. Your assumption is {Math.round(model.year1Pct * 100)}%.
              {measuredDue < 30 && ' That is a small base, so treat it as a signal rather than a settled rate.'}
            </>
          ) : (
            <>No trial has reached its annual bill date yet, so year 1 is entirely an assumption.</>
          )}
          {' '}Year 2 has <strong style={{ color: RICH }}>no data at all</strong>, because the product has not been on this price for two years.
        </p>

        {/* 12-month cashflow. Trials at today's run rate, plus each cohort's
            annual landing a month later. */}
        <div style={{ borderTop: `1px solid #E8E2D4`, paddingTop: 14 }}>
          <div className="flex items-baseline justify-between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: INK }}>
              12-month cashflow
            </span>
            <span style={{ fontSize: 11, color: MUTE }}>
              at {trialsPerMonth.toLocaleString()} trials a month · year 1 total <strong style={{ color: GOOD }}>{usd(year1Total)}</strong>
            </span>
          </div>
          <div className="flex items-end" style={{ gap: 5, height: 128, borderBottom: `1px solid ${INK}` }}>
            {months.map(x => (
              <div key={x.m} className="flex flex-col justify-end items-center" style={{ flex: 1, height: '100%' }} title={`Month ${x.m + 1}: ${usd(x.total)} (trials ${usd(x.trial)}, annuals ${usd(x.annual)}) · cumulative ${usd(x.cum)}`}>
                {/* Annual on top of trial, so the shape shows WHEN the money
                    actually arrives rather than a single flat bar. */}
                <div style={{ width: '78%', height: `${(x.annual / maxTotal) * 100}%`, background: GOOD }} />
                <div style={{ width: '78%', height: `${(x.trial / maxTotal) * 100}%`, background: FULVOUS }} />
              </div>
            ))}
          </div>
          <div className="flex" style={{ marginTop: 5 }}>
            {months.map(x => (
              <span key={x.m} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: '#6B6B6B' }}>{x.m + 1}</span>
            ))}
          </div>
          <div className="flex items-center" style={{ gap: 14, marginTop: 8, fontSize: 10.5, color: '#6B6B6B' }}>
            <span className="inline-flex items-center" style={{ gap: 5 }}><span style={{ width: 9, height: 9, background: FULVOUS }} /> trials</span>
            <span className="inline-flex items-center" style={{ gap: 5 }}><span style={{ width: 9, height: 9, background: GOOD }} /> annual renewals</span>
            <span style={{ marginLeft: 'auto' }}>month 2 onward is where the annuals start landing</span>
          </div>
        </div>
      </div>
    </div>
  )
}
