import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import TrackView from '@/components/TrackView'
import { ExitRescue2 } from '@/components/result2/ExitRescue2.client'
import OfferBar from '@/components/result2/OfferBar'
import { Marquee2 } from '@/components/result2/Marquee2'
import { FomoNotifications } from '@/components/result2/FomoNotifications.client'
import { StageGauge } from '@/components/result2/StageGauge'
import { StudyPlan } from '@/components/result2/StudyPlan'
import Confetti from '@/components/result2/Confetti.client'
import { PassStudio } from '@/components/result2/PassStudio.client'
import { STAGES } from '@/lib/segmentation-v2'
import { personaContent } from '@/lib/persona-content'
import { readinessType } from '@/lib/readiness-type'
import { rungConfig, withPersona, withFirstName } from '@/lib/rung-content'
import { getLivePublishedConfig } from '@/lib/form-config'
import type { EndScreen } from '@/lib/form-schema'
import { pickEndScreen } from '@/lib/form-schema'
import CheckoutLink from '@/components/CheckoutLink.client'

// ── Result page v2 (video-first experiment, iteration 2) ─────────────
// Owner-spec'd order: top-X% hero → FOMO trial strip (no India) →
// horizontal journey stepper (green/grey + weeks-to-reach) → video with
// "unfair advantage" framing + get-everything offer card → recommended
// study plan (real library tutorials, vertical stepper) → Senja reviews →
// "you made it" pass with confetti, personalization widget and a
// suggested LinkedIn post (@AICentral #AICentral) → FAQ → final band.
// Neon offer bar is fixed to the BOTTOM. Self-contained sibling of
// /result: all placements v2_-prefixed, result_view carries
// pageVariant:'v2', page stays noindexed and unlinked.

const VIDEO_ID = 'WO6TM6UVfYM' // "Introducing the Ultimate AI Library from AI Central"

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

const STRIPE_TRIAL_URL = process.env.NEXT_PUBLIC_PAYMENT_URL || 'https://buy.stripe.com/14A5kC67m22McnWfBxdQQ0e'

// Design tokens (same handoff as v1)
const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const PAPER = '#FFFDFA'
const FULVOUS = '#E48715'
const XANTHOUS = '#E7B02F'

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")"

// Real Senja testimonials (same set as v1's marquee; refresh via Claude).
const REVIEWS = [
  { name: 'Teri Thomas', role: 'CEO · Mach7 Technologies', text: 'head and shoulders above many other newsletters with practical tips to leverage AI for real benefit', rated: true, avatarUrl: 'https://cdn.senja.io/public/avatar/d45947d6-d90d-41c9-8542-9ba6cbe4209f_IMG_4683.jpeg' },
  { name: 'Shrikant Govil', role: 'SVP, Global Head · Citi', text: 'I have learnt a ton on how to use AI, Agents and Agentic', avatarUrl: 'https://cdn.senja.io/public/media/d9791259-6ffc-4631-9b1d-050ecde4af27_44b27e61-0f69-4581-b6f9-c22b4caaab19_9905dbb7-a0a2-42c1-80b5-03f047894243.png' },
  { name: 'John Richard', role: 'Business Owner · PSQ Diverse Services', text: 'Thanks to their AI recommendations and their fantastic tutorials I know which AI tools to use and when', rated: true, avatarUrl: 'https://cdn.senja.io/public/media/246dce26-f5c4-4f56-8f9c-1fcd5207edba_4d1397be-a04e-4079-a7a6-b54ecfcd78b6_50a5acf6-3598-4085-8ed6-71eb56a0a21f.png' },
  { name: 'Bruce Glase', role: 'Creative Director', text: 'implemented multiple projects in Claude and ChatGPT using the guides', rated: true, avatarUrl: 'https://cdn.senja.io/public/media/a776b9b5-f782-4b78-b801-2f4594ee5023_b75a5517-109e-4248-96c5-32c0f677b226_1740697307586.jpeg' },
  { name: 'Mohan Naarayan', role: 'Head of Operations · SNS Institutions', text: 'been inspired to reinvent myself for a second career', rated: true, avatarUrl: 'https://cdn.senja.io/public/media/2c58082b-6143-416b-bad6-60f4404cc82a_490c190c-3a59-4c84-a4a8-4d3a52207693_1727364438254.jpeg' },
  { name: 'Kavya Deepthi Guduru', role: 'Founder · The Smart Shopper', text: 'AI Central has completely cut through the noise for me', avatarUrl: 'https://cdn.senja.io/public/avatar/4da58659-7e6b-40d9-9cae-ae7b3d3970e5_kavya.png' },
  { name: 'Desi-Ann Gordon', role: 'Founder & CEO · Caribbean Virtual Assistants', text: 'the quality of the emails was fantastic because the prompt was on point', rated: true, avatarUrl: 'https://cdn.senja.io/public/media/dbd6fd37-d5a2-4258-8252-004418270505_a5314f8c-2bd3-4b4e-aab7-d7da05ca22e9_6f535057-8dc7-452a-ac48-317f174a6e29.png' },
  { name: 'Ashley Cruz-Singh', role: 'Business Analyst', text: "current on what's actually happening, without the hype", rated: true, avatarUrl: 'https://cdn.senja.io/public/avatar/3102ad26-def5-4086-ad70-8179a9ceba52_1000103958.jpg' },
  { name: 'Larry Traxler', role: 'Founder · TraxWorks Hospitality', text: 'I find something useful that saves me time and elevates my AI game almost weekly', avatarUrl: 'https://cdn.senja.io/public/avatar/a9ff64ff-7b60-478a-8814-2bb432f5e030_LT%20Black%20Shirt%2003.jpeg' },
  { name: 'Ghufran Maniar', role: 'Digital Marketing Consultant · WEBOCOM', text: 'AI Central is the gate to AI knowledge city', rated: true, avatarUrl: 'https://cdn.senja.io/public/media/107e502e-c255-4a9c-8423-8d31aed85ff5_ffe43117-69e8-4ff3-b3da-2270bfedd2e4_1656185594530.jpeg' },
  { name: 'Reinhild Niebuhr', role: 'Founder & Managing Director · EcoLine Enterprises', text: 'helped me accelerate my understanding of how AI tools can boost my business', rated: true, avatarUrl: 'https://cdn.senja.io/public/avatar/88a1026d-6f2e-4530-a8ae-a0cc103eba5e_Refine.png' },
  { name: 'Augustine Rono', role: 'Writer & Academic Mentorship Specialist', text: 'actionable guides that make complex tools like Claude accessible', rated: true, avatarUrl: 'https://cdn.senja.io/public/media/fc2f4636-1dcf-4e71-9751-27ddcdf2d41e_e7b29628-8938-4040-abc6-bc9f01019211_1774374834938.jpeg' },
]

