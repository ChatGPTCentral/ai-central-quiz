'use client'

import { useMemo, useState } from 'react'
import type { Baseline } from './page'

// Revenue simulator. Left: the funnel as four step rates plus the offer
// economics. Right: what that funnel is worth, next to today's baseline.
// Every number is derived — nothing is hardcoded except the price points, which
// are themselves editable.

const INK = '#1A1A1A'
const MUTE = '#9C9C9C'
const HAIR = '#E8E2D4'
const ROWHAIR = '#F1ECE2'
const TRACK = '#F1ECE0'
const LATTE = '#FEF7E7'
const AZUL = '#046BB1'
const ASPARAGUS = '#62A758'
const FULVOUS_DARK = '#B26A00'

const tnum: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const panelTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: INK }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTE }

const money = (n: number) => `$${Math.round(n).toLocaleString()}`
const pct1 = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`

interface Model {
  visitors: number      // landing views per month
  s1: number            // landing → start %
  s2: number            // start → complete %
  s3: number            // complete → checkout %
  s4: number            // checkout → paid %
  trial: number         // $ first month
  renew: number         // $ per year after
  renewRate: number     // % of trials that renew
  years: number         // avg years retained once renewed
}

function compute(m: Model) {
  const starts = m.visitors * (m.s1 / 100)
  const completes = starts * (m.s2 / 100)
  const checkouts = completes * (m.s3 / 100)
  const trials = checkouts * (m.s4 / 100)
  const resultCvr = completes > 0 ? (trials / completes) * 100 : 0
  const fullCvr = m.visitors > 0 ? (trials / m.visitors) * 100 : 0
  const ltv = m.trial + (m.renewRate / 100) * m.renew * m.years
  const cashMonth1 = trials * m.trial
  const annual = trials * 12 * ltv
  const per1k = m.visitors > 0 ? (trials / m.visitors) * 1000 * ltv : 0
  return { starts, completes, checkouts, trials, resultCvr, fullCvr, ltv, cashMonth1, annual, per1k }
}

function Slider({ label, value, onChange, hint, max = 100, suffix = '%' }: {
  label: string; value: number; onChange: (n: number) => void; hint?: string; max?: number; suffix?: string
}) {
  return (
    <div style={{ padding: '11px 0', borderBottom: `1px solid ${ROWHAIR}` }}>
      <div className="flex items-baseline justify-between" style={{ gap: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: AZUL, ...tnum }}>{value.toFixed(value < 10 ? 1 : 0)}{suffix}</span>
      </div>
      <input
        type="range" min={0} max={max} step={value < 10 ? 0.5 : 1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', marginTop: 7, accentColor: AZUL }}
        aria-label={label}
      />
      {hint && <div style={{ fontSize: 10, color: MUTE, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function NumField({ label, value, onChange, prefix, step = 1 }: {
  label: string; value: number; onChange: (n: number) => void; prefix?: string; step?: number
}) {
  return (
    <label className="flex items-center justify-between" style={{ gap: 10, padding: '9px 0', borderBottom: `1px solid ${ROWHAIR}` }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>{label}</span>
      <span className="inline-flex items-center" style={{ border: '1px solid #333333', background: '#FFFFFF' }}>
        {prefix && <span style={{ fontSize: 11, color: MUTE, padding: '0 0 0 7px' }}>{prefix}</span>}
        <input
          type="number" value={value} step={step} min={0}
          onChange={e => onChange(Math.max(0, Number(e.target.value)))}
          style={{ width: 86, padding: '5px 7px', fontSize: 12, fontWeight: 800, color: INK, border: 'none', outline: 'none', background: 'transparent', ...tnum }}
        />
      </span>
    </label>
  )
}

export default function Simulator({ baseline }: { baseline: Baseline }) {
  // Baseline rates straight from the live funnel.
  const b = useMemo(() => {
    const s1 = baseline.landing > 0 ? (baseline.started / baseline.landing) * 100 : 0
    const s2 = baseline.started > 0 ? Math.min(100, (baseline.completed / baseline.started) * 100) : 0
    const s3 = baseline.completed > 0 ? (baseline.checkout / baseline.completed) * 100 : 0
    const s4 = baseline.checkout > 0 ? (baseline.paid / baseline.checkout) * 100 : 0
    const perMonth = baseline.days > 0 ? (baseline.landing / baseline.days) * 30 : baseline.landing
    return { s1, s2, s3, s4, visitors: Math.round(perMonth) }
  }, [baseline])

  const todayModel: Model = {
    visitors: b.visitors, s1: b.s1, s2: b.s2, s3: b.s3, s4: b.s4,
    trial: 4.99, renew: 59.75, renewRate: Math.round(baseline.renewalRate * 100), years: 1,
  }

  const [m, setM] = useState<Model>(todayModel)
  const set = <K extends keyof Model>(k: K, v: Model[K]) => setM(prev => ({ ...prev, [k]: v }))

  const now = useMemo(() => compute(todayModel), [todayModel]) // eslint-disable-line react-hooks/exhaustive-deps
  const sim = useMemo(() => compute(m), [m])

  // Presets. "Target" solves for the owner's goal: result-page CVR 50%, which
  // needs complete→checkout and checkout→paid to multiply to 50%.
  const presets: { key: string; label: string; hint: string; apply: () => Model }[] = [
    { key: 'today', label: 'Today', hint: 'the live funnel', apply: () => todayModel },
    { key: 'double', label: '2x', hint: 'every step +40% relative', apply: () => ({ ...todayModel, s1: Math.min(100, todayModel.s1 * 1.19), s2: Math.min(100, todayModel.s2 * 1.19), s3: Math.min(100, todayModel.s3 * 1.19), s4: Math.min(100, todayModel.s4 * 1.19) }) },
    { key: 'target', label: 'Owner target', hint: 'result→paid 50% · landing→paid 20%', apply: () => ({ ...todayModel, s1: 63, s2: 82, s3: 70, s4: 71 }) },
  ]

  const delta = (a: number, bb: number) => (bb > 0 ? ((a - bb) / bb) * 100 : a > 0 ? 100 : 0)

  const kpis = [
    { label: 'Trials / month', v: Math.round(sim.trials).toLocaleString(), was: Math.round(now.trials).toLocaleString(), d: delta(sim.trials, now.trials), dark: false },
    { label: 'Result-page CVR', v: pct1(sim.resultCvr), was: pct1(now.resultCvr), d: delta(sim.resultCvr, now.resultCvr), dark: true },
    { label: 'Full-funnel CVR', v: pct1(sim.fullCvr), was: pct1(now.fullCvr), d: delta(sim.fullCvr, now.fullCvr), dark: false },
    { label: 'LTV / trial', v: money(sim.ltv), was: money(now.ltv), d: delta(sim.ltv, now.ltv), dark: false },
  ]

  const rows = [
    { label: 'Landing views', n: m.visitors, was: now ? todayModel.visitors : 0, tint: 0.12 },
    { label: 'Quiz started', n: sim.starts, was: now.starts, tint: 0.2 },
    { label: 'Quiz completed', n: sim.completes, was: now.completes, tint: 0.3 },
    { label: 'Checkout clicked', n: sim.checkouts, was: now.checkouts, tint: 0.4 },
    { label: 'Paid trials', n: sim.trials, was: now.trials, tint: 0.5, warm: true },
  ]

  return (
    <div>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={eyebrow}>Revenue simulator</div>
          <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: INK, margin: '4px 0 0' }}>What is this funnel worth?</h1>
        </div>
        <div className="inline-flex" style={{ border: '1px solid #333333', flexShrink: 0 }}>
          {presets.map((p, i) => (
            <button key={p.key} onClick={() => setM(p.apply())} title={p.hint}
              style={{ padding: '6px 12px', fontSize: 11, fontWeight: 800, borderLeft: i ? '1px solid #333333' : 'none', background: 'transparent', color: INK, cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ border: '2px solid #333333', background: '#FFFFFF' }}>
        {/* KPI strip */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {kpis.map((k, i) => (
            <div key={k.label} style={{ padding: 18, background: k.dark ? '#333333' : 'transparent', borderLeft: i ? '1px solid #333333' : 'none' }}>
              <div style={{ ...eyebrow, color: k.dark ? '#C9C3B8' : MUTE }}>{k.label}</div>
              <div style={{ fontSize: k.dark ? 32 : 27, fontWeight: 800, letterSpacing: '-0.03em', color: k.dark ? '#E7B02F' : INK, lineHeight: 1, marginTop: 10, ...tnum }}>{k.v}</div>
              <div style={{ fontSize: 10.5, color: k.dark ? 'rgba(255,253,250,0.65)' : MUTE, marginTop: 8, ...tnum }}>
                today {k.was}
                {Math.abs(k.d) >= 0.5 && (
                  <span style={{ color: k.d > 0 ? ASPARAGUS : '#BE3B3B', fontWeight: 800 }}> · {k.d > 0 ? '+' : ''}{Math.round(k.d)}%</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Money row */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid #333333', background: LATTE }}>
          {[
            { label: 'Cash collected month 1', v: money(sim.cashMonth1), hint: `${Math.round(sim.trials).toLocaleString()} trials x ${money(m.trial)}` },
            { label: 'Annual run-rate (LTV)', v: money(sim.annual), hint: '12 months of trials x LTV each' },
            { label: 'Value per 1,000 views', v: money(sim.per1k), hint: 'what a thousand landing views is worth' },
          ].map((k, i) => (
            <div key={k.label} style={{ padding: '16px 18px', borderLeft: i ? `1px solid ${HAIR}` : 'none' }}>
              <div style={eyebrow}>{k.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: FULVOUS_DARK, lineHeight: 1, marginTop: 8, ...tnum }}>{k.v}</div>
              <div style={{ fontSize: 10.5, color: MUTE, marginTop: 6 }}>{k.hint}</div>
            </div>
          ))}
        </div>

        {/* Inputs (left) + resulting funnel (right) */}
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', borderTop: '1px solid #333333' }}>
          <div style={{ padding: '16px 20px 20px', borderRight: '1px solid #333333', minWidth: 0 }}>
            <div style={{ ...panelTitle, marginBottom: 4 }}>The funnel</div>
            <NumField label="Landing views / month" value={m.visitors} onChange={v => set('visitors', v)} step={100} />
            <Slider label="Landing → quiz started" value={m.s1} onChange={v => set('s1', v)} hint={`today ${pct1(b.s1)}`} />
            <Slider label="Quiz started → completed" value={m.s2} onChange={v => set('s2', v)} hint={`today ${pct1(b.s2)}`} />
            <Slider label="Completed → checkout clicked" value={m.s3} onChange={v => set('s3', v)} hint={`today ${pct1(b.s3)}`} />
            <Slider label="Checkout → paid" value={m.s4} onChange={v => set('s4', v)} hint={`today ${pct1(b.s4)}`} />

            <div style={{ ...panelTitle, margin: '18px 0 4px' }}>The offer</div>
            <NumField label="Trial price" value={m.trial} onChange={v => set('trial', v)} prefix="$" step={0.5} />
            <NumField label="Renewal price / year" value={m.renew} onChange={v => set('renew', v)} prefix="$" step={5} />
            <Slider label="Trials that renew" value={m.renewRate} onChange={v => set('renewRate', v)} hint={`observed so far ${pct1(baseline.renewalRate * 100)} · many trials have not hit day 28 yet`} />
            <NumField label="Years retained once renewed" value={m.years} onChange={v => set('years', v)} step={0.5} />
          </div>

          <div style={{ padding: '16px 20px 20px', minWidth: 0 }}>
            <div style={{ ...panelTitle, marginBottom: 12 }}>What that funnel produces / month</div>
            {rows.map(r => {
              const top = Math.max(m.visitors, 1)
              const w = Math.max((r.n / top) * 100, 1.5)
              const d = delta(r.n, r.was)
              return (
                <div key={r.label} className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
                  <span className="flex items-baseline" style={{ width: 168, flexShrink: 0, gap: 6 }}>
                    <strong style={{ fontSize: 15, fontWeight: 800, color: r.warm ? '#2D6A26' : INK, ...tnum }}>{Math.round(r.n).toLocaleString()}</strong>
                    <span style={{ fontSize: 10.5, color: '#4A4A4A', whiteSpace: 'nowrap' }}>{r.label}</span>
                  </span>
                  <div style={{ flex: 1, height: 22, background: TRACK, position: 'relative', minWidth: 0 }}>
                    <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${w}%`, background: r.warm ? ASPARAGUS : `rgba(4,107,177,${0.45 + r.tint})` }} />
                  </div>
                  <span style={{ width: 52, textAlign: 'right', fontSize: 10, fontWeight: 800, color: Math.abs(d) < 0.5 ? MUTE : d > 0 ? ASPARAGUS : '#BE3B3B', ...tnum }}>
                    {Math.abs(d) < 0.5 ? '—' : `${d > 0 ? '+' : ''}${Math.round(d)}%`}
                  </span>
                </div>
              )
            })}

            <div style={{ borderTop: `1px solid ${HAIR}`, marginTop: 16, paddingTop: 12 }}>
              <div style={{ ...panelTitle, marginBottom: 8 }}>Reality check</div>
              <p style={{ fontSize: 11.5, color: '#4A4A4A', lineHeight: 1.55, margin: 0, textWrap: 'pretty' }}>
                Result-page CVR is paid ÷ completed, so it is the product of the last two steps only:
                <strong style={{ color: INK }}> {pct1(m.s3)} x {pct1(m.s4)} = {pct1(sim.resultCvr)}</strong>.
                To reach 50% you need roughly <strong style={{ color: INK }}>70% of completers to click checkout</strong> and
                <strong style={{ color: INK }}> 70% of those to pay</strong>. Today those are {pct1(b.s3)} and {pct1(b.s4)}.
                That is the whole game - - not the headline copy.
              </p>
              <p style={{ fontSize: 11.5, color: '#4A4A4A', lineHeight: 1.55, margin: '10px 0 0', textWrap: 'pretty' }}>
                LTV assumes a trial is worth {money(m.trial)} now plus {pct1(m.renewRate)} of {money(m.renew)} x {m.years} yr
                = <strong style={{ color: INK }}>{money(sim.ltv)}</strong>. Raising the renewal rate moves revenue as hard as
                raising conversion, and nobody is testing it yet.
              </p>
            </div>
          </div>
        </div>

        {/* Scenario ladder */}
        <div style={{ borderTop: '1px solid #333333' }}>
          <div className="flex items-baseline justify-between" style={{ padding: '10px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}` }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>What each result-page CVR is worth</span>
            <span style={{ fontSize: 10, color: '#6B6B6B' }}>at {m.visitors.toLocaleString()} views/mo and today&apos;s quiz steps</span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '90px 1fr 1fr 1fr 1fr', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B6B6B', borderBottom: `1px solid ${HAIR}`, padding: '0 20px' }}>
            <span style={{ padding: '7px 0' }}>Result CVR</span>
            <span style={{ padding: '7px 0', textAlign: 'right' }}>Full-funnel</span>
            <span style={{ padding: '7px 0', textAlign: 'right' }}>Trials / mo</span>
            <span style={{ padding: '7px 0', textAlign: 'right' }}>Cash mo 1</span>
            <span style={{ padding: '7px 0', textAlign: 'right' }}>Annual LTV</span>
          </div>
          {[3, 5, 10, 15, 20, 30, 50].map(target => {
            const completes = m.visitors * (m.s1 / 100) * (m.s2 / 100)
            const trials = completes * (target / 100)
            const full = m.visitors > 0 ? (trials / m.visitors) * 100 : 0
            const isNow = Math.abs(target - now.resultCvr) < 1.2
            return (
              <div key={target} className="grid items-center" style={{ gridTemplateColumns: '90px 1fr 1fr 1fr 1fr', fontSize: 11.5, borderBottom: `1px solid ${ROWHAIR}`, padding: '0 20px', background: isNow ? LATTE : 'transparent' }}>
                <span style={{ padding: '7px 0', fontWeight: 800, color: INK, ...tnum }}>
                  {target}%{isNow && <span style={{ fontSize: 8.5, fontWeight: 800, color: FULVOUS_DARK, marginLeft: 5 }}>NOW</span>}
                </span>
                <span style={{ padding: '7px 0', textAlign: 'right', color: AZUL, fontWeight: 700, ...tnum }}>{pct1(full)}</span>
                <span style={{ padding: '7px 0', textAlign: 'right', fontWeight: 700, ...tnum }}>{Math.round(trials).toLocaleString()}</span>
                <span style={{ padding: '7px 0', textAlign: 'right', ...tnum }}>{money(trials * m.trial)}</span>
                <span style={{ padding: '7px 0', textAlign: 'right', fontWeight: 800, color: ASPARAGUS, ...tnum }}>{money(trials * 12 * sim.ltv)}</span>
              </div>
            )
          })}
          <div style={{ fontSize: 9.5, color: MUTE, padding: '10px 20px' }}>
            baseline from the live funnel since Jul 5 - - {baseline.landing.toLocaleString()} landing views, {baseline.completed.toLocaleString()} completions,{' '}
            {baseline.paid.toLocaleString()} net-new paid over {baseline.days} days
          </div>
        </div>
      </div>
    </div>
  )
}
