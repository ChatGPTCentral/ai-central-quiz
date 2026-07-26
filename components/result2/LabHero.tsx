import CheckoutLink from '@/components/CheckoutLink.client'

// Design-lab heroes for /result?design=a|b|c|d — four candidate directions for
// the result page, each a full hero band that swaps ONLY the top of the real
// page (everything below stays the shared, proven body). Presentational; the
// leverage number is illustrative for previewing (the real reframe computes it
// from building actions). Real visitors never pass ?design, so they're unaffected.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const PAPER = '#FFFDFA'
const FULVOUS = '#E48715'
const XANTHOUS = '#E7B02F'
const NAVY = '#3B4C99'
const RED = '#BE3B3B'
const GREEN = '#3E7C4F'
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")"

function Eb({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}>
      {children}
    </span>
  )
}

function BlockCTA({ href, label, placement, submissionId }: { href: string; label: string; placement: string; submissionId?: string }) {
  return (
    <CheckoutLink href={href} placement={placement} submissionId={submissionId} className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]" style={{ textDecoration: 'none' }}>
      <span className="inline-flex items-center justify-center" style={{ backgroundColor: INK, color: CREAM, fontWeight: 600, fontSize: 16, height: 54, padding: '0 24px' }}>{label}</span>
      <span className="inline-flex items-center justify-center" style={{ backgroundColor: FULVOUS, color: RICH, width: 54, height: 54, borderLeft: `2px solid ${RICH}`, fontWeight: 600, fontSize: 16 }} aria-hidden>↗</span>
    </CheckoutLink>
  )
}

