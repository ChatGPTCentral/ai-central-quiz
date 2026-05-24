import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import AICentralLogo from '@/components/AICentralLogo'
import CountdownTimer from '@/components/CountdownTimer'
import FomoPopup from '@/components/FomoPopup'
import GaugeChart from '@/components/GaugeChart'
import { ARCHETYPES, type ArchetypeKey } from '@/lib/archetypes'
import { SALES_CONTENT, TESTIMONIALS } from '@/lib/sales-content'
import { scoreLabel } from '@/lib/score'
import { toolsForArchetype, toolIcon } from '@/lib/affiliates'

const PAYMENT_URL = process.env.NEXT_PUBLIC_PAYMENT_URL || 'https://buy.stripe.com/14A5kC67m22McnWfBxdQQ0e'
const UPSELL_URL = process.env.NEXT_PUBLIC_UPSELL_URL || 'https://buy.stripe.com/7sIcQe7NAgLT8s8008'

// Pricing & benefits — sourced verbatim from upgrade.thecentral.ai
const PLAN_BENEFITS = [
  '1,200+ Practical AI Implementations',
  'Clear, Non-Technical Explanations',
  'Ready-to-Use Business Templates',
  'Professional Community Access',
  'Tested Prompt Libraries',
  'Tool Reviews & Comparisons',
  'Step-by-Step Implementation',
  'Expert-Curated Content',
  'Weekly Updates & New Content',
  'All Future Features Included',
]
const SALE_PRICE = '$4.99'
const RENEWAL_COPY = 'Then $59.75/year (just $4.98/mo) · Cancel anytime'

const FAQS = [
  {
    q: "I'm not technical. Will these tutorials make sense to me?",
    a: 'Yes — that\'s exactly who we built this for. Every tutorial is written in plain English with step-by-step screenshots. Mike Chen had zero tech background and built his first ChatGPT workflow in 30 minutes. If you can use email, you can use this.',
  },
  {
    q: 'How is this different from free AI content online?',
    a: 'Free content is endless, unstructured, and outdated by the time you find it. AI Central is 1,200+ tutorials curated by editors so you don\'t sift through noise. Every tutorial is tested, current, and tied to a real business outcome. You get a sequenced path, not a search bar.',
  },
  {
    q: 'Will this work for my specific industry and role?',
    a: 'Members come from sales, marketing, ops, finance, legal, HR, product, consulting, research, and more. Your personalized plan above already tells you which workflows match your role. Use the search and category filters inside the library to drill into your function.',
  },
  {
    q: 'How quickly will I see practical results?',
    a: '15 minutes to your first result. Most members implement at least one AI workflow during their very first session. Rachel saved 15 hours in her first week. Alex shipped 3 automations in week one. The platform is built so you start applying — not just consuming.',
  },
  {
    q: "What if I'm not satisfied with the content?",
    a: '30-day money-back guarantee, no questions asked. Email admin@theaicentral.net within 30 days and we refund you same day. We\'d rather lose the $4.99 than have you stay if it isn\'t the right fit.',
  },
  {
    q: 'What happens after my 1-month trial?',
    a: 'After your first month at $4.99, your subscription renews at $59.75/year (about $4.98/month) — billed annually so you keep momentum without thinking about it. Cancel anytime from your dashboard in 2 clicks, and you keep access through the end of your billing period.',
  },
  {
    q: 'Can I get lifetime access instead?',
    a: 'Yes. There\'s a one-time lifetime option below the trial CTA. Pay once, get every current and future tutorial forever — no renewals.',
  },
]

interface NetLineResource {
  title: string
  description: string
  imageUrl: string
  trackingUrl: string
}

