import { Suspense } from 'react'
import { Mrs_Saint_Delafield } from 'next/font/google'
import { createClient } from '@supabase/supabase-js'
import CountdownTimer from '@/components/CountdownTimer'
import TrackView from '@/components/TrackView'
import InlineCountdown from '@/components/InlineCountdown'
import FomoPopup from '@/components/FomoPopup'
import CheckoutLink from '@/components/CheckoutLink.client'
import { ExitRescue } from '@/components/result/ExitRescue.client'
import ExperimentTracker from '@/components/ExperimentTracker.client'
import { SocialProofMarquee } from '@/components/result/SocialProofMarquee'
import { RadarChart } from '@/components/RadarChart'
import { BandChart } from '@/components/result/BandChart'
import { PassCard } from '@/components/result/PassCard'
import { personaContent } from '@/lib/persona-content'
import { readinessType } from '@/lib/readiness-type'
import { computeRadarAxes } from '@/lib/readiness-radar'
import { rungConfig, withPersona, withFirstName } from '@/lib/rung-content'
import { getLivePublishedConfig } from '@/lib/form-config'
import type { EndScreen } from '@/lib/form-schema'
import { pickEndScreen } from '@/lib/form-schema'
import { resolveExperiments } from '@/lib/experiments'
import { cookies, headers } from 'next/headers'

// Script font used ONLY for the founder-letter signature (design handoff).
const signatureFont = Mrs_Saint_Delafield({ weight: '400', subsets: ['latin'] })

interface SegFields {
  email?: string | null
  utm_source?: string | null
  stage?: string | null
  persona?: string | null
  friction?: string | null
  intent_30d?: string | null
  frequency_score?: number | null
  depth_score?: number | null
  breadth_score?: number | null
  momentum?: number | null
  ai_tools?: string | null
  job_level?: string | null
  score?: number | null
}

/** Server-side fetch of v2 segment + per-axis score fields, if id is provided. */
async function fetchSegmentFields(id: string | undefined): Promise<SegFields | null> {
  if (!id) return null
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return null
    const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await c
      .from('submissions')
      .select('email, stage, persona, friction, intent_30d, frequency_score, depth_score, breadth_score, momentum, ai_tools, job_level, score, utm_source')
      .eq('id', id)
      .maybeSingle()
    return (data as SegFields) || null
  } catch { return null }
}

const UPSELL_URL = process.env.NEXT_PUBLIC_UPSELL_URL || 'https://buy.stripe.com/7sIcQe7NAgLT8s8008'
// Direct $4.99 trial Stripe link — every paid CTA on this page goes straight
// to checkout (decision: no app.thecentral.ai handoff).
const STRIPE_TRIAL_URL = process.env.NEXT_PUBLIC_PAYMENT_URL || 'https://buy.stripe.com/14A5kC67m22McnWfBxdQQ0e'

// ── Design tokens (from the design handoff) ─────────────────────────
const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const PAPER = '#FFFDFA'
const FULVOUS = '#E48715'
const XANTHOUS = '#E7B02F'

// Subtle paper grain for the hero — inline SVG turbulence instead of the
// 3MB texture PNG from the handoff bundle.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")"

// ── Static copy (design handoff, dashes normalized to commas) ───────
const PILLARS = [
  { label: 'TUTORIALS', n: '1,200+', body: 'Tested workflows tied to business outcomes. Step by step, no theory chapters' },
  { label: 'TEMPLATES', n: '50+', body: 'Prompts, decks, briefs, automations. Copy, paste, ship' },
  { label: 'COMMUNITY', n: '2,000+', body: 'Paying members: operators, founders, decision-makers doing your work' },
  { label: 'EDITORIAL', n: 'Weekly', body: 'We filter 14,000+ tools and 50+ papers down to what deserves your attention' },
]

// "Before vs After the AI Library" comparison (content from upgrade.thecentral.ai)
const BEFORE_ITEMS = [
  { title: 'Overwhelmed by AI Noise', description: 'Cut through endless content to find what actually works for your business.' },
  { title: 'No Time to Experiment', description: 'Get proven solutions instead of wasting hours on trial and error.' },
  { title: 'Fragmented Information', description: 'Access organized, comprehensive knowledge in one trusted platform.' },
  { title: 'External Pressure to Perform', description: 'Stay competitive with practical AI skills that deliver real results.' },
]
const AFTER_ITEMS = [
  { title: 'Clear AI Confidence', description: 'Implement proven AI solutions with step-by-step clarity and immediate results.' },
  { title: 'Instant Implementation', description: 'Save 15+ hours per week with tested automations and productivity frameworks.' },
  { title: 'Professional Authority', description: 'Become the go-to AI expert in your organization with comprehensive knowledge.' },
  { title: 'Competitive Edge', description: 'Access organized, comprehensive AI strategies that drive measurable business results.' },
]

