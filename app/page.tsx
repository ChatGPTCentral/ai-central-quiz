import Link from 'next/link'
import AICentralLogo from '@/components/AICentralLogo'

export const metadata = {
  title: 'AI Central — Find your AI archetype',
  description: 'A 90-second quiz. We map where you actually sit on the AI adoption ladder, then hand back a 30-day plan tuned to your role and tools.',
}

const FULVOUS = '#E48715'
const CREAM = '#FFFDFA'
const LATTE = '#FEF7E7'
const INK = '#333333'
const MUTE = '#9C9C9C'

export default function HomePage() {
  return (
    <div className="relative min-h-[100dvh] flex flex-col" style={{ backgroundColor: CREAM }}>
      {/* Soft Cosmic Latte gradient — sets the warm tone without competing
          with the headline. */}
      <div
        className="absolute inset-0 pointer-events-none -z-10"
        style={{
          background: `radial-gradient(ellipse at 50% 20%, ${LATTE} 0%, ${CREAM} 60%)`,
        }}
        aria-hidden
      />
      {/* Paper-texture overlay — AI Central signature */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04] -z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
        aria-hidden
      />

      {/* Minimal top bar — just the logo. Fulvous hairline along the bottom. */}
      <nav className="px-5 sm:px-8 py-4 sm:py-5 border-b" style={{ borderColor: FULVOUS }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <AICentralLogo height={22} />
          <span
            className="text-[10px] font-bold uppercase tracking-[0.18em] hidden sm:block"
            style={{ color: MUTE }}
          >
            AI Adoption Quiz
          </span>
        </div>
      </nav>

      {/* Hero — full-bleed, vertically centered, single primary action. */}
      <main className="flex-1 flex items-center justify-center px-5 sm:px-8 py-10 sm:py-16">
        <div className="w-full max-w-[640px] text-center">
          {/* Kicker */}
          <p
            className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.24em] mb-5 sm:mb-7"
            style={{ color: FULVOUS }}
          >
            An AI Central exclusive · 90 seconds
          </p>

          {/* Headline — two lines, Typeform-scale */}
          <h1
            className="text-[34px] sm:text-[52px] md:text-[64px] font-black leading-[1.02] tracking-tight mb-4 sm:mb-6"
            style={{ color: INK }}
          >
            Where do you sit on the
            {' '}
            <span style={{ color: FULVOUS }}>AI adoption ladder?</span>
          </h1>

          {/* Sub copy — calm, specific, no marketing slop */}
          <p
            className="text-[16px] sm:text-[19px] leading-relaxed mb-9 sm:mb-11 max-w-[520px] mx-auto"
            style={{ color: '#555' }}
          >
            10 short questions. A senior-coded plan tuned to how you actually
            work today — not how a generic course assumes you do.
          </p>

          {/* Primary CTA — full width on mobile, comfortably padded on desktop */}
          <Link
            href="/quiz-v2"
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 rounded-2xl text-[16px] sm:text-[18px] font-black transition-all active:scale-[0.99] hover:opacity-95 shadow-sm"
            style={{ backgroundColor: INK, color: CREAM }}
          >
            Start the quiz
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>

          {/* Press-Enter hint — desktop only */}
          <p
            className="hidden sm:block mt-4 text-[12px]"
            style={{ color: MUTE }}
          >
            or press{' '}
            <kbd className="inline-flex items-center px-1.5 py-0.5 bg-white border rounded text-[11px] font-mono" style={{ borderColor: '#E8E4DF', color: INK }}>
              Enter ↵
            </kbd>
            {' '}to begin
          </p>

          {/* Meta strip — never push below the fold on mobile */}
          <p
            className="mt-6 sm:mt-7 text-[12px] sm:text-[13px]"
            style={{ color: MUTE }}
          >
            Free · No card · No spam, ever
          </p>
        </div>
      </main>

      {/* Tiny footer — Fulvous hairline + minimal copy. Keeps the hero
          composition uncluttered. */}
      <footer
        className="py-4 sm:py-5 text-center border-t text-[11px] sm:text-[12px]"
        style={{ borderColor: FULVOUS, color: MUTE }}
      >
        <span>
          AI Central · backed by 45,000+ readers ·{' '}
          <a
            href="https://thecentral.ai/privacy"
            className="underline hover:opacity-80 transition-opacity"
            style={{ color: MUTE }}
          >
            Privacy
          </a>
        </span>
      </footer>
    </div>
  )
}
