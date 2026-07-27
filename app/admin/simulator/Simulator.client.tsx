'use client'

import { useMemo, useState } from 'react'
import type { Baseline } from './page'

// "What is this funnel worth?" — the live funnel as the baseline, each step rate
// draggable, and exactly two answers at the top: how many net-new trials, and
// what pipeline that represents.
//
// Deliberately NOT here: annual run-rate, value-per-1000-views, and the
// scenario ladder. They were three different framings of the same arithmetic,
// which made the page feel like a report instead of a tool.

const INK = '#1A1A1A'
const MUTE = '#9C9C9C'
const HAIR = '#E8E2D4'
const ROWHAIR = '#F1ECE2'
const TRACK = '#F1ECE0'
const LATTE = '#FEF7E7'
const AZUL = '#046BB1'
const ASPARAGUS = '#62A758'
const FULVOUS_DARK = '#B26A00'
const RED = '#BE3B3B'

const tnum: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: MUTE }
const panelTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: INK }

const money = (n: number) => `$${Math.round(n).toLocaleString()}`
const pct = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}%`

interface Model {
  visitors: number   // landing views per month
  s1: number         // landing → started
  s2: number         // started → completed
  s3: number         // completed → checkout click
  s4: number         // checkout click → paid trial
  trialToAnnual: number // % of trials that convert to the annual plan
  annual: number     // $ per year
}

function compute(m: Model) {
  const started = m.visitors * (m.s1 / 100)
  const completed = started * (m.s2 / 100)
  const checkout = completed * (m.s3 / 100)
  const netNew = checkout * (m.s4 / 100)
  return {
    started, completed, checkout, netNew,
    resultCvr: completed > 0 ? (netNew / completed) * 100 : 0,
    fullCvr: m.visitors > 0 ? (netNew / m.visitors) * 100 : 0,
    pipeline: netNew * m.annual * (m.trialToAnnual / 100),
  }
}

/** A funnel step: the rate between two stations, as a draggable control. */
function StepRate({ label, value, onChange, baseline }: {
  label: string; value: number; onChange: (n: number) => void; baseline: number
}) {
  const delta = value - baseline
  return (
    <div style={{ padding: '10px 0 12px 26px', borderLeft: `2px dashed ${HAIR}`, marginLeft: 13 }}>
      <div className="flex items-baseline" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B6B6B' }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: AZUL, ...tnum }}>{pct(value)}</span>
        {Math.abs(delta) >= 0.5 && (
          <span style={{ fontSize: 10.5, fontWeight: 800, color: delta > 0 ? ASPARAGUS : RED, ...tnum }}>
            {delta > 0 ? '+' : ''}{delta.toFixed(delta < 10 && delta > -10 ? 1 : 0)} pts
          </span>
        )}
        <span style={{ fontSize: 10, color: MUTE, ...tnum }}>today {pct(baseline)}</span>
      </div>
      <input
        type="range" min={0} max={100} step={0.5} value={value}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={label}
        style={{ width: '100%', maxWidth: 460, marginTop: 6, accentColor: AZUL }}
      />
    </div>
  )
}

/** A funnel station: the count, with today's count for reference. */
function Station({ label, n, was, top, warm }: { label: string; n: number; was: number; top: number; warm?: boolean }) {
  const w = Math.max((n / Math.max(top, 1)) * 100, 1.5)
  const d = was > 0 ? ((n - was) / was) * 100 : 0
  return (
    <div className="flex items-center" style={{ gap: 12 }}>
      <span className="flex items-center justify-center shrink-0" style={{ width: 28, height: 28, background: warm ? ASPARAGUS : AZUL, color: '#FFFFFF', fontWeight: 800, fontSize: 11, ...tnum }}>
        {warm ? '$' : '·'}
      </span>
      <span className="flex items-baseline shrink-0" style={{ width: 176, gap: 7 }}>
        <strong style={{ fontSize: 17, fontWeight: 800, color: warm ? '#2D6A26' : INK, ...tnum }}>{Math.round(n).toLocaleString()}</strong>
        <span style={{ fontSize: 11.5, color: '#4A4A4A', whiteSpace: 'nowrap' }}>{label}</span>
      </span>
      <div style={{ flex: 1, height: 20, background: TRACK, position: 'relative', minWidth: 40 }}>
        <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${w}%`, background: warm ? ASPARAGUS : `rgba(4,107,177,0.72)` }} />
      </div>
      <span className="shrink-0" style={{ width: 62, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: Math.abs(d) < 0.5 ? MUTE : d > 0 ? ASPARAGUS : RED, ...tnum }}>
        {Math.abs(d) < 0.5 ? `${Math.round(was).toLocaleString()}` : `${d > 0 ? '+' : ''}${Math.round(d)}%`}
      </span>
    </div>
  )
}