const FAQS = [
  { q: "I'm not technical. Will these tutorials make sense to me?", a: 'Yes. Every tutorial is written for professionals, not developers: plain language, a screenshot at every step, nothing assumes you can code. If you can follow a recipe, you can ship these workflows' },
  { q: 'How is this different from free AI content online?', a: 'Free content is written to go viral. Ours is tested by editors and tied to a business outcome. You get a sequenced path for your role, not a search bar and 14,000 open tabs' },
  { q: 'Will this work for my specific industry and role?', a: 'The library covers operations, sales, marketing, legal, finance, HR and more. Your quiz result maps you to the workflows that fit your role first' },
  { q: 'How quickly will I see practical results?', a: 'Most members ship their first workflow in 15 minutes. One working automation in week 1 is the standard we design for' },
  { q: "What if I'm not satisfied with the content?", a: '30-day money-back guarantee. One email, full refund, no questions' },
  { q: 'What happens after my 1-month trial?', a: 'You move to the annual plan at $59.75/year, about $4.98 a month. Cancel anytime before renewal and pay nothing more' },
  { q: 'Can I get lifetime access instead?', a: 'Yes. One payment, every tutorial and template, all future drops included' },
]

const REVIEWS = [
  { name: 'Rachel Thompson', role: 'Operations Director · Portland, OR', text: 'Finally, AI tutorials that actually work. Saved 15 hours this week alone, the step-by-step approach makes everything clear' },
  { name: 'Alex Martinez', role: 'Product Manager', text: 'Implemented 3 AI automations in my first week. Productivity increased 200%' },
  { name: 'James Wilson', role: 'Business Consultant · Denver, CO', text: 'Transformed our client reporting process. What took days now takes hours, ROI was immediate' },
  { name: 'Mike Chen', role: 'Sales Manager', text: 'Zero tech background, built my first ChatGPT workflow in 30 minutes' },
  { name: 'Emma Rodriguez', role: 'Marketing Lead', text: 'My team thinks I hired an AI consultant. These guides are incredibly practical' },
  { name: 'Jessica Parker', role: 'Data Analyst · Seattle, WA', text: 'Data analysis that used to take me weeks now takes days. Clear, practical, immediately actionable' },
  { name: 'Sophie Anderson', role: 'HR Director', text: 'Became the go-to AI person at my company in 2 weeks' },
  { name: 'Carlos Mendez', role: 'Content Strategist', text: 'Content creation: 8 hours down to 2 hours. Efficiency gains are unbelievable' },
  { name: 'Marcus Johnson', role: 'VP of Sales · Atlanta, GA', text: "My sales team's productivity increased 180%. Deal closure rate improved dramatically" },
  { name: 'Amanda Wright', role: 'Legal Counsel', text: 'Contract review automation saved our firm 40 hours per week' },
  { name: 'David Park', role: 'BI Lead · San Francisco, CA', text: 'Dashboard automation that would have taken 3 months was done in 2 weeks. Executive reporting has never been this compelling' },
  { name: 'Ryan Foster', role: 'Startup Founder', text: 'Bootstrap startup, limited resources. This library gave me enterprise-level AI capabilities' },
]

// ── Small building blocks ───────────────────────────────────────────

function Eyebrow({ children, color = FULVOUS }: { children: React.ReactNode; color?: string }) {
  return (
    <p className="uppercase" style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.05em', color }}>
      {children}
    </p>
  )
}

/** Two-piece block button from the handoff: label cell + fulvous arrow cell. */
function BlockButton({ href, label, gold = false, size = 17, placement = 'unknown', submissionId }: { href: string; label: string; gold?: boolean; size?: number; placement?: string; submissionId?: string }) {
  return (
    <CheckoutLink href={href} placement={placement} submissionId={submissionId} className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]" style={{ textDecoration: 'none' }}>
      <span
        className="inline-flex items-center"
        style={{
          backgroundColor: gold ? XANTHOUS : INK,
          color: gold ? RICH : CREAM,
          fontWeight: 600,
          fontSize: size,
          padding: '18px 26px',
        }}
      >
        {label}
      </span>
      <span
        className="inline-flex items-center justify-center"
        style={{
          backgroundColor: gold ? CREAM : FULVOUS,
          color: RICH,
          padding: 18,
          borderLeft: `2px solid ${RICH}`,
          fontWeight: 600,
          fontSize: size,
        }}
        aria-hidden
      >
        ↗
      </span>
    </CheckoutLink>
  )
}