async function fetchTutorialsForArchetype(keywords: string[]): Promise<NetLineResource[]> {
  try {
    const res = await fetch(
      'https://cts.tradepub.com/cts3/?ptnr=gptcentral&fmt=xml&ver=04gptcentral',
      { next: { revalidate: 3600 } },
    )
    if (!res.ok) return []
    const xml = await res.text()
    const blocks = xml.match(/<Publication>[\s\S]*?<\/Publication>/g) || []
    const all: NetLineResource[] = []

    for (const block of blocks) {
      const title = block.match(/<PubName><!\[CDATA\[(.*?)\]\]>/)?.[1]?.trim() || block.match(/<PubName>(.*?)<\/PubName>/)?.[1]?.trim() || ''
      const description = block.match(/<PubShortDescription><!\[CDATA\[(.*?)\]\]>/)?.[1]?.trim() || block.match(/<PubShortDescription>(.*?)<\/PubShortDescription>/)?.[1]?.trim() || ''
      const imageUrl = block.match(/<ImageURL><!\[CDATA\[(.*?)\]\]>/)?.[1]?.trim() || block.match(/<ImageURL>(.*?)<\/ImageURL>/)?.[1]?.trim() || ''
      const trackingUrl = block.match(/<TrackingURL><!\[CDATA\[(.*?)\]\]>/)?.[1]?.trim() || block.match(/<TrackingURL>(.*?)<\/TrackingURL>/)?.[1]?.trim() || ''
      if (title && imageUrl) all.push({ title, description, imageUrl, trackingUrl })
    }

    // Score by keyword match
    const scored = all.map(r => {
      const haystack = `${r.title} ${r.description}`.toLowerCase()
      const matches = keywords.filter(k => haystack.includes(k.toLowerCase())).length
      return { r, matches }
    })
    scored.sort((a, b) => b.matches - a.matches)
    return scored.slice(0, 3).map(s => s.r)
  } catch {
    return []
  }
}

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 14 14" fill="#E7B02F">
          <path d="M7 1l1.8 3.6L13 5.3l-3 2.9.7 4.1L7 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.7L7 1z"/>
        </svg>
      ))}
    </div>
  )
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="border-b border-[#E8E4DF] group">
      <summary className="flex items-center justify-between py-4 cursor-pointer list-none font-semibold text-jet-black text-sm">
        {q}
        <span className="ml-4 flex-shrink-0 text-battleship-grey group-open:rotate-45 transition-transform duration-200 text-lg leading-none">+</span>
      </summary>
      <p className="pb-4 text-sm text-battleship-grey leading-relaxed">{a}</p>
    </details>
  )
}