export default function Simulator({ baseline }: { baseline: Baseline }) {
  // Observed rates. Clamped to 100 defensively: if a node is ever counted on a
  // different cohort than the one above it, we show a capped rate rather than
  // an impossible one.
  const b = useMemo(() => {
    const rate = (num: number, den: number) => (den > 0 ? Math.min(100, (num / den) * 100) : 0)
    return {
      s1: rate(baseline.started, baseline.landing),
      s2: rate(baseline.completed, baseline.started),
      s3: rate(baseline.checkout, baseline.completed),
      s4: rate(baseline.paid, baseline.checkout),
      perMonth: Math.round((baseline.landing / Math.max(1, baseline.days)) * 30),
    }
  }, [baseline])

  const today: Model = {
    visitors: b.perMonth, s1: b.s1, s2: b.s2, s3: b.s3, s4: b.s4,
    trialToAnnual: Math.round(baseline.renewalRate * 100), annual: 59.75,
  }
  const [m, setM] = useState<Model>(today)
  const set = <K extends keyof Model>(k: K, v: Model[K]) => setM(p => ({ ...p, [k]: v }))

  const now = useMemo(() => compute(today), [today]) // eslint-disable-line react-hooks/exhaustive-deps
  const sim = useMemo(() => compute(m), [m])
  const dirty = JSON.stringify(m) !== JSON.stringify(today)
  const delta = (a: number, bb: number) => (bb > 0 ? ((a - bb) / bb) * 100 : 0)

  return (
    <div>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={eyebrow}>Funnel simulator</div>
          <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: INK, margin: '4px 0 0' }}>What is this funnel worth?</h1>
        </div>
        {dirty && (
          <button onClick={() => setM(today)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 800, border: '1px solid #333333', background: '#FFFFFF', color: INK, cursor: 'pointer' }}>
            reset to today
          </button>
        )}
      </div>

      <div className="ac-bento" style={{ border: '2px solid #333333', background: '#FFFFFF' }}>
        <style>{`
          @media (max-width: 900px) {
            .ac-bento .ac-kpis { grid-template-columns: 1fr !important; }
            .ac-bento .ac-kpis > div + div { border-left: none !important; border-top: 1px solid #333333; }
            .ac-bento .ac-split { grid-template-columns: 1fr !important; }
            .ac-bento .ac-split > div { border-right: none !important; }
            .ac-bento .ac-split > div + div { border-top: 1px solid #333333; }
          }
        `}</style>

        {/* The two answers. Everything below exists to move these. */}
        <div className="grid ac-kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {[
            {
              label: 'Expected net-new trials', v: Math.round(sim.netNew).toLocaleString(),
              was: Math.round(now.netNew).toLocaleString(), d: delta(sim.netNew, now.netNew),
              hint: 'per month, at these rates', dark: true,
            },
            {
              label: 'Expected pipeline', v: money(sim.pipeline),
              was: money(now.pipeline), d: delta(sim.pipeline, now.pipeline),
              hint: `net-new x ${money(m.annual)} x ${pct(m.trialToAnnual)} trial conversion`, dark: false,
            },
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

        {/* The funnel, with each step rate draggable in place. */}
        <div style={{ borderTop: '1px solid #333333' }}>
          <div className="flex items-center justify-between" style={{ padding: '10px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}`, gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>The funnel · drag any rate</span>
            <span style={{ fontSize: 10, color: '#6B6B6B' }}>right column = today&apos;s count, or the change vs today</span>
          </div>

          <div style={{ padding: '18px 20px 22px' }}>
            <label className="flex items-center" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Landing views / month</span>
              <span className="inline-flex items-center" style={{ border: '1px solid #333333', background: '#FFFFFF' }}>
                <input
                  type="number" min={0} step={100} value={m.visitors}
                  onChange={e => set('visitors', Math.max(0, Number(e.target.value)))}
                  style={{ width: 100, padding: '5px 8px', fontSize: 12.5, fontWeight: 800, border: 'none', outline: 'none', background: 'transparent', color: INK, ...tnum }}
                />
              </span>
              <span style={{ fontSize: 10.5, color: MUTE, ...tnum }}>today {today.visitors.toLocaleString()}</span>
            </label>

            <Station label="Landing views" n={m.visitors} was={today.visitors} top={m.visitors} />
            <StepRate label="→ start the quiz" value={m.s1} onChange={v => set('s1', v)} baseline={b.s1} />
            <Station label="Quiz started" n={sim.started} was={now.started} top={m.visitors} />
            <StepRate label="→ complete it" value={m.s2} onChange={v => set('s2', v)} baseline={b.s2} />
            <Station label="Quiz completed" n={sim.completed} was={now.completed} top={m.visitors} />
            <StepRate label="→ click checkout" value={m.s3} onChange={v => set('s3', v)} baseline={b.s3} />
            <Station label="Checkout clicked" n={sim.checkout} was={now.checkout} top={m.visitors} />
            <StepRate label="→ pay the $4.99" value={m.s4} onChange={v => set('s4', v)} baseline={b.s4} />
            <Station label="Net-new trials" n={sim.netNew} was={now.netNew} top={m.visitors} warm />

            <div className="flex" style={{ gap: 22, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${ROWHAIR}`, flexWrap: 'wrap' }}>
              <div>
                <div style={eyebrow}>Result-page CVR</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 3, ...tnum }}>{pct(sim.resultCvr)}<span style={{ fontSize: 10.5, color: MUTE, fontWeight: 600 }}> · today {pct(now.resultCvr)}</span></div>
              </div>
              <div>
                <div style={eyebrow}>Full-funnel CVR</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 3, ...tnum }}>{pct(sim.fullCvr)}<span style={{ fontSize: 10.5, color: MUTE, fontWeight: 600 }}> · today {pct(now.fullCvr)}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* What a trial is worth. */}
        <div style={{ borderTop: '1px solid #333333' }}>
          <div style={{ padding: '10px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}` }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>What a trial turns into</span>
          </div>
          <div className="grid ac-split" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ padding: '16px 20px 20px', borderRight: '1px solid #333333' }}>
              <div className="flex items-baseline" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Trials that convert to the annual plan</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: AZUL, ...tnum }}>{pct(m.trialToAnnual)}</span>
              </div>
              <input
                type="range" min={0} max={100} step={1} value={m.trialToAnnual}
                onChange={e => set('trialToAnnual', Number(e.target.value))}
                aria-label="Trial to annual conversion"
                style={{ width: '100%', maxWidth: 420, marginTop: 7, accentColor: AZUL }}
              />
              <div style={{ fontSize: 10.5, color: MUTE, marginTop: 5 }}>
                observed so far {pct(baseline.renewalRate * 100)} - - understated, since many trials have not reached day 28 yet
              </div>

              <label className="flex items-center" style={{ gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Annual price</span>
                <span className="inline-flex items-center" style={{ border: '1px solid #333333', background: '#FFFFFF' }}>
                  <span style={{ fontSize: 11, color: MUTE, paddingLeft: 7 }}>$</span>
                  <input
                    type="number" min={0} step={5} value={m.annual}
                    onChange={e => set('annual', Math.max(0, Number(e.target.value)))}
                    style={{ width: 84, padding: '5px 8px', fontSize: 12.5, fontWeight: 800, border: 'none', outline: 'none', background: 'transparent', color: INK, ...tnum }}
                  />
                </span>
              </label>
            </div>

            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ ...panelTitle, marginBottom: 10 }}>How pipeline is calculated</div>
              <p style={{ fontSize: 12, color: '#4A4A4A', lineHeight: 1.6, margin: 0, textWrap: 'pretty' }}>
                <strong style={{ color: INK }}>{Math.round(sim.netNew).toLocaleString()}</strong> net-new trials
                {' x '}<strong style={{ color: INK }}>{money(m.annual)}</strong>
                {' x '}<strong style={{ color: INK }}>{pct(m.trialToAnnual)}</strong> that convert
                {' = '}<strong style={{ color: FULVOUS_DARK }}>{money(sim.pipeline)}</strong> a month.
              </p>
              <p style={{ fontSize: 11.5, color: '#4A4A4A', lineHeight: 1.55, margin: '10px 0 0', textWrap: 'pretty' }}>
                Result-page CVR is only the last two steps multiplied:{' '}
                <strong style={{ color: INK }}>{pct(m.s3)} x {pct(m.s4)} = {pct(sim.resultCvr)}</strong>.
                Those two are where the page can move the number - - the first two are traffic and quiz quality.
              </p>
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${HAIR}`, padding: '10px 20px', fontSize: 9.5, color: MUTE }}>
          baseline from the live funnel since {baseline.windowStart || '—'} ({baseline.days} days):{' '}
          {baseline.landing.toLocaleString()} landing &rarr; {baseline.started.toLocaleString()} started &rarr;{' '}
          {baseline.completed.toLocaleString()} completed &rarr; {baseline.checkout.toLocaleString()} checkout &rarr;{' '}
          {baseline.paid.toLocaleString()} paid. One cohort, one window, so every step rate is ≤ 100%.
        </div>
      </div>
    </div>
  )
}
