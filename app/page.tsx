import Link from 'next/link'
import AICentralLogo from '@/components/AICentralLogo'
import FomoPopup from '@/components/FomoPopup'
import { AdoptionChart } from '@/components/result/AdoptionChart'

export const metadata = {
  title: 'AI Central — Where do you rank in AI adoption?',
  description:
    'A 90-second quiz. Discover your AI Readiness Type and exactly where you land vs. everyone else — then get a plan to climb.',
}

const FULVOUS = '#E48715'
const INK = '#333333'
const MUTE = '#9C9C9C'

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
      style={{
        // Clean cream wash with one restrained fulvous glow — calmer than the
        // old gradient/grid stack, still unmistakably AI Central.
        background: `
          radial-gradient(60% 45% at 50% 0%, ${FULVOUS}12 0%, transparent 60%),
          linear-gradient(180deg, #FBFAF5 0%, #FFFDFA 55%)
        `,
      }}
    >
      {/* Top bar — logo only. */}
      <nav className="px-5 sm:px-8 py-4 sm:py-5">
        <div className="max-w-6xl mx-auto">
          <AICentralLogo height={22} />
        </div>
      </nav>

      <main className="flex-1 min-h-0 flex items-start lg:items-center justify-center px-5 sm:px-8 py-6 lg:py-0">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          {/* Left column — the hero copy + CTA. */}
          <div className="text-center lg:text-left">
            <p className="text-[11px] sm:text-[12px] font-black uppercase tracking-[0.16em] mb-4" style={{ color: FULVOUS }}>
              The 90-second AI readiness quiz
            </p>
            <h1
              className="text-[32px] sm:text-[46px] md:text-[54px] font-black leading-[1.03] tracking-tight mb-4 sm:mb-5"
              style={{ color: INK }}
            >
              Most people haven&apos;t started with AI.{' '}
              <span style={{ color: FULVOUS }}>Where do you rank?</span>
            </h1>
            <p
              className="text-[16px] sm:text-[18px] leading-relaxed mb-7 sm:mb-8 max-w-[540px] mx-auto lg:mx-0"
              style={{ color: '#555' }}
            >
              Take the quiz to get your <strong style={{ color: INK }}>AI Readiness Type</strong> and see exactly
              where you land versus everyone else — then a plan to climb.
            </p>
            <Link
              href={quizHref}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 rounded-2xl text-[16px] sm:text-[18px] font-black transition-all active:scale-[0.99] hover:opacity-95 shadow-sm"
              style={{ backgroundColor: INK, color: '#FFFDFA' }}
            >
              See where I rank
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <p className="mt-4 text-[12px] sm:text-[13px]" style={{ color: MUTE }}>
              Free · No card · 90 seconds
            </p>

            {/* Survey time + completions count — quick social-proof strip. */}
            <div
              className="mt-6 sm:mt-7 inline-flex items-center justify-center gap-3 sm:gap-4 px-4 sm:px-5 py-2.5 rounded-full text-[11px] sm:text-[12px] font-bold uppercase tracking-[0.14em]"
              style={{ background: '#FFFFFFCC', border: '1px solid #E8E4DF', color: '#555' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={FULVOUS} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
                ~90 sec to complete
              </span>
              <span aria-hidden style={{ color: '#C9C7BF' }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span style={{ color: '#62A758' }}>●</span>
                2,768 people completed
              </span>
            </div>
          </div>

          {/* Right column — the hook: the adoption density chart. This is what
              people take the quiz to discover — their place among everyone
              else. Chart-only (bare) so the left column carries the headline. */}
          <div className="w-full max-w-[400px] mx-auto">
            <AdoptionChart variant="cover" bare />
          </div>
        </div>
      </main>

      <FomoPopup variant="completed" />
    </div>
  )
}