const FAQS = [
  { q: "I'm not technical. Will these tutorials make sense to me?", a: 'Yes. Every tutorial is written for professionals, not developers: plain language, a screenshot at every step, nothing assumes you can code. If you can follow a recipe, you can ship these workflows' },
  { q: 'How quickly will I see practical results?', a: 'Most members ship their first workflow in 15 minutes. One working automation in week 1 is the standard we design for' },
  { q: 'What happens after my 1-month trial?', a: 'You move to the annual plan at $59.75/year, about $4.98 a month. Cancel anytime before renewal and pay nothing more' },
  { q: "What if I'm not satisfied with the content?", a: '30-day money-back guarantee. One email, full refund, no questions' },
]

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}>
      {children}
    </span>
  )
}

/** Two-piece block CTA (label cell + arrow cell), v2 placements. */
function BlockButton2({ href, label, placement, submissionId, size = 17 }: { href: string; label: string; placement: string; submissionId?: string; size?: number }) {
  return (
    <CheckoutLink
      href={href}
      placement={placement}
      submissionId={submissionId}
      className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]"
      style={{ textDecoration: 'none' }}
    >
      <span className="inline-flex items-center justify-center" style={{ backgroundColor: INK, color: CREAM, fontWeight: 600, fontSize: size, height: 54, padding: '0 26px' }}>
        {label}
      </span>
      <span className="inline-flex items-center justify-center" style={{ backgroundColor: FULVOUS, color: RICH, width: 54, height: 54, borderLeft: `2px solid ${RICH}`, fontWeight: 600, fontSize: size }} aria-hidden>
        ↗
      </span>
    </CheckoutLink>
  )
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group" style={{ borderBottom: '1px solid #D9D9D9' }}>
      <summary className="flex items-center justify-between py-4 cursor-pointer list-none" style={{ fontWeight: 600, fontSize: 15.5, color: INK }}>
        <span className="pr-4 group-open:text-[#E48715]">{q}</span>
        <span className="ml-4 flex-shrink-0 group-open:rotate-45 transition-transform duration-200 leading-none" style={{ color: FULVOUS, fontWeight: 300, fontSize: 22 }} aria-hidden>
          +
        </span>
      </summary>
      <p className="pb-5 max-w-[760px]" style={{ fontWeight: 300, fontSize: 14.5, lineHeight: 1.55, color: BODY }}>{a}</p>
    </details>
  )
}

// Personalized, searchParams-keyed page under evaluation — never rank it.
export const metadata = {
  title: 'Your AI Readiness Result',
  robots: { index: false, follow: false },
}