function Bar({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div>
      <div className="flex justify-between" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: danger ? RED : BODY, marginBottom: 4 }}>
        <span>{label}</span><span>{value}</span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: '#EFE3C8', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(3, Math.min(100, value))}%`, borderRadius: 999, background: danger ? RED : `linear-gradient(90deg, ${XANTHOUS}, ${FULVOUS})` }} />
      </div>
    </div>
  )
}

export interface LabHeroProps {
  variant: string
  firstName: string
  score: number
  topPct: number
  leverage: number
  rungClassName: string
  checkoutUrl: string
  submissionId?: string
}

export function LabHero({ variant, firstName, score, topPct, leverage, rungClassName, checkoutUrl, submissionId }: LabHeroProps) {
  const who = firstName ? `${firstName}, ` : ''
  const gap = Math.max(0, 100 - leverage)
  const depthApprox = Math.round(Math.min(88, score * 0.72))

  // A · LEVERAGE GAP — the low score is the hero
  if (variant === 'a') {
    return (
      <section style={{ backgroundColor: PAPER, backgroundImage: GRAIN }}>
        <div className="max-w-[880px] mx-auto px-6 sm:px-10 pt-12 sm:pt-16 pb-10 text-center">
          <Eb>{firstName ? `Your result, ${firstName}` : 'Your result'}</Eb>
          <div className="mt-4 flex items-baseline justify-center gap-2">
            <span style={{ fontSize: 'clamp(66px,12vw,112px)', fontWeight: 800, letterSpacing: '-0.05em', color: RICH, lineHeight: 1 }}>{leverage}</span>
            <span style={{ fontSize: 26, fontWeight: 800, color: MUTE }}>/100</span>
          </div>
          <p className="mt-2 font-mono uppercase" style={{ fontSize: 12, letterSpacing: '0.2em', color: FULVOUS, fontWeight: 600 }}>Your AI leverage</p>
          <div className="mt-6" style={{ height: 12, borderRadius: 999, background: '#EFE3C8', overflow: 'hidden', maxWidth: 460, margin: '24px auto 0' }}>
            <div style={{ height: '100%', width: `${leverage}%`, borderRadius: 999, background: `linear-gradient(90deg, ${XANTHOUS}, ${FULVOUS})` }} />
          </div>
          <p className="mt-6 mx-auto max-w-[560px]" style={{ fontSize: 18, lineHeight: 1.5, color: BODY, fontWeight: 300 }}>
            {who}you use AI every day, but it&rsquo;s doing <strong style={{ color: RICH, fontWeight: 700 }}>almost none of your work</strong> for you. <strong style={{ color: RICH, fontWeight: 700 }}>{gap} points are on the table</strong>, most reachable in a weekend.
          </p>
          <div className="mt-8 flex justify-center"><BlockCTA href={checkoutUrl} label="show me the fix" placement="v2_lab_a_hero" submissionId={submissionId} /></div>
          <p className="mt-4" style={{ fontSize: 13, color: MUTE }}>Your Top {topPct}% adopter badge is below, share it 👇</p>
        </div>
      </section>
    )
  }

  // B · READINESS REPORT — scored breakdown, flatter usage / expose leverage
  if (variant === 'b') {
    return (
      <section style={{ backgroundColor: PAPER, backgroundImage: GRAIN }}>
        <div className="max-w-[760px] mx-auto px-6 sm:px-10 pt-12 sm:pt-16 pb-10">
          <Eb>AI readiness report{firstName ? ` · ${firstName}` : ''}</Eb>
          <h1 className="mt-3 font-bold" style={{ fontSize: 'clamp(30px,4.6vw,48px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
            You&rsquo;re a <span style={{ color: FULVOUS }}>{rungClassName}</span>
          </h1>
          <p className="mt-2" style={{ fontSize: 16, color: BODY, fontWeight: 300 }}>Top {topPct}% adopter, but <strong style={{ color: RICH, fontWeight: 700 }}>leverage</strong> is where you trail.</p>
          <div className="mt-8 flex flex-col gap-4 max-w-[520px]">
            <Bar label="USAGE" value={score} />
            <Bar label="DEPTH" value={depthApprox} />
            <Bar label="LEVERAGE" value={leverage} danger />
          </div>
          <p className="mt-6 max-w-[540px]" style={{ fontSize: 15.5, lineHeight: 1.5, color: BODY, fontWeight: 300 }}>
            You&rsquo;re ahead on usage and behind on leverage, you use AI, but it isn&rsquo;t working <em>for</em> you yet. The plan below closes exactly that gap.
          </p>
          <div className="mt-7"><BlockCTA href={checkoutUrl} label="get my improvement plan" placement="v2_lab_b_hero" submissionId={submissionId} /></div>
        </div>
      </section>
    )
  }

  // C · THE CLIMB — the ladder, marker, summit as the library's promise
  if (variant === 'c') {
    const rungs = [
      { n: 5, label: 'Builder', sub: 'ships AI that works while you sleep', top: true },
      { n: 4, label: 'Power User', sub: 'AI runs multiple workflows for them' },
      { n: 3, label: 'Practitioner', sub: 'uses AI for real work, weekly' },
      { n: 2, label: 'You&rsquo;re here · User', sub: 'you use AI, it doesn&rsquo;t work for you yet', you: true },
    ]
    return (
      <section style={{ backgroundColor: PAPER, backgroundImage: GRAIN }}>
        <div className="max-w-[720px] mx-auto px-6 sm:px-10 pt-12 sm:pt-16 pb-10">
          <Eb>Your AI ladder</Eb>
          <h1 className="mt-3 font-bold" style={{ fontSize: 'clamp(28px,4.4vw,46px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
            {who}you&rsquo;re <span style={{ color: FULVOUS }}>3 rungs</span> from the top
          </h1>
          <div className="mt-7 flex flex-col gap-2.5">
            {rungs.map(r => (
              <div key={r.n} className="flex items-center gap-3" style={{
                border: `2px solid ${r.you ? FULVOUS : r.top ? NAVY : '#E3DAC2'}`,
                background: r.top ? 'linear-gradient(90deg, rgba(59,76,153,0.08), #FFFFFF)' : '#FFFFFF',
                borderRadius: 10, padding: '12px 14px',
              }}>
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 999, background: r.you ? FULVOUS : r.top ? NAVY : '#EFE3C8', color: r.you || r.top ? '#fff' : '#8A6A1F', fontWeight: 800, fontSize: 13 }}>{r.n}</span>
                <span>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: RICH }} dangerouslySetInnerHTML={{ __html: r.label }} />
                  <span style={{ display: 'block', fontSize: 12.5, color: BODY }} dangerouslySetInnerHTML={{ __html: r.sub }} />
                </span>
              </div>
            ))}
          </div>
          <div className="mt-7"><BlockCTA href={checkoutUrl} label="start the climb" placement="v2_lab_c_hero" submissionId={submissionId} /></div>
        </div>
      </section>
    )
  }

  // D · YOUR 30-DAY PLAN — the plan is the hero, built from their answers
  if (variant === 'd') {
    const weeks = [
      { wk: 'Week 1 · tonight', ti: 'Make AI draft your emails in your voice', free: true },
      { wk: 'Week 2', ti: 'Automate your inbox triage' },
      { wk: 'Week 3', ti: 'Build your first custom GPT' },
      { wk: 'Week 4', ti: 'Ship an automation that runs itself' },
    ]
    return (
      <section style={{ backgroundColor: PAPER, backgroundImage: GRAIN }}>
        <div className="max-w-[720px] mx-auto px-6 sm:px-10 pt-12 sm:pt-16 pb-10">
          <Eb>Built from your 10 answers</Eb>
          <h1 className="mt-3 font-bold" style={{ fontSize: 'clamp(28px,4.4vw,46px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
            {firstName ? `${firstName}, your` : 'Your'} 30-day AI plan is <span style={{ color: FULVOUS }}>ready</span>
          </h1>
          <p className="mt-2" style={{ fontSize: 16, color: BODY, fontWeight: 300 }}>Sequenced for a {rungClassName.toLowerCase()}. The first step is free tonight, the rest unlock with the library.</p>
          <div className="mt-6 flex flex-col gap-2.5">
            {weeks.map((w, i) => (
              <div key={i} className="flex items-center gap-3" style={{ border: `2px solid ${INK}`, background: '#FFFFFF', borderRadius: 10, padding: '12px 14px', opacity: w.free ? 1 : 0.66 }}>
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 999, background: w.free ? FULVOUS : '#FFFFFF', border: `2px solid ${INK}`, color: w.free ? '#fff' : INK, fontWeight: 800, fontSize: 13 }}>{w.free ? '1' : '🔒'}</span>
                <span className="min-w-0">
                  <span className="block font-mono uppercase" style={{ fontSize: 10, letterSpacing: '0.1em', color: w.free ? GREEN : MUTE, fontWeight: 700 }}>{w.wk}{w.free ? ' · free' : ''}</span>
                  <span className="block" style={{ fontSize: 14.5, fontWeight: 700, color: RICH, lineHeight: 1.25 }}>{w.ti}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-7"><BlockCTA href={checkoutUrl} label="unlock all 4 weeks · $4.99" placement="v2_lab_d_hero" submissionId={submissionId} /></div>
        </div>
      </section>
    )
  }

  return null
}