function StarRow({ size = 14 }: { size?: number }) {
  return (
    <span style={{ color: XANTHOUS, letterSpacing: '0.15em', fontSize: size }} aria-label="5 stars">★★★★★</span>
  )
}

/** LinkedIn share button under the member pass. Shares the /pass URL whose
 *  Open Graph tags unfurl into the person's generated pass image, so the
 *  CARD (not just text) shows up in the feed. Styled to LinkedIn's brand
 *  (blue pill + logo), intentionally not the page's hard-edge style. */
function SharePass({ topPct, name, stageLabel, profileLabel }: {
  topPct: number
  name: string
  stageLabel: string
  profileLabel: string
}) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai'
  // Shared link: minimal params only (first name, stage, profile, pct) —
  // keeps the URL short and out of the unfurl; issued/ref fall back to
  // sensible defaults in the image route.
  const firstName = name.trim().split(/\s+/)[0] || 'AI Professional'
  const shareParams = new URLSearchParams({
    name: firstName,
    stage: stageLabel,
    profile: profileLabel,
    pct: String(topPct),
  })
  const shareUrl = `${site}/pass?${shareParams.toString()}`
  return (
    <div className="mt-5 flex justify-center">
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on LinkedIn"
        className="inline-flex items-center justify-center gap-2.5 rounded-full bg-[#0A66C2] hover:bg-[#004182] transition-colors"
        style={{ color: '#FFFFFF', padding: '12px 28px', fontSize: 15, fontWeight: 600 }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }} aria-hidden>
          <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
        </svg>
        Share on LinkedIn
      </a>
    </div>
  )
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group" style={{ borderBottom: '1px solid #D9D9D9' }}>
      <summary className="flex items-center justify-between py-4 cursor-pointer list-none" style={{ fontWeight: 600, fontSize: 15.5, color: INK }}>
        <span className="pr-4 group-open:text-[#E48715]">{q}</span>
        <span
          className="ml-4 flex-shrink-0 group-open:rotate-45 transition-transform duration-200 leading-none"
          style={{ color: FULVOUS, fontWeight: 300, fontSize: 22 }}
          aria-hidden
        >
          +
        </span>
      </summary>
      <p className="pb-5 max-w-[760px]" style={{ fontWeight: 300, fontSize: 14.5, lineHeight: 1.55, color: BODY }}>{a}</p>
    </details>
  )
}

// Personalized, searchParams-keyed checkout page — must never rank, and
// noindex also removes any experiment-cloaking question.
export const metadata = { robots: { index: false, follow: false } }

