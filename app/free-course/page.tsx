import { Suspense } from 'react'
import Link from 'next/link'
import AICentralLogo from '@/components/AICentralLogo'
import { FreeCourseSignup } from '@/components/free-course/FreeCourseSignup'

export const metadata = {
  title: 'Free 5-day AI email course · AI Central',
  description: 'Master practical AI basics in 5 days. One short lesson a day, straight to your inbox, free, no card.',
}

const LIBRARY = process.env.NEXT_PUBLIC_LIBRARY_URL || 'https://app.thecentral.ai'

const DAYS = [
  { day: 'Day 1', title: 'The 6-Step Prompt Formula', sub: 'Stop getting generic AI outputs forever' },
  { day: 'Day 2', title: 'ChatGPT Projects & Workspaces', sub: 'Set up AI workspaces for 10x output' },
  { day: 'Day 3', title: 'AI-Powered Presentations', sub: 'Polished decks in minutes with Gamma' },
  { day: 'Day 4', title: 'Your First Automation', sub: 'Wire two tools together, no code' },
  { day: 'Day 5', title: 'Your AI Action Plan', sub: 'Build your personal implementation roadmap' },
]

const FAQ = [
  { q: 'Is this really free?', a: 'Yes, the 5-day course is completely free. No card, no catch, unsubscribe anytime.' },
  { q: 'What will I learn?', a: 'The AI fundamentals every professional needs: prompting, workspaces, presentations, a first automation, and a plan to keep going, one short lesson a day.' },
  { q: 'How is this different from the full library?', a: 'This is a free 5-day primer delivered by email. The AI Central library is 1,200+ tested tutorials, templates, and a community, the full path for when you\'re ready.' },
  { q: 'Do I need a technical background?', a: 'Not at all. Every lesson is written in plain English for busy professionals. If you can use email, you can use this.' },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="border-b border-[#E8E4DF] group">
      <summary className="flex items-center justify-between py-4 cursor-pointer list-none font-semibold text-[14px]" style={{ color: '#333333' }}>
        {q}
        <span className="ml-4 flex-shrink-0 transition-transform duration-200 text-lg leading-none group-open:rotate-45" style={{ color: '#9C9C9C' }}>+</span>
      </summary>
      <p className="pb-4 text-[13px] leading-relaxed" style={{ color: '#555' }}>{a}</p>
    </details>
  )
}

function PhonePreview() {
  return (
    <div
      className="relative mx-auto w-[260px] rounded-[38px] p-2.5"
      style={{ backgroundColor: '#1A1A1A', boxShadow: '0 20px 50px rgba(0,0,0,0.18)' }}
      aria-label="Course email preview"
    >
      <div className="absolute left-1/2 top-2.5 -translate-x-1/2 h-4 w-24 rounded-b-2xl" style={{ backgroundColor: '#1A1A1A', zIndex: 2 }} />
      <div className="rounded-[30px] overflow-hidden" style={{ backgroundColor: '#FFFDFA' }}>
        <div className="px-3 pt-7 pb-3">
          <div className="flex items-center gap-2 rounded-full px-3 py-2 text-[11px]" style={{ backgroundColor: '#F1ECE3', color: '#9C9C9C' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Search in mail
          </div>
          <p className="mt-3 mb-1 text-[10px] font-black uppercase tracking-wider" style={{ color: '#9C9C9C' }}>Primary</p>
          <div className="flex flex-col">
            {DAYS.map((d) => (
              <div key={d.day} className="flex items-start gap-2.5 py-2.5 border-t" style={{ borderColor: '#F1ECE3' }}>
                <div className="mt-0.5 h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-[10px] font-black" style={{ backgroundColor: '#FEF7E7', color: '#E48715' }}>
                  AI
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold truncate" style={{ color: '#333333' }}>AI Central</span>
                    <span className="text-[10px] shrink-0" style={{ color: '#B7B0A4' }}>{d.day}</span>
                  </div>
                  <p className="text-[12px] font-bold leading-snug truncate" style={{ color: '#333333' }}>{d.title}</p>
                  <p className="text-[11px] leading-snug truncate" style={{ color: '#9C9C9C' }}>{d.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function FreeCourseContent({ name, email }: { name: string; email: string }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#FFFDFA' }}>
      <nav className="border-b border-[#E8E4DF] px-5 sm:px-8 py-4 flex items-center justify-between">
        <AICentralLogo height={22} />
        <Link href="/result" className="text-[13px] font-semibold transition-colors" style={{ color: '#9C9C9C' }}>
          ← Back
        </Link>
      </nav>

      <main className="flex-1 w-full">
        {/* Hero */}
        <section className="max-w-5xl mx-auto w-full px-6 pt-10 sm:pt-14 pb-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] mb-4" style={{ color: '#E48715' }}>
                Free 5-day email course
              </p>
              <h1 className="text-[34px] sm:text-[44px] font-black leading-[1.05] mb-4" style={{ color: '#333333' }}>
                Master practical AI basics in 5 days
              </h1>
              <p className="text-[16px] leading-relaxed mb-6 max-w-md" style={{ color: '#555' }}>
                {name ? `${name}, no problem — ` : ''}a focused email course that teaches the AI fundamentals every
                professional needs. One short lesson a day, straight to your inbox.
              </p>
              <FreeCourseSignup name={name} email={email} />
            </div>

            <div className="flex justify-center md:justify-end">
              <PhonePreview />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-xl mx-auto w-full px-6 py-10">
          <h2 className="text-[22px] sm:text-[26px] font-black mb-4 text-center" style={{ color: '#333333' }}>
            Frequently asked questions
          </h2>
          <div>
            {FAQ.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </section>

        {/* Soft re-offer */}
        <section className="max-w-xl mx-auto w-full px-6 pb-14">
          <div className="rounded-2xl p-6 text-center" style={{ backgroundColor: '#F4F1EA', border: '1px solid #E8E4DF' }}>
            <p className="text-[15px] font-black mb-1" style={{ color: '#333333' }}>Ready for the full path?</p>
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: '#555' }}>
              The 1,200+ tutorial library is there when you want to go deeper. 30-day money-back guarantee.
            </p>
            <a
              href={`${LIBRARY}/pricing`}
              className="inline-block px-5 py-2.5 rounded-xl text-[14px] font-bold transition-colors"
              style={{ border: '2px solid #333333', color: '#333333' }}
            >
              See the full library →
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E8E4DF] px-6 py-5 text-center">
        <p className="text-[12px]" style={{ color: '#9C9C9C' }}>
          AI Central ·{' '}
          <a href="https://thecentral.ai/privacy" className="hover:text-[#333333] transition-colors">Privacy Policy</a>
          {' '}·{' '}
          <a href="https://thecentral.ai" className="hover:text-[#333333] transition-colors">thecentral.ai</a>
        </p>
      </footer>
    </div>
  )
}

export default function FreeCoursePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const name = searchParams.name ? decodeURIComponent(searchParams.name) : ''
  const email = searchParams.email ? decodeURIComponent(searchParams.email) : ''
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: '#FFFDFA' }} />}>
      <FreeCourseContent name={name} email={email} />
    </Suspense>
  )
}
