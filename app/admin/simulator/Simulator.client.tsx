'use client'

import { useMemo, useState } from 'react'
import type { Baseline } from './page'

// One table, five knobs, two answers.
//
// At default settings this reproduces the dashboard's "Funnel per period · All"
// column exactly — same window, same counting rule. If the two ever disagree,
// one of them is wrong, and that is the point of anchoring them together.

const INK = '#1A1A1A'
const MUTE = '#9C9C9C'
const HAIR = '#E8E2D4'
const ROWHAIR = '#F1ECE2'
const LATTE = '#FEF7E7'
const AZUL = '#046BB1'
const ASPARAGUS = '#62A758'
const FULVOUS_DARK = '#B26A00'
const RED = '#BE3B3B'

const tnum: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTE }

const money = (n: number) => `$${Math.round(n).toLocaleString()}`
const pct = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`

interface Model {
  people: number        // 1. how many people in
  toStart: number       // 2. landing → quiz started
  toComplete: number    // 3. started → completed
  toCheckout: number    // 4. completed → checkout click
  toPaid: number        // 5. checkout → net-new
}

// The economics knobs (trial-to-annual, annual price) are GONE from this
// model on purpose. They were a third private copy of the LTV maths, which is
// why this panel's "pipeline" could disagree with the calculator above it.
// Pipeline is now priced with the shared model via `ltvPerTrial`.
function run(m: Model, ltvPerTrial: number) {
  const started = m.people * (m.toStart / 100)
  const completed = started * (m.toComplete / 100)
  const checkout = completed * (m.toCheckout / 100)
  const netNew = checkout * (m.toPaid / 100)
  return {
    started, completed, checkout, netNew,
    resultCvr: completed > 0 ? (netNew / completed) * 100 : 0,
    fullCvr: m.people > 0 ? (netNew / m.people) * 100 : 0,
    pipeline: netNew * ltvPerTrial,
  }
}

export default function Simulator({ baseline, ltvPerTrial, onProjection }: {
  baseline: Baseline
  /** From the shared LTV model, so pipeline here = the calculator's number. */
  ltvPerTrial: number
  /** Reports projected trials/MONTH after every knob change, so the cashflow
   *  forecast above follows this panel. isBaseline=true means "back to the
   *  live funnel", which releases the scenario override. */
  onProjection?: (perMonth: number, isBaseline: boolean) => void
}) {
  const rate = (num: number, den: number) => (den > 0 ? Math.min(100, (num / den) * 100) : 0)

  // Today = literally the live funnel. Change nothing and this page shows the
  // dashboard's numbers back to you.
  const today: Model = useMemo(() => ({
    people: baseline.landing,
    toStart: rate(baseline.started, baseline.landing),
    toComplete: rate(baseline.completed, baseline.started),
    toCheckout: rate(baseline.checkout, baseline.completed),
    toPaid: rate(baseline.paid, baseline.checkout),
  }), [baseline])

  const [m, setM] = useState<Model>(today)
  // Every change reports the new projection UP, inside the handler rather than
  // an effect, so there is no render-loop risk and "untouched" reports nothing.
  const report = (next: Model) => {
    if (!onProjection) return
    const perMonth = baseline.days > 0 ? (run(next, ltvPerTrial).netNew / baseline.days) * 30 : 0
    onProjection(perMonth, JSON.stringify(next) === JSON.stringify(today))
  }
  const set = <K extends keyof Model>(k: K, v: Model[K]) =>
    setM(p => { const next = { ...p, [k]: v }; report(next); return next })
  const now = useMemo(() => run(today, ltvPerTrial), [today, ltvPerTrial])
  const sim = useMemo(() => run(m, ltvPerTrial), [m, ltvPerTrial])
  const dirty = JSON.stringify(m) !== JSON.stringify(today)
  const chg = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0)

  // The five funnel knobs, in order. Each row: what it does, the rate, the
  // people who survive it.
  const steps: { n: number; label: string; key: keyof Model; out: number; wasOut: number; wasRate: number }[] = [
    { n: 2, label: 'start the quiz',        key: 'toStart',    out: sim.started,   wasOut: now.started,   wasRate: today.toStart },
    { n: 3, label: 'complete the quiz',     key: 'toComplete', out: sim.completed, wasOut: now.completed, wasRate: today.toComplete },
    { n: 4, label: 'click checkout',        key: 'toCheckout', out: sim.checkout,  wasOut: now.checkout,  wasRate: today.toCheckout },
    { n: 5, label: 'pay · net-new trial',   key: 'toPaid',     out: sim.netNew,    wasOut: now.netNew,    wasRate: today.toPaid },
  ]

  return (
    <div>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={eyebrow}>Funnel simulator</div>
          <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: INK, margin: '4px 0 0' }}>What is this funnel worth?</h1>
        </div>
        {dirty && (
          <button onClick={() => { setM(today); report(today) }} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 800, border: '1px solid #333333', background: '#FFFFFF', color: INK, cursor: 'pointer' }}>
            reset to today
          </button>
        )}
      </div>

      <div className="ac-bento" style={{ border: '2px solid #333333', background: '#FFFFFF' }}>
        <style>{`
          .ac-simrow { display: grid; grid-template-columns: 26px 1fr 210px 110px 64px; align-items: center; gap: 12px; }
          @media (max-width: 900px) {
            .ac-bento .ac-kpis { grid-template-columns: 1fr !important; }
            .ac-bento .ac-kpis > div + div { border-left: none !important; border-top: 1px solid #333333; }
            .ac-simrow { grid-template-columns: 22px 1fr 92px; row-gap: 6px; }
            .ac-simrow .ac-simslider { grid-column: 2 / -1; }
            .ac-simrow .ac-simdelta { display: none; }
          }
        `}</style>

        {/* The two answers */}
        <div className="grid ac-kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {[
            { label: 'Net-new trials', v: Math.round(sim.netNew).toLocaleString(), was: Math.round(now.netNew).toLocaleString(), d: chg(sim.netNew, now.netNew), hint: 'people who take the quiz and pay', dark: true },
            { label: 'Pipeline', v: money(sim.pipeline), was: money(now.pipeline), d: chg(sim.pipeline, now.pipeline), hint: `net-new x ${money(ltvPerTrial)} LTV, the model set above`, dark: false },
          ].map((k, i) => (
            <div key={k.label} style={{ padding: 20, background: k.dark ? '#333333' : 'transparent', borderLeft: i ? '1px solid #333333' : 'none' }}>
              <div style={{ ...eyebrow, color: k.dark ? '#C9C3B8' : MUTE }}>{k.label}</div>
              <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: k.dark ? '#E7B02F' : FULVOUS_DARK, lineHeight: 1, marginTop: 10, ...tnum }}>{k.v}</div>
              <div style={{ fontSize: 11, color: k.dark ? 'rgba(255,253,250,0.65)' : MUTE, marginTop: 9, ...tnum }}>
                today {k.was}
                {Math.abs(k.d) >= 0.5 && <span style={{ color: k.d > 0 ? ASPARAGUS : RED, fontWeight: 800 }}> · {k.d > 0 ? '+' : ''}{Math.round(k.d)}%</span>}
              </div>
              <div style={{ fontSize: 10.5, color: k.dark ? 'rgba(255,253,250,0.5)' : MUTE, marginTop: 4 }}>{k.hint}</div>
            </div>
          ))}
        </div>

        {/* The five knobs */}
        <div style={{ borderTop: '1px solid #333333' }}>
          <div className="flex items-center justify-between" style={{ padding: '10px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}`, gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Adjust the funnel</span>
            <span style={{ fontSize: 10, color: '#6B6B6B' }}>defaults = the live funnel since {baseline.windowStart || 'launch'}</span>
          </div>

          <div style={{ padding: '14px 20px 18px' }}>
            {/* 1 · how many people in */}
            <div className="ac-simrow" style={{ padding: '10px 0', borderBottom: `1px solid ${ROWHAIR}` }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#FFFFFF', background: INK, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', ...tnum }}>1</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>People in</span>
              <span className="ac-simslider inline-flex items-center" style={{ border: '1px solid #333333', background: '#FFFFFF', width: 'fit-content' }}>
                <input
                  type="number" min={0} step={100} value={m.people}
                  onChange={e => set('people', Math.max(0, Number(e.target.value)))}
                  style={{ width: 110, padding: '5px 9px', fontSize: 13, fontWeight: 800, border: 'none', outline: 'none', background: 'transparent', color: INK, ...tnum }}
                />
              </span>
              <span style={{ fontSize: 15, fontWeight: 800, color: INK, textAlign: 'right', ...tnum }}>{Math.round(m.people).toLocaleString()}</span>
              <span className="ac-simdelta" style={{ fontSize: 10, color: MUTE, textAlign: 'right', ...tnum }}>{today.people.toLocaleString()}</span>
            </div>

            {/* 2-5 · the four conversion steps */}
            {steps.map(s => {
              const v = m[s.key] as number
              const d = chg(s.out, s.wasOut)
              return (
                <div key={s.key} className="ac-simrow" style={{ padding: '10px 0', borderBottom: `1px solid ${ROWHAIR}` }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: '#FFFFFF', background: INK, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', ...tnum }}>{s.n}</span>
                  <span style={{ fontSize: 12.5, color: INK }}>
                    <strong style={{ fontWeight: 700 }}>{pct(v)}</strong> {s.label}
                    <span style={{ fontSize: 10, color: MUTE, marginLeft: 6, ...tnum }}>today {pct(s.wasRate)}</span>
                  </span>
                  <input
                    className="ac-simslider"
                    type="range" min={0} max={100} step={0.5} value={v}
                    onChange={e => set(s.key, Number(e.target.value) as Model[typeof s.key])}
                    aria-label={s.label}
                    style={{ width: '100%', accentColor: s.n === 5 ? ASPARAGUS : AZUL }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 800, color: s.n === 5 ? '#2D6A26' : INK, textAlign: 'right', ...tnum }}>{Math.round(s.out).toLocaleString()}</span>
                  <span className="ac-simdelta" style={{ fontSize: 10, fontWeight: 800, textAlign: 'right', color: Math.abs(d) < 0.5 ? MUTE : d > 0 ? ASPARAGUS : RED, ...tnum }}>
                    {Math.abs(d) < 0.5 ? Math.round(s.wasOut).toLocaleString() : `${d > 0 ? '+' : ''}${Math.round(d)}%`}
                  </span>
                </div>
              )
            })}

            <div className="flex" style={{ gap: 22, marginTop: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={eyebrow}>Result-page CVR</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginTop: 3, ...tnum }}>
                  {pct(sim.resultCvr)}<span style={{ fontSize: 10.5, color: MUTE, fontWeight: 600 }}> · today {pct(now.resultCvr)}</span>
                </div>
              </div>
              <div>
                <div style={eyebrow}>Full-funnel CVR</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginTop: 3, ...tnum }}>
                  {pct(sim.fullCvr)}<span style={{ fontSize: 10.5, color: MUTE, fontWeight: 600 }}> · today {pct(now.fullCvr)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${HAIR}`, padding: '10px 20px', fontSize: 9.5, color: MUTE, ...tnum }}>
          Live funnel since {baseline.windowStart || '—'} ({baseline.days} days): {baseline.landing.toLocaleString()} in &rarr;{' '}
          {baseline.started.toLocaleString()} started &rarr; {baseline.completed.toLocaleString()} completed &rarr;{' '}
          {baseline.checkout.toLocaleString()} checkout &rarr; {baseline.paid.toLocaleString()} paid ({money(baseline.revenue)}).
          Same window and counting rule as the dashboard, so untouched this page matches its All column.
        </div>
      </div>
    </div>
  )
}
