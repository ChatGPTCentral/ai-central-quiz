import Link from 'next/link'
import AICentralLogo from '@/components/AICentralLogo'
import FomoMarquee from '@/components/FomoMarquee.client'
import TrackView from '@/components/TrackView'
import { PassCard } from '@/components/result/PassCard'

export const metadata = {
  title: 'AI Central, where do you rank in AI adoption?',
  description:
    'A 40-second quiz. Discover your AI Readiness Type and exactly where you land vs. everyone else, then get a plan to climb.',
}

// Design tokens (funnel handoff aesthetic on the proven prod layout)
const FULVOUS = '#E48715'
const INK = '#333333'
const RICH = '#1A1A1A'
const CREAM = '#FEF7E7'
const PAPER = '#FFFDFA'
const MUTE = '#666666'

// Subtle paper grain — inline SVG (the handoff texture PNG is too heavy).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")"

export default function HomePage({
  searchParams,
}: { searchParams: Record<string, string | string[] | undefined> }) {
  // Forward every incoming query param verbatim onto the "Start the quiz"
  // CTA, so a single shareable URL like /?email=…&utm_source=… still
  // triggers the email-skip + UTM capture once the user lands on /quiz-v2.
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === 'string' && v.trim() !== '') params.set(k, v)
  }
  const qs = params.toString()
  const quizHref = qs ? `/quiz-v2?${qs}` : '/quiz-v2'

  return (
    <div
      className="relative min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden flex flex-col"
      style={{ backgroundColor: PAPER, backgroundImage: GRAIN }}
    >
      <TrackView event="quiz_view" />

      {/* Top bar — logo only (prod layout). */}
      <nav className="px-5 sm:px-8 py-4 sm:py-5">
        <div className="max-w-6xl mx-auto">
          <AICentralLogo height={22} />
        </div>
      </nav>

      {/* xl:pr reserves the right rail the fixed FOMO marquee occupies, so the
          flipped hero copy never runs underneath it. */}
      <main className="flex-1 min-h-0 flex items-start lg:items-center justify-center px-5 sm:px-8 py-6 lg:py-0 xl:pr-[280px]">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          {/* Left column — the hook: the member pass the quiz mints for you.
              "YOUR NAME" placeholder makes the reward tangible at a glance.
              (Flipped to the left per owner request.) */}
          <div className="w-full max-w-[440px] mx-auto flex flex-col items-center">
            <PassCard
              name="YOUR NAME"
              personaLabel="AI Professional"
              stageLine="STAGE: ?????"
              passPct="Top ??% World"
              issued={`${String(new Date().getMonth() + 1).padStart(2, '0')} / ${new Date().getFullYear()}`}
              refNo="AC-????"
              description="Take the 40-second quiz to mint your member pass, see your AI Readiness Type, and where you rank among 8.1 billion people."
            />

            {/* Result-page LinkedIn share button, reused here as a quiz-start CTA. */}
            <Link
              href={quizHref}
              className="mt-6 inline-flex items-center justify-center gap-2.5 rounded-full bg-[#0A66C2] hover:bg-[#004182] transition-colors"
              style={{ color: '#FFFFFF', padding: '12px 28px', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
              aria-label="Share on LinkedIn"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }} aria-hidden>
                <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
              </svg>
              Share on LinkedIn
            </Link>
          </div>

          {/* Right column — the hero copy + CTA. */}
          <div className="text-center lg:text-left">
            <p className="uppercase mb-4" style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.05em', color: FULVOUS }}>
              The 40-second AI readiness quiz
            </p>
            <h1
              className="mb-4 sm:mb-5 font-bold"
              style={{ fontSize: 'clamp(32px, 4.4vw, 54px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}
            >
              Most people haven&apos;t started with AI.{' '}
              <span style={{ color: FULVOUS }}>Where do you rank?</span>
            </h1>
            <p
              className="mb-7 sm:mb-8 max-w-[540px] mx-auto lg:mx-0"
              style={{ fontSize: 'clamp(15px, 1.5vw, 18px)', fontWeight: 300, lineHeight: 1.5, color: '#4A4A4A' }}
            >
              Take the quiz to get your <strong style={{ color: INK, fontWeight: 600 }}>AI Readiness Type</strong> and
              see exactly where you land versus everyone else, then a plan to climb
            </p>

            {/* Block CTA — new-style two-piece button */}
            <Link
              href={quizHref}
              className="flex sm:inline-flex w-full sm:w-auto transition-transform hover:-translate-y-px active:scale-[0.98]"
              style={{ textDecoration: 'none' }}
            >
              <span
                className="flex-1 sm:flex-none inline-flex items-center justify-center"
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
            <p className="mt-3" style={{ fontSize: 12.5, color: MUTE }}>
              free, no card, 40 seconds
            </p>

            {/* Survey time + completions count — social-proof strip, hard-edge restyle. */}
            <div
              className="mt-5 inline-flex items-center justify-center gap-3 sm:gap-4 px-4 py-2.5 font-mono"
              style={{ backgroundColor: '#FFFFFF', border: `2px solid ${INK}`, fontSize: 10.5, letterSpacing: '0.08em', color: INK }}
            >
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={FULVOUS} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
                ~40 SEC TO COMPLETE
              </span>
              <span aria-hidden style={{ color: '#C9C7BF' }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span style={{ color: '#62A758' }}>●</span>
                2,768 COMPLETED
              </span>
            </div>
          </div>
        </div>
      </main>

      <FomoMarquee />
    </div>
  )
}