export default async function ResultV2Page({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const name = searchParams.name ? decodeURIComponent(searchParams.name) : ''
  const scoreRaw = parseInt(searchParams.score || '0', 10)
  const score = isNaN(scoreRaw) || scoreRaw <= 0 ? 50 : scoreRaw
  const rowId = searchParams.id

  const firstName = (name || '').trim().split(/\s+/)[0] || ''

  const segFields = await fetchSegmentFields(rowId)
  const persona = segFields?.persona ?? searchParams.persona ?? null
  const content = personaContent(persona)
  const stageKey = segFields?.stage ?? searchParams.stage ?? null
  const rt = readinessType(stageKey)
  const rung = rungConfig(stageKey)
  const p = (s: string) => withFirstName(withPersona(s, content.label), firstName)

  // Editor safety valve: honor a published end-screen's ctaUrl override.
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
    console.warn('[result-v2] failed to load editor endScreens, using defaults:', err)
  }
  const checkoutUrl = endScreen?.ctaUrl ?? STRIPE_TRIAL_URL

  const passName = (name || 'AI Professional').trim()
  const refNo = 'AC-' + (rowId ? rowId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : '0723')
  const now = new Date()
  const issued = `${String(now.getMonth() + 1).padStart(2, '0')} / ${now.getFullYear()}`

  const topPct = 100 - rt.aheadPct
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai'
  // Visitor country from Vercel's IP geo header (absent locally) — used to
  // surface trial notifications from the visitor's own region first.
  const visitorCountry = headers().get('x-vercel-ip-country') ?? undefined

  // Next rung up the ladder (for the gauge caption). Weeks rule: the next
  // step is always ~1 week away.
  const ladder = STAGES.filter(s => s.key !== 'unknown')
  const currentLadderIdx = Math.max(0, ladder.findIndex(s => s.key === stageKey))
  const nextStage = ladder[currentLadderIdx + 1] ?? null

  return (
    <>
      <TrackView event="result_view" props={{ pageVariant: 'v2', stage: stageKey, persona, submissionId: rowId }} />
      <Confetti onLoad />

      <div className="flex flex-col" style={{ backgroundColor: PAPER, color: INK, paddingBottom: 84 }}>

        {/* ── 1 · HERO: top-X% verdict + tachometer ─────────────────── */}
        <section style={{ backgroundColor: PAPER, backgroundImage: GRAIN }}>
          <div className="max-w-[880px] mx-auto px-6 sm:px-10 pt-12 sm:pt-16 pb-10 text-center">
            <Eyebrow>Your quiz results</Eyebrow>
            <h1 className="mt-4 font-bold" style={{ fontSize: 'clamp(34px, 5vw, 58px)', lineHeight: 1.0, letterSpacing: '-0.045em', color: RICH }}>
              {firstName ? `${firstName}, you` : 'You'}&rsquo;re in the top{' '}
              <span style={{ color: FULVOUS }}>{topPct}%</span> of people on their AI journey!
            </h1>
            <p className="mt-4 mx-auto max-w-[560px]" style={{ fontWeight: 300, fontSize: 18, lineHeight: 1.5, color: BODY }}>
              Scroll below to get your recommended plan, grab your member pass and share it with your network.
            </p>
            <div className="mt-9">
              <StageGauge stageKey={stageKey} aheadPct={rt.aheadPct} />
            </div>
            {nextStage && (
              <p className="mt-2" style={{ fontSize: 14.5, color: BODY, fontWeight: 300 }}>
                Next stop: <strong style={{ fontWeight: 700, color: RICH }}>{nextStage.label}</strong>, ≈1 wk away with the library.
              </p>
            )}
          </div>
        </section>

        {/* ── 2 · THE VIDEO + instant offer + live trials ───────────── */}
        <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: CREAM }}>
          <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
            <Eyebrow>The unfair advantage</Eyebrow>
            <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
              Wanna climb to the top 1%? Here&rsquo;s how
            </h2>
            <p className="mt-3 max-w-[640px]" style={{ fontWeight: 300, fontSize: 17, lineHeight: 1.5, color: BODY }}>
              Upskill yourself with the unfair advantage 2,500+ took to become irreplaceable.
            </p>

            <div className="mt-8" style={{ border: `3px solid ${INK}`, backgroundColor: '#000', position: 'relative', paddingBottom: '56.25%', height: 0 }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0`}
                title="Introducing the Ultimate AI Library from AI Central"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
              />
            </div>

            {/* Compact offer card right where the post-video intent lands */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 items-center" style={{ border: `3px solid ${INK}`, backgroundColor: '#FFFFFF', padding: '22px 26px' }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: RICH }}>
                  Get everything in the video, <span style={{ color: FULVOUS }}>$4.99 first month</span>
                </p>
                <p className="mt-1.5" style={{ fontSize: 13, lineHeight: 1.5, color: BODY, fontWeight: 300 }}>
                  1,200+ tutorials and 50+ templates, with a track matched to your {rung.className} result.
                  Then $4.98/mo billed yearly ($59.75), cancel in your trial month and pay nothing more. 30-day guarantee.
                </p>
              </div>
              <div className="justify-self-start sm:justify-self-end">
                <BlockButton2 href={checkoutUrl} label="start my trial" placement="v2_video_cta" submissionId={rowId} />
              </div>
            </div>

            {/* Live trials — seamless, right under the CTA, visitor's region first */}
            <FomoNotifications checkoutUrl={checkoutUrl} submissionId={rowId} visitorCountry={visitorCountry} />
          </div>
        </section>

        {/* ── 5 · YOUR RECOMMENDED STUDY PLAN ───────────────────────── */}
        <section style={{ borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[720px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
            <Eyebrow>Your recommended study plan</Eyebrow>
            <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
              The first month, mapped for a {rung.className.toLowerCase()}
            </h2>
            <p className="mt-3 max-w-[620px]" style={{ fontWeight: 300, fontSize: 15.5, lineHeight: 1.5, color: BODY }}>
              {p('Five tutorials from the library, sequenced for exactly where you are. The first takes 15 minutes tonight.')}
            </p>
            <StudyPlan stageKey={stageKey} checkoutUrl={checkoutUrl} submissionId={rowId} />
            <div className="mt-9 flex justify-center">
              <BlockButton2 href={checkoutUrl} label="unlock my study plan" placement="v2_study_plan" submissionId={rowId} />
            </div>
          </div>
        </section>

        {/* ── 6 · REAL REVIEWS ──────────────────────────────────────── */}
        <section style={{ borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[880px] mx-auto px-6 sm:px-10 pt-12 sm:pt-14 pb-8 text-center">
            <Eyebrow>Loved by 2,500+ members</Eyebrow>
            <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
              What people say about AI Central
            </h2>
          </div>
        </section>
        <Marquee2 mode="reviews" reviews={REVIEWS} checkoutUrl={checkoutUrl} submissionId={rowId} />

        {/* ── 7 · SCROLL REWARD: pass + confetti + personalization ──── */}
        <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: PAPER, backgroundImage: GRAIN, position: 'relative' }}>
          <Confetti />
          <div className="max-w-[720px] mx-auto px-6 sm:px-10 py-14 sm:py-20 text-center">
            <Eyebrow>You made it</Eyebrow>
            <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(28px, 3.8vw, 44px)', lineHeight: 1.0, letterSpacing: '-0.04em', color: RICH }}>
              Here&rsquo;s your member pass
            </h2>
            <p className="mt-4 mx-auto max-w-[520px]" style={{ fontWeight: 300, fontSize: 16.5, lineHeight: 1.5, color: BODY }}>
              Top {topPct}% of AI users worldwide, verified by the assessment.
              Add your face, then post it, your card unfurls automatically on LinkedIn.
            </p>
            <div className="mt-9">
              <PassStudio
                name={passName}
                profileLabel={content.label}
                stageLabel={rung.className}
                topPct={topPct}
                refNo={refNo}
                issued={issued}
                submissionId={rowId}
                site={site}
              />
            </div>
          </div>
        </section>

        {/* ── 8 · SHORT FAQ ─────────────────────────────────────────── */}
        <section style={{ borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
            <Eyebrow>Questions</Eyebrow>
            <div className="mt-6">
              {FAQS.map(f => <FAQItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </div>
        </section>

        {/* ── 9 · FINAL BAND ────────────────────────────────────────── */}
        <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: INK }}>
          <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-14 sm:py-18 text-center">
            <h2 className="font-bold" style={{ fontSize: 'clamp(26px, 3.6vw, 42px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: PAPER }}>
              Go from the top {topPct}% <span style={{ color: XANTHOUS }}>to the top 2%</span>
            </h2>
            <p className="mt-3 mx-auto max-w-[480px]" style={{ fontWeight: 300, fontSize: 15.5, lineHeight: 1.5, color: '#D8D2C6' }}>
              $4.99 first month · cancel anytime · 30-day guarantee
            </p>
            <div className="mt-8 flex justify-center">
              <BlockButton2 href={checkoutUrl} label="unlock the library" placement="v2_final_band" submissionId={rowId} />
            </div>
          </div>
        </section>
      </div>

      <OfferBar paymentUrl={checkoutUrl} submissionId={rowId} />
      <ExitRescue2 submissionId={rowId} />
    </>
  )
}
