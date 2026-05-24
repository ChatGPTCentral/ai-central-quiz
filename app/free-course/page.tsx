import { Suspense } from 'react'
import Link from 'next/link'
import AICentralLogo from '@/components/AICentralLogo'

const FREE_RESOURCES = [
  {
    icon: '📖',
    title: 'AI Quick Start Guide',
    description: '7 practical AI moves any professional can make this week -- no technical background required.',
    link: 'https://thecentral.ai/start',
    cta: 'Read the guide →',
  },
  {
    icon: '🎯',
    title: 'The Prompt Engineering Starter Pack',
    description: '10 proven prompt templates for writing, research, analysis, and email -- ready to copy and use today.',
    link: 'https://thecentral.ai/prompts',
    cta: 'Get the templates →',
  },
  {
    icon: '🗞',
    title: 'AI Central Newsletter',
    description: "3x/week -- practical AI insights, tool reviews, and workflow breakdowns for professionals who don't have time to waste.",
    link: 'https://thecentral.ai',
    cta: 'Start reading →',
  },
]

function FreeCourseContent({ name }: { name: string }) {
  const displayName = name || 'there'

  return (
    <div className="min-h-screen bg-baby-powder flex flex-col">
      <nav className="border-b border-[#E8E4DF] px-6 py-4">
        <AICentralLogo />
      </nav>

      <main className="flex-1 max-w-xl mx-auto w-full px-6 py-12">
        {/* Header */}
        <p className="text-xs font-bold tracking-widest uppercase text-fulvous mb-4">Free resources</p>
        <h1 className="text-3xl font-black text-jet-black mb-3 leading-tight text-balance">
          No problem, {displayName} -- here's where to start for free
        </h1>
        <p className="text-base text-battleship-grey mb-10 leading-relaxed">
          You're already subscribed to AI Central. Below are the best free resources to begin with right now -- no credit card, no catch.
        </p>

        {/* Free resources */}
        <div className="flex flex-col gap-4 mb-10">
          {FREE_RESOURCES.map((r) => (
            <a
              key={r.title}
              href={r.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-4 p-5 bg-white border border-[#E8E4DF] rounded-xl hover:border-fulvous hover:shadow-sm transition-all group"
            >
              <span className="text-2xl flex-shrink-0">{r.icon}</span>
              <div>
                <p className="font-bold text-jet-black text-sm mb-1 group-hover:text-fulvous transition-colors">{r.title}</p>
                <p className="text-xs text-battleship-grey leading-relaxed mb-2">{r.description}</p>
                <p className="text-xs font-bold text-fulvous">{r.cta}</p>
              </div>
            </a>
          ))}
        </div>

        {/* Soft re-offer */}
        <div className="bg-cosmic-latte border border-[#E8E4DF] rounded-xl p-6 text-center">
          <p className="text-sm font-bold text-jet-black mb-1">Changed your mind?</p>
          <p className="text-xs text-battleship-grey mb-4 leading-relaxed">
            The personalized plan is still available. 30-day money-back guarantee.
          </p>
          <Link
            href="/result"
            className="inline-block px-5 py-2.5 border-2 border-jet-black rounded-lg text-sm font-bold text-jet-black hover:bg-jet-black hover:text-baby-powder transition-colors"
          >
            See my plan again →
          </Link>
        </div>
      </main>

      <footer className="border-t border-[#E8E4DF] px-6 py-4 text-center mt-8">
        <p className="text-xs text-battleship-grey">
          AI Central ·{' '}
          <a href="https://thecentral.ai/privacy" className="hover:text-jet-black transition-colors">Privacy Policy</a>
          {' '}·{' '}
          <a href="https://thecentral.ai" className="hover:text-jet-black transition-colors">thecentral.ai</a>
        </p>
      </footer>
    </div>
  )
}

export default function FreeCoursePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const name = searchParams.name ? decodeURIComponent(searchParams.name) : ''
  return (
    <Suspense fallback={<div className="min-h-screen bg-baby-powder" />}>
      <FreeCourseContent name={name} />
    </Suspense>
  )
}
