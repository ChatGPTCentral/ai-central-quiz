import Link from 'next/link'
import TrackView from '@/components/TrackView'
import { BandStrip } from '@/components/result/BandChart'

export const metadata = {
  title: 'AI Central, where do you rank in AI adoption?',
  description:
    '10 questions, 40 seconds. Your readiness type, your place among 8.1 billion people, and a month-1 plan from your answers.',
}

// Design tokens (funnel handoff)
const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#666666'
const CREAM = '#FEF7E7'
const PAPER = '#FFFDFA'
const FULVOUS = '#E48715'
const XANTHOUS = '#E7B02F'

// Subtle paper grain (inline SVG; the handoff texture PNG is too heavy to ship).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")"

/** The world-adoption teaser: band strip + blinking "?" marker + pass preview. */
function AdoptionTeaser() {
  return (
    <div className="relative">
      {/* Header strip */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono" style={{ fontSize: 10, letterSpacing: '0.1em', color: MUTE }}>
          THE WORLD&apos;S AI ADOPTION · 07/2026
        </span>
        <span className="font-black" style={{ fontSize: 15, color: RICH }}>8.1B</span>
      </div>

      {/* Chart + "?" marker (chip needs headroom above the frame) */}
      <div className="relative" style={{ paddingTop: 30 }}>
        <BandStrip height={92} />
        <div className="absolute top-0 bottom-0" style={{ left: '38%', width: 0 }}>
          <span
            className="absolute font-mono whitespace-nowrap"
            style={{
              top: 0, left: 0, transform: 'translateX(-50%)',
              fontSize: 9.5, letterSpacing: '0.08em',
              backgroundColor: '#FFFFFF', border: `2px solid ${RICH}`,
              padding: '2px 7px', color: RICH,
            }}
          >
            WHERE DO YOU LAND
          </span>
          <span
            className="absolute lp-blink flex items-center justify-center font-black"
            style={{
              top: 30 + 46, left: 0, transform: 'translate(-50%, -50%)',
              width: 22, height: 22, borderRadius: '50%',
              backgroundColor: FULVOUS, border: `2px solid ${RICH}`, color: RICH,
              fontSize: 13, boxShadow: '0 0 0 4px rgba(228,135,21,.3)',
            }}
            aria-hidden
          >
            ?
          </span>
        </div>
      </div>

      {/* Footnote */}
      <p className="mt-2" style={{ fontSize: 11, color: '#9C9C9C' }}>
        84% never used AI · each dot ≈ 3.2M people
      </p>

      {/* Member-pass preview, rotated, overlapping bottom-right */}
      <div
        className="absolute"
        style={{ right: -6, bottom: -34, width: 180, transform: 'rotate(-2.4deg)' }}
      >
        <div style={{ backgroundColor: INK, border: `3px solid ${RICH}`, boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>
          <div className="px-3 pt-2.5 pb-2">
            <div className="flex items-center justify-between">
              <span className="font-mono" style={{ fontSize: 8, letterSpacing: '0.14em', color: CREAM, opacity: 0.65 }}>
                MEMBER PASS
              </span>
              <span className="font-mono" style={{ fontSize: 8, letterSpacing: '0.1em', color: XANTHOUS }}>AT Q10</span>
            </div>
            <div className="mt-1.5 font-black uppercase" style={{ fontSize: 17, letterSpacing: '-0.02em', color: CREAM }}>
              YOUR NAME
            </div>
            <div className="mt-1 font-mono" style={{ fontSize: 8.5, letterSpacing: '0.08em', color: XANTHOUS }}>
              CLASS: ? · RUNG ? OF 6
            </div>
          </div>
          <div className="px-3 py-1.5" style={{ backgroundColor: CREAM, borderTop: `2px solid ${RICH}` }}>
            <div
              aria-hidden
              style={{ height: 14, background: 'repeating-linear-gradient(90deg, #1A1A1A 0 2px, transparent 2px 5px)' }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes lp-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }
        .lp-blink { animation: lp-blink 1.2s step-end infinite; }
        @media (prefers-reduced-motion: reduce) { .lp-blink { animation: none; } }
      `}</style>
    </div>
  )
}

export default function HomePage({
  searchParams,
}: { searchParams: Record<string, string | string[] | undefined> }) {
  // Forward every incoming query param verbatim onto the CTA so a shareable
  // URL like /?email=…&utm_source=… still triggers the email-skip + UTM
  // capture once the user lands on /quiz-v2.
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === 'string' && v.trim() !== '') params.set(k, v)
  }
  const qs = params.toString()
  const quizHref = qs ? `/quiz-v2?${qs}` : '/quiz-v2'

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: PAPER, color: INK }}>
      <TrackView event="quiz_view" />

      {/* Dark top bar (46px): wordmark + completions counter */}
      <div
        className="flex items-center justify-between px-4 sm:px-6 min-[900px]:px-10 flex-shrink-0"
        style={{ backgroundColor: INK, height: 46 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-dark-bg.png" alt="AI Central" style={{ height: 18, width: 'auto', display: 'block' }} />
        <span className="font-mono" style={{ fontSize: 10.5, letterSpacing: '0.1em', color: XANTHOUS }}>
          2,768 COMPLETED · FREE
        </span>
      </div>

      {/* Hero — single column on mobile (1a), 2-col ≥900px (4a) */}
      <main className="flex-1" style={{ backgroundImage: GRAIN }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 min-[900px]:px-16 pt-8 min-[900px]:pt-16 pb-10 grid grid-cols-1 min-[900px]:grid-cols-2 gap-10 min-[900px]:gap-16 items-center">
          {/* Copy column */}
          <div>
            <p className="uppercase" style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.05em', color: FULVOUS }}>
              The 40-second AI readiness quiz
            </p>
            <h1
              className="mt-3 font-bold"
              style={{ fontSize: 'clamp(33px, 4.6vw, 56px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}
            >
              Most people haven&apos;t started with AI.{' '}
              <span style={{ color: FULVOUS }}>Where do you rank?</span>
            </h1>
            <p className="mt-4 max-w-[480px]" style={{ fontSize: 'clamp(14.5px, 1.4vw, 17px)', fontWeight: 300, lineHeight: 1.5, color: '#4A4A4A' }}>
              10 questions. Your readiness type, your place among 8.1 billion people, and a month-1
              plan from your answers
            </p>

            {/* Block CTA (54px tall, full width on mobile) */}
            <Link
              href={quizHref}
              className="mt-6 flex min-[900px]:inline-flex w-full min-[900px]:w-auto transition-transform hover:-translate-y-px active:scale-[0.98]"
              style={{ textDecoration: 'none' }}
            >
              <span
                className="flex-1 min-[900px]:flex-none inline-flex items-center justify-center"
                style={{ backgroundColor: INK, color: CREAM, fontWeight: 600, fontSize: 17, height: 54, padding: '0 26px' }}
              >
                see where I rank
              </span>
              <span
                className="inline-flex items-center justify-center"
                style={{ backgroundColor: FULVOUS, color: RICH, width: 54, height: 54, borderLeft: `2px solid ${RICH}`, fontWeight: 600, fontSize: 17 }}
                aria-hidden
              >
                ↗
              </span>
            </Link>
            <p className="mt-3" style={{ fontSize: 12.5, color: MUTE }}>free, no card, 40 seconds</p>
          </div>

          {/* Chart + pass column */}
          <div className="pb-8 min-[900px]:pb-0">
            <AdoptionTeaser />
          </div>
        </div>

        {/* Desktop route strip (3 stops) — hidden on mobile */}
        <div className="hidden min-[900px]:block" style={{ borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[1240px] mx-auto px-16 py-6 grid grid-cols-3 gap-8">
            {[
              { n: '01', t: 'Answer 10 questions', s: '~40 seconds, no card' },
              { n: '02', t: 'Get your member pass', s: 'Readiness type + percentile among 8.1B' },
              { n: '03', t: 'Start month 1', s: 'A sequenced plan from your answers' },
            ].map(s => (
              <div key={s.n} className="flex items-start gap-3">
                <span className="font-mono font-semibold flex-shrink-0" style={{ fontSize: 12, color: FULVOUS }}>{s.n}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14.5, color: RICH }}>{s.t}</div>
                  <div style={{ fontSize: 12.5, color: MUTE }}>{s.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Trust line (mobile) / dark proof band (desktop) */}
      <footer className="flex-shrink-0" style={{ backgroundColor: INK }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 min-[900px]:px-16 py-3.5 flex flex-col min-[900px]:flex-row items-center justify-center min-[900px]:justify-between gap-1.5">
          <span className="font-mono text-center" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: CREAM, opacity: 0.65 }}>
            READ BY 300,000+ SENIOR PROFESSIONALS
          </span>
          <span className="font-mono text-center" style={{ fontSize: 9.5, letterSpacing: '0.12em', color: CREAM, opacity: 0.65 }}>
            350+ FIVE-STAR REVIEWS
          </span>
        </div>
      </footer>
    </div>
  )
}
