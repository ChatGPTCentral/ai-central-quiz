import Link from 'next/link'
import AICentralLogo from '@/components/AICentralLogo'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#FFFDFA' }}>
      {/* Subtle paper-texture overlay — AI Central signature */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04] z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Top nav — Fulvous accent border bottom */}
      <nav className="px-6 py-5 border-b z-10" style={{ borderColor: '#E48715' }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <AICentralLogo height={24} />
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9C9C9C' }}>
            AI Adoption Quiz
          </p>
        </div>
      </nav>

      {/* Hero card */}
      <main className="flex-1 flex items-start justify-center px-4 pb-12 pt-10 z-10">
        <div
          className="w-full max-w-[460px] rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DF', boxShadow: '0 4px 60px rgba(228, 135, 21, 0.08)' }}
        >
          {/* Top accent strip — Fulvous gradient */}
          <div
            className="h-1.5"
            style={{ background: 'linear-gradient(90deg, #E48715 0%, #E7B02F 50%, #62A758 100%)' }}
          />

          <div className="p-8 sm:p-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: '#E48715' }}>
              An AI Central exclusive
            </p>

            <h1 className="text-[32px] sm:text-[36px] font-black leading-[1.05] mb-3" style={{ color: '#333333' }}>
              Find where you sit on the AI ladder
            </h1>

            <p className="text-[15px] leading-relaxed mb-7" style={{ color: '#555' }}>
              10 questions. 90 seconds. A senior-coded plan matched to how you actually work today, not how a generic course thinks you do
            </p>

            <Link
              href="/quiz-v2"
              className="block w-full py-4 font-black text-[15px] rounded-xl text-center transition-all active:scale-[0.99]"
              style={{ backgroundColor: '#333333', color: '#FFFDFA' }}
            >
              Begin →
            </Link>

            <p className="mt-3 text-[11px] text-center" style={{ color: '#9C9C9C' }}>
              Free · No credit card · 90 seconds
            </p>

            <div className="h-px my-7" style={{ backgroundColor: '#E8E4DF' }} />

            {/* What you get — left-aligned list with Fulvous arrows */}
            <p className="text-[10px] font-black uppercase tracking-[0.18em] mb-4" style={{ color: '#9C9C9C' }}>
              What you walk away with
            </p>
            <ul className="flex flex-col gap-3">
              {[
                'Your stage on the 6-level AI adoption ladder',
                'Your persona: decision-maker, operator, maker, or learner',
                'The one blocker holding you back, decoded',
                'A 30-day next-action mapped to your role and tools',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[14px]" style={{ color: '#333333' }}>
                  <span className="font-black text-[14px] mt-px flex-shrink-0" style={{ color: '#E48715' }}>→</span>
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>

            <div className="h-px my-7" style={{ backgroundColor: '#E8E4DF' }} />

            {/* Stats strip */}
            <div className="flex items-center justify-around">
              {[
                { num: '45k+', label: 'subscribers', color: '#3B4C99' },
                { num: '6 stages', label: 'AI ladder', color: '#E48715' },
                { num: '90 sec', label: 'to complete', color: '#62A758' },
              ].map(({ num, label, color }) => (
                <div key={label} className="text-center">
                  <p className="text-[18px] font-black tabular-nums" style={{ color }}>{num}</p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: '#9C9C9C' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer bar — Fulvous accent top */}
      <footer className="pb-8 pt-6 text-center border-t z-10" style={{ borderColor: '#E48715' }}>
        <p className="text-[11px]" style={{ color: '#9C9C9C' }}>
          AI Central ·{' '}
          <a href="https://thecentral.ai/privacy" className="hover:opacity-70 transition-opacity" style={{ color: '#9C9C9C' }}>Privacy</a>
          {' '}· No spam, ever
        </p>
      </footer>
    </div>
  )
}