async function ResultContent({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const name = searchParams.name ? decodeURIComponent(searchParams.name) : ''
  const scoreRaw = parseInt(searchParams.score || '0', 10)
  const score = isNaN(scoreRaw) || scoreRaw <= 0 ? 50 : scoreRaw
  const rowId = searchParams.id

  const firstName = (name || '').trim().split(/\s+/)[0] || ''

  // V2 segment fields — server-fetched from the row id, optional
  const segFields = await fetchSegmentFields(rowId)
  // Persona is the single role taxonomy. Prefer the stored value; fall back
  // to the URL param the calculating page hands off when there's no row id.
  const persona = segFields?.persona ?? searchParams.persona ?? null
  const content = personaContent(persona)
  const rt = readinessType(segFields?.stage)
  // Per-rung page copy (design handoff), persona + first-name tokens resolved.
  const rung = rungConfig(segFields?.stage)
  const p = (s: string) => withFirstName(withPersona(s, content.label), firstName)

  // AI-competency radar axes (Prompting · Tools · Develop · Governance ·
  // Agents), computed from the person's quiz signals.
  const axes = computeRadarAxes(segFields ?? {})

  // Editor overrides: keep honoring an end-screen's ctaText/ctaUrl on the
  // primary CTA (safety valve); the heroHeadline/body-block system from the
  // previous layout is retired with this design.
  let endScreen: EndScreen | null = null
  try {
    const liveConfig = await getLivePublishedConfig('quiz-v2')
    endScreen = pickEndScreen(liveConfig?.endScreens ?? [], {
      score,
      persona: persona ?? null,
      stage: segFields?.stage ?? null,
      intent: segFields?.intent_30d ?? null,
      friction: segFields?.friction ?? null,
    })
  } catch (err) {
    console.warn('[result] failed to load editor endScreens, using defaults:', err)
  }
  const checkoutUrl = endScreen?.ctaUrl ?? STRIPE_TRIAL_URL
  const heroCtaLabel = endScreen?.ctaText ?? 'start my trial'

  // ── Experiments: sticky-first deterministic assignment (fails open) ──
  const cookieStore = cookies()
  const anonId = cookieStore.get('ac_aid')?.value ?? headers().get('x-anon-id') ?? null
  const { assignments, overrides } = await resolveExperiments({
    anonId,
    cookieVariant: k => cookieStore.get(`ac_exp_${k}`)?.value,
    stage: segFields?.stage ?? searchParams.stage ?? null,
    persona,
    utmSource: segFields?.utm_source ?? null,
    page: 'result',
  })
  // Override wins only for slots the variant sets; values run through the
  // same token pipeline ({firstName}/{persona}) as the rung content.
  const ov = (slot: string, current: string) => (overrides[slot] != null ? p(overrides[slot]) : current)

  // Member-pass fields
  const passName = (name || 'AI Professional').trim()
  const refNo = 'AC-' + (rowId ? rowId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : '0723')
  const now = new Date()
  const issued = `${String(now.getMonth() + 1).padStart(2, '0')} / ${now.getFullYear()}`

  // "You're a/an {Type}"
  const typeArticle = /^[aeiou]/i.test(rt.typeName) ? 'an' : 'a'

  return (
    <>
      <TrackView event="result_view" props={{ stage: segFields?.stage ?? searchParams.stage ?? null, persona, submissionId: rowId }} />
      <ExperimentTracker assignments={assignments} submissionId={rowId} />
      <CountdownTimer paymentUrl={checkoutUrl} refNo={refNo} submissionId={rowId} ctaLabel={ov('offerBar.ctaLabel', 'Claim offer ↗')} />

      <div className="flex flex-col" style={{ backgroundColor: PAPER, paddingTop: 56, color: INK }}>

        {/* ── 1 · HERO: quiz results + member pass ─────────────────── */}
        <section style={{ backgroundColor: PAPER, backgroundImage: GRAIN }}>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 pt-12 sm:pt-16 pb-14 sm:pb-20 grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-10 lg:gap-14 items-center">
            <div>
              <Eyebrow>Your quiz results</Eyebrow>
              <h1
                className="mt-4 font-bold"
                style={{ fontSize: 'clamp(36px, 5.2vw, 62px)', lineHeight: 0.98, letterSpacing: '-0.045em', color: RICH }}
              >
                {overrides['hero.headline']
                  ? p(overrides['hero.headline']).split('{aheadPct}').map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && <span style={{ color: FULVOUS }}>{rt.aheadPct}%</span>}
                      </span>
                    ))
                  : <>
                      {firstName ? `${firstName}, you're` : "You're"} ahead of{' '}
                      <span style={{ color: FULVOUS }}>{rt.aheadPct}%</span> of people on their AI journey
                    </>}
              </h1>
              <p className="mt-5 max-w-[520px]" style={{ fontWeight: 300, fontSize: 'clamp(17px, 2vw, 21px)', lineHeight: 1.45, color: BODY }}>
                {ov('hero.lead', p(rung.heroLead))}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-5">
                <BlockButton href={checkoutUrl} label={ov('hero.ctaLabel', heroCtaLabel)} placement="hero" submissionId={rowId} />
                <div style={{ fontSize: 13, color: '#666666', lineHeight: 1.5 }}>
                  $4.99 first month · then $59.75/year<br />cancel anytime · 30-day guarantee
                </div>
              </div>
            </div>
            <div>
              <PassCard
                name={passName}
                personaLabel={content.label}
                stageLine={`STAGE: ${rung.className}`}
                passPct={`Top ${100 - rt.aheadPct}% World`}
                issued={issued}
                refNo={refNo}
                description={content.outlook}
              />
              <SharePass
                topPct={100 - rt.aheadPct}
                name={passName}
                stageLabel={rung.className}
                profileLabel={content.label}
              />
            </div>
          </div>
        </section>

        {/* ── 1b · SOCIAL PROOF MARQUEE: reviews + recent purchases ── */}
        <SocialProofMarquee reviews={REVIEWS} checkoutUrl={checkoutUrl} submissionId={rowId} />

        {/* ── 2 · THE BIGGER PICTURE: adoption chart ───────────────── */}
        <section style={{ borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 py-14 sm:py-20">
            <Eyebrow>The bigger picture</Eyebrow>
            <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(30px, 4vw, 48px)', lineHeight: 0.98, letterSpacing: '-0.045em', color: RICH }}>
              {rung.chartTitle}
            </h2>
            <p className="mt-4 max-w-[640px]" style={{ fontWeight: 300, fontSize: 19, lineHeight: 1.45, color: BODY }}>
              {p(rung.chartLead)}
            </p>

            <div className="mt-9">
              <BandChart stage={segFields?.stage} />
            </div>

            {/* Pitch + primary unlock CTA */}
            <p className="mt-10 max-w-[640px]" style={{ fontWeight: 300, fontSize: 17, lineHeight: 1.55, color: BODY }}>
              According to OpenAI, World Bank and Microsoft adoption data, 84% of people still haven&apos;t
              used AI. The people who move now spend the next decade ahead. AI Central gets you there first
              with a library of curated resources and tutorials that speed up your AI journey
            </p>
            <div className="mt-7">
              <BlockButton href={checkoutUrl} label={ov('chart.ctaLabel', 'Unlock the Ultimate AI Library')} size={16} placement="chart" submissionId={rowId} />
            </div>
          </div>
        </section>

        {/* ── 3 · THE PRESCRIPTION (moved up): the path to the top 2% ─ */}
        <section style={{ backgroundColor: CREAM, borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 py-14 sm:py-20">
            <Eyebrow>The prescription</Eyebrow>
            <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(30px, 4vw, 48px)', lineHeight: 0.98, letterSpacing: '-0.045em', color: RICH }}>
              One library. 1,200+ tested workflows. Zero noise
            </h2>
            <p className="mt-4 max-w-[640px]" style={{ fontWeight: 600, fontSize: 18, lineHeight: 1.45, color: FULVOUS }}>
              {rt.aheadPct >= 98
                ? "You're already in the top 2% - - these tutorials keep you there"
                : `These tutorials take you from ahead of ${rt.aheadPct}% to the top 2% worldwide`}
            </p>
            <p className="mt-3 max-w-[640px]" style={{ fontWeight: 300, fontSize: 17, lineHeight: 1.5, color: BODY }}>
              {p(rung.prescLead)}
            </p>

            {/* A live peek inside the library (scrolling preview) — clickable */}
            <CheckoutLink href={checkoutUrl} placement="library_gif" submissionId={rowId} className="block mt-9 transition-transform hover:-translate-y-px" style={{ border: `3px solid ${INK}`, backgroundColor: '#FFFFFF', cursor: 'pointer' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/library-preview.gif"
                alt="A scrolling preview of the AI Central library of tutorials - - click to unlock"
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            </CheckoutLink>
            <p className="mt-2 font-mono" style={{ fontSize: 10.5, letterSpacing: '0.12em', color: MUTE }}>
              A LIVE PEEK INSIDE THE LIBRARY
            </p>

            {/* Framed 4-pillar grid: 3px black gutters via background + gap */}
            <div
              className="mt-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
              style={{ border: `3px solid ${INK}`, backgroundColor: INK, gap: 3 }}
            >
              {PILLARS.map(pl => (
                <div key={pl.label} style={{ backgroundColor: PAPER, padding: '24px 20px 26px' }}>
                  <div className="font-mono" style={{ fontSize: 11, letterSpacing: '0.14em', color: MUTE }}>{pl.label}</div>
                  <div className="mt-2 font-black" style={{ fontSize: 40, letterSpacing: '-0.02em', color: RICH }}>{pl.n}</div>
                  <p className="mt-2" style={{ fontSize: 13.5, lineHeight: 1.5, color: BODY }}>{pl.body}</p>
                </div>
              ))}
            </div>

            {/* Founder note (no headshot) */}
            <div className="mt-14 max-w-[720px]">
              <div>
                <Eyebrow color={MUTE}>A note from the AI Central founder</Eyebrow>
                <p className="mt-3" style={{ fontWeight: 500, fontSize: 26, lineHeight: 1.25, color: RICH }}>
                  &ldquo;One workflow shipped beats ten tutorials watched&rdquo;
                </p>
                <div className="mt-5 max-w-[640px] flex flex-col gap-4" style={{ fontWeight: 300, fontSize: 15.5, lineHeight: 1.55, color: BODY }}>
                  <p>
                    Dear {firstName || 'reader'}, most people researching AI are stuck in a loop. Read a
                    thread, install a tool, fiddle for an hour, put it down. 6 months later, nothing has shipped.
                  </p>
                  <p>
                    The ones who quietly become the AI person on their team do one thing differently: they stop
                    researching and pick one workflow that compounds. That&apos;s the entire premise of the
                    library. And because you took the quiz, your path isn&apos;t generic: {p(rung.founderPath)}.
                  </p>
                  <p>
                    If you join today, you keep that path. If you don&apos;t, you go back to research mode, and
                    we both know how that ends.
                  </p>
                </div>
                <p className="mt-5" style={{ fontSize: 15.5, color: BODY }}>See you inside,</p>
                <p
                  className={signatureFont.className}
                  style={{ fontSize: 46, color: RICH, transform: 'rotate(-4deg)', transformOrigin: 'left center', marginTop: 4 }}
                >
                  Alex
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 4 · YOUR TYPE: "You're a {Type}" + profile description ── */}
        <section style={{ borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 pt-14 sm:pt-20 pb-6 sm:pb-8">
            <h2 className="font-bold" style={{ fontSize: 'clamp(30px, 4vw, 48px)', lineHeight: 0.98, letterSpacing: '-0.045em', color: RICH }}>
              You&apos;re {typeArticle} <span style={{ color: FULVOUS }}>{rt.typeName}</span>
            </h2>
            <p className="mt-4 max-w-[680px]" style={{ fontWeight: 300, fontSize: 17, lineHeight: 1.55, color: BODY }}>
              {rt.tagline}
            </p>
            <p className="mt-4 max-w-[680px]" style={{ fontWeight: 300, fontSize: 15.5, lineHeight: 1.55, color: BODY }}>
              {content.outlook}
            </p>
          </div>
        </section>

        {/* ── 4 · YOUR SKILL PROFILE: radar (flows straight from the type,
               no divider) ─────────────────────────────────────────── */}
        <section>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 pt-2 pb-14 sm:pb-20 grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-10 lg:gap-14 items-center">
            <div className="w-full max-w-[440px] mx-auto lg:mx-0">
              <RadarChart axes={axes} mode="result" accent={FULVOUS} size={380} todayLabel="You today" projectedLabel="With AI Central" />
            </div>
            <div>
              <Eyebrow color={MUTE}>Your skill profile</Eyebrow>
              <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(28px, 3.2vw, 38px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
                {rung.radarTitle}
              </h2>
              <p className="mt-4" style={{ fontWeight: 300, fontSize: 15.5, lineHeight: 1.55, color: BODY }}>
                {p(rung.radarLead)}
              </p>
              <p className="mt-3" style={{ fontWeight: 300, fontSize: 13.5, lineHeight: 1.5, color: MUTE }}>
                {p(rung.radarNote)}
              </p>
              <div className="mt-7">
                <BlockButton href={checkoutUrl} label={ov('radar.ctaLabel', 'close the gap')} size={16} placement="radar" submissionId={rowId} />
              </div>
            </div>
          </div>
        </section>

        {/* ── 5b · BEFORE vs AFTER THE AI LIBRARY ──────────────────── */}
        <section style={{ backgroundColor: CREAM, borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 py-14 sm:py-20">
            <h2 className="font-bold text-center" style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
              Before vs After the AI Library
            </h2>
            <p className="mt-4 text-center mx-auto max-w-[720px]" style={{ fontWeight: 300, fontSize: 17, lineHeight: 1.5, color: BODY }}>
              Transform your professional reality from overwhelming confusion to confident AI mastery.
            </p>
            <div className="mt-11 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-[980px] mx-auto">
              {/* Before */}
              <div>
                <span className="inline-block font-mono" style={{ backgroundColor: '#BE3B3B', color: '#FFFDFA', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', padding: '6px 14px' }}>BEFORE</span>
                <div className="mt-4 flex flex-col gap-3">
                  {BEFORE_ITEMS.map(it => (
                    <div key={it.title} style={{ backgroundColor: '#FFFDFA', borderLeft: '4px solid #BE3B3B', padding: '14px 16px' }}>
                      <h4 className="font-bold" style={{ fontSize: 14.5, color: RICH }}>{it.title}</h4>
                      <p className="mt-1" style={{ fontSize: 13.5, lineHeight: 1.5, color: BODY }}>{it.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* After */}
              <div>
                <span className="inline-block font-mono" style={{ backgroundColor: '#62A758', color: '#FFFDFA', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', padding: '6px 14px' }}>AFTER</span>
                <div className="mt-4 flex flex-col gap-3">
                  {AFTER_ITEMS.map(it => (
                    <div key={it.title} style={{ backgroundColor: '#FFFDFA', borderLeft: '4px solid #62A758', padding: '14px 16px' }}>
                      <h4 className="font-bold" style={{ fontSize: 14.5, color: RICH }}>{it.title}</h4>
                      <p className="mt-1" style={{ fontSize: 13.5, lineHeight: 1.5, color: BODY }}>{it.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 5c · BROWSE THE LIBRARY (live Softr embed) ────────────── */}
        <section style={{ backgroundColor: PAPER, borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 py-14 sm:py-20">
            <Eyebrow>Browse the shelves</Eyebrow>
            <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', lineHeight: 1.0, letterSpacing: '-0.04em', color: RICH }}>
              Every tutorial, searchable, in one place
            </h2>
            <p className="mt-4 max-w-[640px]" style={{ fontWeight: 300, fontSize: 17, lineHeight: 1.5, color: BODY }}>
              This is the actual library you unlock, 1,200+ tested tutorials across every AI tool and use case.
            </p>
            <div className="mt-9" style={{ border: `3px solid ${INK}` }}>
              <iframe
                src="https://forest49020.softr.app/embed/pages/bfc050ff-dd55-4f02-8303-69a46d02b2a7/blocks/grid1"
                title="Browse the AI Central library"
                width="100%"
                height="1000"
                scrolling="no"
                frameBorder="0"
                style={{ border: 'none', display: 'block', width: '100%' }}
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* ── 6 · QUOTE + PRICING (dark band) ──────────────────────── */}
        <section style={{ backgroundColor: INK, borderTop: `3px solid ${RICH}` }}>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 py-16 sm:py-20 text-center">
            <StarRow />
            <p className="mt-4 mx-auto max-w-[720px]" style={{ fontWeight: 500, fontSize: 'clamp(20px, 2.6vw, 28px)', lineHeight: 1.3, color: CREAM }}>
              &ldquo;Finally, AI tutorials that actually work. Saved 15 hours this week alone&rdquo;
            </p>
            <p className="mt-3" style={{ fontSize: 13, color: CREAM, opacity: 0.65 }}>
              Rachel Thompson · Operations Director · Portland, OR
            </p>

            <div className="mt-14">
              <Eyebrow color={XANTHOUS}>The cost of moving</Eyebrow>
              <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(30px, 3.8vw, 44px)', lineHeight: 1.0, letterSpacing: '-0.04em', color: CREAM }}>
                {ov('pricing.headline', "Less than the coffee you'll drink reading about AI")}
              </h2>
              <p className="mt-4 mx-auto max-w-[560px]" style={{ fontWeight: 300, fontSize: 16, lineHeight: 1.5, color: CREAM, opacity: 0.75 }}>
                The 0.3% didn&apos;t pay for content. They paid to stop searching. 89% of members report value
                in week 1, the guarantee covers the rest
              </p>
            </div>

            {/* What you get — the product mosaic (clickable) */}
            <CheckoutLink href={checkoutUrl} placement="box_image" submissionId={rowId} className="block mt-10 mx-auto transition-transform hover:-translate-y-px" style={{ maxWidth: 300, cursor: 'pointer' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/library-box.png"
                alt="Everything you unlock: 1,200+ instant AI tutorials and real insights - - click to unlock"
                style={{ display: 'block', width: '100%', height: 'auto' }}
              />
            </CheckoutLink>
            <p className="mt-3 font-mono" style={{ fontSize: 10.5, letterSpacing: '0.12em', color: CREAM, opacity: 0.6 }}>
              EVERYTHING YOU UNLOCK TODAY
            </p>

            {/* Pricing card */}
            <div
              className="mt-8 mx-auto w-full max-w-[480px] text-left overflow-hidden"
              style={{ backgroundColor: CREAM, border: `3px solid ${RICH}`, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}
            >
              <div
                className="flex items-center justify-between px-5 py-2.5"
                style={{ backgroundColor: XANTHOUS, borderBottom: `3px solid ${RICH}` }}
              >
                <span className="font-mono font-bold" style={{ fontSize: 11, letterSpacing: '0.1em', color: RICH }}>
                  {ov('pricing.badge', 'MOST POPULAR · 30-DAY GUARANTEE')}
                </span>
                <span className="font-mono font-bold" style={{ fontSize: 13, color: RICH }}>
                  ends <InlineCountdown bare />
                </span>
              </div>
              <div className="px-6 sm:px-7 py-6">
                <p style={{ fontSize: 13, color: '#666666' }}>Your price today</p>
                <div className="flex items-end gap-2">
                  <span className="font-black" style={{ fontSize: 62, letterSpacing: '-0.04em', color: RICH, lineHeight: 1 }}>$4.99</span>
                  <span className="pb-2" style={{ fontSize: 14, color: '#666666' }}>first month</span>
                </div>
                <p className="mt-1" style={{ fontSize: 13, color: '#666666' }}>
                  then $59.75/year (just $4.98/mo) · cancel anytime
                </p>
                <CheckoutLink
                  href={checkoutUrl}
                  placement="pricing_card"
                  submissionId={rowId}
                  className="mt-5 flex items-center justify-center gap-2 w-full transition-colors"
                  style={{ backgroundColor: INK, color: CREAM, fontWeight: 600, fontSize: 16, padding: '16px 20px' }}
                >
                  {ov('pricing.ctaLabel', 'start my 1-month trial')} <span style={{ color: XANTHOUS }} aria-hidden>↗</span>
                </CheckoutLink>
                <p className="mt-3 text-center" style={{ fontSize: 13, color: '#666666' }}>
                  30-day guarantee · instant access
                </p>
                <p className="mt-1 text-center" style={{ fontSize: 13, fontWeight: 600, color: '#333333' }}>
                  over 2,500 sales in the US 🇺🇸
                </p>
                <p className="mt-1.5 text-center">
                  <CheckoutLink
                    href={UPSELL_URL}
                    placement="pricing_lifetime"
                    submissionId={rowId}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-[#E48715] transition-colors"
                    style={{ fontWeight: 500, fontSize: 13.5, color: INK }}
                  >
                    or get lifetime access ↗
                  </CheckoutLink>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 7 · FAQ ──────────────────────────────────────────────── */}
        <section style={{ backgroundColor: PAPER }}>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 py-14 sm:py-20">
            <h2 className="font-bold" style={{ fontSize: 30, letterSpacing: '-0.03em', color: RICH }}>
              Frequently asked questions
            </h2>
            <p className="mt-1" style={{ fontWeight: 300, fontSize: 14, color: MUTE }}>
              The stuff people actually ask before they join
            </p>
            <div className="mt-7" style={{ borderTop: `2px solid ${INK}` }}>
              {FAQS.map(f => (
                <FAQItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </div>
        </section>

        {/* ── 8 · REVIEWS WALL ─────────────────────────────────────── */}
        <section style={{ borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 py-14 sm:py-20">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-bold" style={{ fontSize: 'clamp(26px, 3vw, 34px)', letterSpacing: '-0.03em', color: RICH }}>
                Hear from our 2,000+ members
              </h2>
              <span className="font-mono" style={{ fontSize: 12, letterSpacing: '0.08em', color: MUTE }}>350+ FIVE-STAR REVIEWS</span>
            </div>
            <div className="mt-8 columns-1 sm:columns-2 lg:columns-4 gap-5 [&>*]:break-inside-avoid">
              {REVIEWS.map(rv => (
                <div key={rv.name} className="mb-5 inline-block w-full" style={{ border: `2px solid ${INK}`, padding: 18, backgroundColor: '#FFFFFF' }}>
                  <StarRow size={12} />
                  <p className="mt-2.5" style={{ fontSize: 13.5, lineHeight: 1.5, color: INK }}>&ldquo;{rv.text}&rdquo;</p>
                  <p className="mt-3" style={{ fontWeight: 600, fontSize: 12.5, color: RICH }}>{rv.name}</p>
                  <p style={{ fontSize: 11.5, color: MUTE }}>{rv.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 9 · CLOSING BAND ─────────────────────────────────────── */}
        <section style={{ backgroundColor: INK }}>
          <div className="max-w-[1240px] mx-auto px-6 sm:px-10 lg:px-16 py-16 sm:py-20 text-center">
            <h2 className="font-bold" style={{ fontSize: 'clamp(28px, 3.4vw, 38px)', lineHeight: 1.05, letterSpacing: '-0.035em', color: CREAM }}>
              {ov('final.title', rung.finalTitle)}
            </h2>
            <div className="mt-8 flex justify-center">
              <BlockButton href={checkoutUrl} label={ov('final.ctaLabel', 'start your trial for $4.99')} gold size={16} placement="final_band" submissionId={rowId} />
            </div>
            <p className="mt-5" style={{ fontSize: 12.5, color: CREAM, opacity: 0.5 }}>
              then $59.75/year · cancel anytime · 30-day money-back guarantee · offer ends <InlineCountdown bare />
            </p>
          </div>
        </section>

      </div>

      <FomoPopup />
      <ExitRescue submissionId={rowId} />
    </>
  )
}

export default function ResultPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFDFA' }}>
        <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: '#E8E4DF', borderTopColor: '#E48715' }} />
      </div>
    }>
      <ResultContent searchParams={searchParams} />
    </Suspense>
  )
}
