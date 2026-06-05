import Link from 'next/link'
import AICentralLogo from '@/components/AICentralLogo'
import { RadarChart } from '@/components/RadarChart'
import FomoPopup from '@/components/FomoPopup'

export const metadata = {
  title: 'AI Central — Find your AI archetype',
  description: 'A 90-second quiz. We map where you actually sit on the AI adoption ladder, then hand back a 30-day plan tuned to your role and tools.',
}

const FULVOUS = '#E48715'
const INK = '#333333'
const MUTE = '#9C9C9C'

// Illustrative axes for the cover demo radar (before → after loop).
const DEMO_AXES = [
  { label: 'Frequency', value: 38 },
  { label: 'Depth', value: 30 },
  { label: 'Breadth', value: 22 },
  { label: 'Momentum', value: 45 },
  { label: 'Confidence', value: 28 },
]

export default function HomePage() {
  return (
    <div
      className="relative min-h-[100dvh] flex flex-col overflow-hidden"
      style={{
        // Same gradient stack as the result-page hero — green + Fulvous radial
        // glows over a cream→latte vertical wash. Keeps the cover and the
        // result page visually continuous.
        background: `
          radial-gradient(60% 60% at 80% 15%, #62A75822 0%, transparent 60%),
          radial-gradient(50% 50% at 12% 95%, ${FULVOUS}22 0%, transparent 60%),
          linear-gradient(180deg, #F4F1EA 0%, #FBFAF5 60%, #FFFDFA 100%)
        `,
      }}
    >
      {/* Apple-style perspective grid overlay, masked so it fades into the body. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(51,51,51,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(51,51,51,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(120% 100% at 50% 0%, black 35%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(120% 100% at 50% 0%, black 35%, transparent 80%)',
        }}
        aria-hidden
      />

      {/* Top bar — logo only, no tagline. */}
      <nav className="px-5 sm:px-8 py-4 sm:py-5">
        <div className="max-w-6xl mx-auto">
          <AICentralLogo height={22} />
        </div>
      </nav>

      {/* Hero — 2-column on desktop, stacked on mobile. */}
      <main className="flex-1 flex items-center justify-center px-5 sm:px-8 py-6 sm:py-10">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Left — copy + CTA */}
          <div className="text-center md:text-left order-2 md:order-1">
            <h1
              className="text-[34px] sm:text-[48px] md:text-[58px] font-black leading-[1.02] tracking-tight mb-4 sm:mb-6"
              style={{ color: INK }}
            >
              Where do you sit on the{' '}
              <span style={{ color: FULVOUS }}>AI adoption ladder?</span>
            </h1>
            <p
              className="text-[16px] sm:text-[19px] leading-relaxed mb-8 sm:mb-10 max-w-[480px] mx-auto md:mx-0"
              style={{ color: '#555' }}
            >
              10 short questions. A senior-coded plan tuned to how you actually
              work today, not how a generic course assumes you do.
            </p>
            <Link
              href="/quiz-v2"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 rounded-2xl text-[16px] sm:text-[18px] font-black transition-all active:scale-[0.99] hover:opacity-95 shadow-sm"
              style={{ backgroundColor: INK, color: '#FFFDFA' }}
            >
              Start the quiz
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <p className="mt-4 text-[12px] sm:text-[13px]" style={{ color: MUTE }}>
              Free · No card · 90 seconds
            </p>
          </div>

          {/* Right — animated demo radar (matches result-page styling: green
              accent + same chart aesthetic, sized 30% larger). */}
          <div className="order-1 md:order-2 flex justify-center">
            <div className="w-full max-w-[600px]">
              <RadarChart
                axes={DEMO_AXES}
                mode="demo"
                accent="#62A758"
                size={470}
                todayLabel="Where most start"
                projectedLabel="With AI Central"
              />
            </div>
          </div>
        </div>
      </main>

      <FomoPopup variant="completed" />
    </div>
  )
}
