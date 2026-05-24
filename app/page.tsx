import Link from 'next/link'
import AICentralLogo from '@/components/AICentralLogo'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F2F2F2] flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-5">
        <AICentralLogo height={24} />
      </nav>

      {/* Hero card */}
      <main className="flex-1 flex items-start justify-center px-4 pb-12 pt-2">
        <div className="w-full max-w-[420px] bg-white rounded-2xl shadow-[0_2px_40px_rgba(0,0,0,0.08)] overflow-hidden">

          {/* Top accent bar */}
          <div className="h-1 bg-black" />

          <div className="p-8 text-center">
            <p className="text-xs font-bold tracking-widest uppercase text-[#AAAAAA] mb-4">
              AI Central · Free Quiz
            </p>

            <h1 className="text-[28px] font-black text-black leading-tight mb-3">
              Find Your AI Type
            </h1>

            <p className="text-sm text-[#888888] leading-relaxed mb-8">
              2 minutes. 10 questions. Get a personalized plan matched to your role, goals, and experience level.
            </p>

            <Link
              href="/quiz"
              className="block w-full py-4 bg-black text-white font-bold text-[15px] rounded-xl hover:bg-[#222222] active:scale-[0.99] transition-all"
            >
              Take the quiz →
            </Link>

            <p className="mt-3 text-xs text-[#AAAAAA]">Free · No credit card · 2 min</p>

            {/* Divider */}
            <div className="h-px bg-[#F0F0F0] my-8" />

            {/* Stats */}
            <div className="flex items-center justify-around">
              {[
                { num: '45,000+', label: 'subscribers' },
                { num: '4 types', label: 'personalized paths' },
                { num: '2 min', label: 'to complete' },
              ].map(({ num, label }) => (
                <div key={label} className="text-center">
                  <p className="text-lg font-black text-black">{num}</p>
                  <p className="text-[10px] text-[#AAAAAA] uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="h-px bg-[#F0F0F0] my-8" />

            {/* What you get */}
            <div className="text-left">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#AAAAAA] mb-4">What you get</p>
              <ul className="flex flex-col gap-3">
                {[
                  'Your AI archetype -- executive strategist, growth operator, technical pioneer, or practical learner',
                  'A personalized content plan matched to your goals and experience',
                  'Insights specific to your industry and company size',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-black">
                    <span className="text-black font-bold mt-0.5 flex-shrink-0">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="pb-8 text-center">
        <p className="text-xs text-[#AAAAAA]">
          AI Central ·{' '}
          <a href="https://thecentral.ai/privacy" className="hover:text-black transition-colors">Privacy</a>
          {' '}· No spam, ever
        </p>
      </footer>
    </div>
  )
}