async function ResultContent({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const archetypeKey = searchParams.archetype as ArchetypeKey | undefined
  const name = searchParams.name ? decodeURIComponent(searchParams.name) : ''
  const scoreRaw = parseInt(searchParams.score || '0', 10)
  const score = isNaN(scoreRaw) || scoreRaw <= 0 ? 50 : scoreRaw

  if (!archetypeKey || !ARCHETYPES[archetypeKey]) notFound()

  const archetype = ARCHETYPES[archetypeKey]
  const sales = SALES_CONTENT[archetypeKey]
  const label = scoreLabel(score)

  const tutorials = await fetchTutorialsForArchetype(archetype.tutorialKeywords)
  const tools = toolsForArchetype(archetypeKey, 6)

  return (
    <>
      <CountdownTimer paymentUrl={PAYMENT_URL} />

      <div className="pt-10 min-h-screen flex flex-col bg-baby-powder">
        {/* Nav */}
        <nav className="border-b border-[#E8E4DF] px-6 py-4">
          <AICentralLogo />
        </nav>

        {/* ── MODULE 1: YOUR SCORE (gauge) ───────────────────── */}
        <section className="px-6 pt-10 pb-8 max-w-2xl mx-auto w-full">
          <p className="text-xs font-bold tracking-widest uppercase text-battleship-grey mb-2 text-center">
            Your AI Adoption Score
          </p>
          <h2 className="text-2xl sm:text-3xl font-black text-black text-center leading-tight mb-1">
            You&apos;re ahead of {score}% of professionals
          </h2>
          <p className="text-sm text-battleship-grey text-center mb-6">
            Across your industry, in AI adoption today
          </p>
          <GaugeChart value={score} label={label} />
        </section>

        {/* ── MODULE 2: YOUR AI BUSINESS TYPE ────────────────── */}
        <section className="px-6 pt-10 pb-6 max-w-2xl mx-auto w-full">
          <p className="text-xs font-bold tracking-widest uppercase text-battleship-grey mb-2">
            Your AI Business Type
          </p>
          <div className="rounded-xl p-6 mb-4 bg-white border border-[#E8E4DF]">
            <h1 className="text-3xl sm:text-4xl font-black text-black mb-3">
              {archetype.label}
            </h1>
            <p className="text-[15px] text-jet-black leading-relaxed">
              {archetype.description}
            </p>
          </div>
        </section>

        {/* ── MODULE 3: PRIMARY CTA ─────────────────────────── */}
        <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
          <a
            href={PAYMENT_URL}
            className="block w-full text-center py-4 rounded-lg font-bold text-base text-white bg-black hover:bg-[#222] transition-colors"
          >
            View my custom learning plan →
          </a>
          <p className="text-center text-xs text-battleship-grey mt-2">
            $4.99 first month · Then $59.75/year · Cancel anytime
          </p>
          <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-battleship-grey">
            <span>⭐ 350+ five-star reviews</span>
            <span>·</span>
            <span>30-day guarantee</span>
            <span>·</span>
            <span>Instant access</span>
          </div>
        </section>

        {/* ── MODULE 4: COMMENTARY ──────────────────────────── */}
        <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
          <h2 className="text-2xl font-black text-jet-black mb-6">
            {sales.truthHeading}{name ? `, ${name}` : ''}.
          </h2>
          {sales.truthParagraphs.map((p, i) => (
            <p key={i} className="text-base text-jet-black leading-relaxed mb-4">{p}</p>
          ))}
        </section>

        {/* ── MODULE 5: RECOMMENDED AI TUTORIALS (1x3) ──────── */}
        {tutorials.length > 0 && (
          <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
            <div className="h-px bg-[#E8E4DF] mb-8" />
            <h2 className="text-xl font-black text-jet-black mb-1">Recommended AI tutorials</h2>
            <p className="text-sm text-battleship-grey mb-6">
              Curated for {archetype.label}s — included with your plan
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {tutorials.slice(0, 3).map((t, i) => (
                <div
                  key={i}
                  className="flex flex-col bg-white border border-[#E8E4DF] rounded-xl overflow-hidden"
                >
                  {t.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.imageUrl}
                      alt={t.title}
                      className="w-full aspect-[4/3] object-cover bg-[#F2F2F2]"
                    />
                  )}
                  <div className="p-3">
                    <p className="font-bold text-black text-[13px] leading-snug line-clamp-3">{t.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── MODULE 6: RECOMMENDED AI TOOLS (2x3) ──────────── */}
        {tools.length > 0 && (
          <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
            <div className="h-px bg-[#E8E4DF] mb-8" />
            <h2 className="text-xl font-black text-jet-black mb-1">Recommended AI tools</h2>
            <p className="text-sm text-battleship-grey mb-6">
              The tools we use ourselves — with exclusive AI Central deals
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {tools.map((tool) => (
                <a
                  key={tool.name}
                  href={tool.link}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-[#E8E4DF] rounded-xl hover:border-[#AAAAAA] transition-colors group min-h-[110px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={toolIcon(tool.domain)}
                    alt={tool.name}
                    className="w-10 h-10 object-contain rounded"
                  />
                  <span className="text-[13px] font-bold text-black text-center leading-tight">{tool.name}</span>
                  {tool.offer && (
                    <span className="text-[10px] text-green-700 font-medium text-center leading-tight line-clamp-1">{tool.offer}</span>
                  )}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* ── MODULE 7: TRUSTED BY (testimonials) ──────────── */}
        <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
          <div className="h-px bg-[#E8E4DF] mb-8" />
          <h2 className="text-xl font-black text-jet-black mb-2 text-center">Hear from our members</h2>
          <p className="text-sm text-battleship-grey text-center mb-6">Real professionals. Real results. 350+ five-star reviews.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="p-4 bg-white border border-[#E8E4DF] rounded-xl flex flex-col gap-2">
                <StarRating count={t.stars} />
                <p className="text-sm text-jet-black leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-auto pt-2">
                  <p className="text-xs font-bold text-jet-black">{t.name}</p>
                  <p className="text-xs text-battleship-grey">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── MODULE 8: UNLOCK YOUR PERSONALIZED PLAN ───────── */}
        <section className="px-6 pb-10 max-w-2xl mx-auto w-full" id="pricing">
          <div className="h-px bg-[#E8E4DF] mb-8" />
          <h2 className="text-2xl sm:text-3xl font-black text-jet-black mb-2 text-center">
            Unlock the Ultimate AI Library
          </h2>
          <p className="text-sm text-battleship-grey text-center mb-2 max-w-md mx-auto">
            1,200+ curated AI &amp; ChatGPT tutorials. Save months of trial-and-error.
          </p>
          {/* Stat strip — pulled from upgrade page */}
          <div className="grid grid-cols-4 gap-2 max-w-md mx-auto mb-6 mt-4 text-center">
            {[
              { num: '2,000+', lbl: 'Professionals' },
              { num: '1,200+', lbl: 'Tutorials' },
              { num: '15 min', lbl: 'To 1st result' },
              { num: '89%', lbl: 'Report value' },
            ].map((s) => (
              <div key={s.lbl}>
                <p className="text-base sm:text-lg font-black text-black leading-tight">{s.num}</p>
                <p className="text-[10px] text-battleship-grey uppercase tracking-wide leading-tight">{s.lbl}</p>
              </div>
            ))}
          </div>

          <div className="border-2 border-jet-black rounded-xl overflow-hidden">
            {/* Most Popular ribbon */}
            <div className="bg-black text-white text-center py-2 text-[11px] font-black uppercase tracking-widest">
              Most Popular
            </div>

            <div className="p-5 border-b border-[#E8E4DF]">
              <p className="text-xs font-bold uppercase tracking-widest text-battleship-grey mb-4">What&apos;s included</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PLAN_BENEFITS.map((label) => (
                  <div key={label} className="flex items-start gap-2 text-sm text-jet-black">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-0.5">
                      <circle cx="7" cy="7" r="7" fill="black" opacity="0.1"/>
                      <path d="M4.5 7l1.8 1.8L9.5 5" stroke="black" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="leading-snug">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 bg-[#F9F9F7]">
              <div className="flex items-end justify-between mb-1">
                <span className="font-black text-jet-black text-lg">Your price today</span>
                <div className="text-right leading-none">
                  <span className="font-black text-jet-black text-4xl">{SALE_PRICE}</span>
                  <p className="text-xs text-battleship-grey mt-1">first month</p>
                </div>
              </div>
              <p className="text-xs text-battleship-grey text-right mb-5">{RENEWAL_COPY}</p>

              <a
                href={PAYMENT_URL}
                className="block w-full text-center py-4 rounded-lg font-black text-base text-white bg-black hover:bg-[#222] transition-colors"
              >
                Start my 1-month trial →
              </a>

              {/* Trust strip */}
              <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-battleship-grey">
                <span className="inline-flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1L7.5 4 11 4.5 8.5 7 9 11 6 9 3 11 3.5 7 1 4.5 4.5 4z" fill="#E7B02F"/></svg>
                  30-day guarantee
                </span>
                <span>·</span>
                <span>Instant access</span>
              </div>

              <div className="text-center mt-3">
                <a
                  href={UPSELL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-battleship-grey hover:text-jet-black transition-colors underline underline-offset-2"
                >
                  Or get lifetime access →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── MODULE 9: FAQs ─────────────────────────────────── */}
        <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
          <div className="h-px bg-[#E8E4DF] mb-8" />
          <h2 className="text-xl font-black text-jet-black mb-6 text-center">Frequently asked questions</h2>
          <div>
            {FAQS.map((item) => (
              <FAQItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </section>

        {/* ── MODULE 10: AI DOESN'T HAVE TO BE COMPLICATED ──── */}
        <section className="px-6 pb-16 max-w-2xl mx-auto w-full">
          <div className="rounded-xl p-8 sm:p-10 text-center bg-black">
            <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">AI doesn&apos;t have to be complicated</h2>
            <p className="text-[15px] text-white opacity-80 mb-6 max-w-md mx-auto leading-relaxed">
              Join 2,000+ professionals already using the AI Central library — 1,200+ curated tutorials, 15 minutes to your first result, no fluff.
            </p>
            <a
              href={PAYMENT_URL}
              className="inline-block px-8 py-4 bg-white font-black text-sm text-black rounded-lg transition-opacity hover:opacity-90"
            >
              Start my 1-month trial — $4.99 →
            </a>
            <p className="text-[11px] text-white opacity-50 mt-3">
              Then $59.75/year · Cancel anytime · 30-day money-back guarantee
            </p>
            <div className="mt-3">
              <a
                href={UPSELL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white opacity-50 hover:opacity-80 transition-opacity underline"
              >
                Or get lifetime access →
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[#E8E4DF] px-6 py-4 text-center">
          <p className="text-xs text-battleship-grey">
            AI Central ·{' '}
            <a href="https://thecentral.ai/privacy" className="hover:text-jet-black transition-colors">Privacy Policy</a>
            {' '}·{' '}
            <a href="https://thecentral.ai" className="hover:text-jet-black transition-colors">thecentral.ai</a>
          </p>
        </footer>
      </div>

      {/* Sticky bottom bar (mobile) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E8E4DF] px-4 py-3 flex items-center justify-between gap-3 sm:hidden z-40">
        <div>
          <p className="text-xs font-bold text-jet-black">{SALE_PRICE}/mo today</p>
          <p className="text-[10px] text-battleship-grey">30-day guarantee</p>
        </div>
        <a
          href={PAYMENT_URL}
          className="flex-shrink-0 px-5 py-2.5 rounded-lg font-bold text-sm text-white bg-black hover:bg-[#222] transition-colors"
        >
          Start trial →
        </a>
      </div>

      <FomoPopup />
    </>
  )
}

export default function ResultPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-baby-powder">
        <div className="w-8 h-8 rounded-full border-4 border-[#E8E4DF] border-t-black animate-spin" />
      </div>
    }>
      <ResultContent searchParams={searchParams} />
    </Suspense>
  )
}
