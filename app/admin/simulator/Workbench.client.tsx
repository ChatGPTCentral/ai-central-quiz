'use client'

// The workbench: three panels, ONE model.
//
// The owner's complaint, verbatim: "the calculator at the top, the chart, and
// the how-much-is-the-funnel-worth — they do not talk to each other and are
// hard to use." He was right, and the disconnect was structural: the LTV
// calculator saved assumptions the chart deliberately ignored (it forecast at
// the measured rate), while the funnel simulator carried a THIRD private copy
// of the economics (its own trialToAnnual and annual-price knobs) and computed
// a "pipeline" number neither of the others could see.
//
// Now there is one flow, stated left to right on the page itself:
//
//   LTV model  ──sets assumed rate──▶  Cashflow chart  ◀──trials/month──  Funnel
//
//  - Editing year-1 in the calculator moves the ASSUMED forecast line live.
//  - The MEASURED line (the sheet's mature rate) stays put, so the gap between
//    what you assume and what history shows becomes the point of the chart
//    rather than a hidden inconsistency.
//  - Dragging any funnel slider changes projected trials/month, which re-draws
//    the whole forecast. The funnel's "pipeline" is priced with the SAME LTV
//    the calculator shows, not a private one.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { LTV_DEFAULTS, ltvFrom, type LtvModel } from '@/lib/ltv-model'
import LtvModelPanel from '@/components/admin/LtvModelPanel.client'
import CashflowChart, { type CashPoint } from '@/components/admin/CashflowChart.client'
import Simulator from './Simulator.client'
import type { Baseline } from './page'

const INK = '#333333'
const MUTE = '#9C9C9C'

function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function Workbench({
  baseline,
  actuals,
  maturedRate,
  maturedTrials,
  runRate,
  lastActualMonth,
  cashflowError,
  initialModel,
}: {
  baseline: Baseline
  /** Settled + partial months from the sheet. No forecast — that is computed
   *  HERE, so it can react to the two panels beside it. */
  actuals: CashPoint[]
  maturedRate: number | null
  maturedTrials: number
  runRate: number
  lastActualMonth: string | null
  cashflowError?: string
  initialModel: LtvModel
}) {
  // ── The one model ────────────────────────────────────────────────────
  const [model, setModel] = useState<LtvModel>(initialModel)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const save = useCallback(async () => {
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
    } catch { /* nothing destructive happened; the form keeps its values */ }
    finally { setSaving(false) }
  }, [model])

  // ── Trials/month: the funnel's output, the forecast's input ──────────
  // Starts at the sheet's run rate. The funnel simulator calls back with its
  // projection whenever a slider moves, so the two agree by construction.
  const [funnelTrialsPerMonth, setFunnelTrialsPerMonth] = useState<number | null>(null)
  const trialsPerMonth = funnelTrialsPerMonth ?? runRate

  // Reset-to-today in the funnel should also release its grip on the chart.
  const onProjection = useCallback((perMonth: number, isBaseline: boolean) => {
    setFunnelTrialsPerMonth(isBaseline ? null : Math.max(0, Math.round(perMonth)))
  }, [])

  // ── The forecast, client-side so it can react ────────────────────────
  const points: CashPoint[] = useMemo(() => {
    if (!lastActualMonth || actuals.length === 0) return actuals
    const assumed = model.year1Pct
    const measured = maturedRate ?? model.year1Pct
    const out = [...actuals]
    for (let i = 1; i <= 12; i++) {
      out.push({
        month: addMonths(lastActualMonth, i),
        trials: trialsPerMonth,
        // Bars + primary line: YOUR model. The alt line: what history says.
        revenue: trialsPerMonth * (model.trialUsd + assumed * model.annualUsd),
        revenueAlt: trialsPerMonth * (model.trialUsd + measured * model.annualUsd),
        kind: 'forecast',
      })
    }
    return out
  }, [actuals, lastActualMonth, model, maturedRate, trialsPerMonth])

  const ltv = ltvFrom(model)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* The relationship, stated where the panels meet. */}
      <div
        className="flex items-center flex-wrap"
        style={{ gap: 8, padding: '9px 14px', border: `2px solid ${INK}`, borderBottom: 'none', background: '#333333', color: '#FEF7E7', fontSize: 11.5, fontWeight: 600 }}
      >
        <span style={{ fontWeight: 800 }}>How this page works:</span>
        <span>the model sets the assumed rate</span>
        <span aria-hidden style={{ color: '#E7B02F' }}>→</span>
        <span>the chart draws it against the measured {maturedRate !== null ? `${(maturedRate * 100).toFixed(1)}%` : 'rate'}</span>
        <span aria-hidden style={{ color: '#E7B02F' }}>←</span>
        <span>the funnel below feeds it {trialsPerMonth.toLocaleString()} trials/month</span>
        {funnelTrialsPerMonth !== null && (
          <span style={{ marginLeft: 'auto', color: '#E7B02F', fontWeight: 800 }}>funnel scenario active</span>
        )}
      </div>

      <LtvModelPanel
        model={model}
        onChange={setModel}
        onSave={save}
        saving={saving}
        savedAt={savedAt}
        measuredYear1={maturedRate}
        measuredDue={maturedTrials}
      />

      <div style={{ border: `2px solid ${INK}`, borderTop: 'none', background: '#FFFDFA', padding: '16px 18px', marginBottom: 24 }}>
        {cashflowError ? (
          <p style={{ fontSize: 12.5, color: '#BE3B3B', lineHeight: 1.5 }}>Cashflow unavailable: {cashflowError}</p>
        ) : (
          <>
            <CashflowChart points={points} assumedPct={model.year1Pct} measuredPct={maturedRate} />
            <p style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>
              Actuals from your trials sheet, synced daily. The forecast runs at{' '}
              <strong style={{ color: INK }}>{trialsPerMonth.toLocaleString()} trials a month</strong>
              {funnelTrialsPerMonth !== null
                ? ' — the funnel scenario you set below. Hit reset down there to return to the live run rate.'
                : ' — the recent run rate. Drag the funnel below and this number follows it.'}{' '}
              The last two actual months are faded because their annuals are not due yet.
            </p>
          </>
        )}
      </div>

      <Simulator baseline={baseline} ltvPerTrial={ltv} onProjection={onProjection} />
    </div>
  )
}
