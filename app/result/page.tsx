import { createClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import TrackView from '@/components/TrackView'
import ExperimentTracker from '@/components/ExperimentTracker.client'
import { ClarityTag } from '@/components/result2/ClarityTag.client'
import { resolveExperiments, getVariantOverrides } from '@/lib/experiments'
import OfferBar from '@/components/result2/OfferBar'
import { Marquee2 } from '@/components/result2/Marquee2'
import { FomoNotifications } from '@/components/result2/FomoNotifications.client'
import { StageGauge } from '@/components/result2/StageGauge'
import { StudyPlan } from '@/components/result2/StudyPlan'
import Confetti from '@/components/result2/Confetti.client'
import ExpenseEmail from '@/components/result2/ExpenseEmail.client'
import { NextStageGap } from '@/components/result2/NextStageGap'
import { PassGate } from '@/components/result2/PassGate.client'
import { STAGES } from '@/lib/segmentation-v2'
import { offerForCountry, lifetimePriceId, TRIAL_OFFER, LIFETIME_OFFER } from '@/lib/offers'
import { QUESTIONS_V2_MERGED as QUIZ_QUESTIONS } from '@/lib/questions-v2-merged'
import { personaContent } from '@/lib/persona-content'
import { readinessType, adopterTopPct } from '@/lib/readiness-type'
import { rungConfig, withPersona, withFirstName } from '@/lib/rung-content'
import { getLivePublishedConfig } from '@/lib/form-config'
import type { EndScreen } from '@/lib/form-schema'
import { pickEndScreen } from '@/lib/form-schema'
import CheckoutLink from '@/components/CheckoutLink.client'
import CheckoutModalProvider from '@/components/result2/CheckoutModal.client'
import { LabHero } from '@/components/result2/LabHero'
import { OfferStack } from '@/components/result2/OfferStack'
import { LibraryGrid } from '@/components/result2/LibraryGrid'
import { AspirationalHero } from '@/components/result2/AspirationalHero'
import AdsRescue from '@/components/result2/AdsRescue.client'
import { UnlockReveal } from '@/components/result2/UnlockReveal.client'
import ExpressPay from '@/components/result2/ExpressPay.client'
import { RiskFree } from '@/components/result2/RiskFree'
import PayBadges from '@/components/result2/PayBadges.client'

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

// ONE call to action across the whole page. Every button said something
// different ("start my trial", "unlock weeks 2-4 · $4.99", "Claim offer"),
// which reads as several competing offers and puts the price on the button
// where it becomes the last thing you think about before clicking. One promise,
// repeated: the price lives in the offer stack, the button sells the outcome.
const CTA_LABEL = 'unlock all tutorials'
/** The lifetime ask. "Unlock" is a trial word; this offer is a purchase. */
const CTA_LABEL_LIFETIME = 'get lifetime access'

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
  hours_lost?: number | null
  hours_would_use_for?: string | null
  /** Raw depth picks, CSV. The ladder's top rungs are earned by three of
   *  these, so this is what makes the gap to the next stage computable. */
  depth_actions?: string | null
}

// Their own answer, quoted back. Nobody argues with a number they chose
// themselves — this is the whole point of asking. Null for the ~700 rows from
// before the question existed, so every caller must handle undefined.
const HOURS_FOR_LABEL: Record<string, string> = {
  real_work: 'the real work you never get to',
  grow: 'growing the business',
  learn_build: 'learning or building something new',
  log_off: 'finishing on time',
}
function costLine(hours?: number | null, useFor?: string | null): string | null {
  if (!hours || hours <= 0) return null
  const weeks = Math.round((hours * 48) / 40) // working weeks a year, 48 working weeks
  const band = hours >= 15 ? 'over 15 hours' : hours >= 8 ? '8 to 15 hours' : hours >= 4 ? '4 to 7 hours' : hours >= 1 ? '1 to 3 hours' : 'under an hour'
  const spend = useFor && HOURS_FOR_LABEL[useFor] ? HOURS_FOR_LABEL[useFor] : null
  const base = `You told us ${band} a week go on work AI could already be doing. That is about ${weeks} working weeks a year`
  return spend ? `${base}, weeks you said you would spend on ${spend}.` : `${base}.`
}

async function fetchSegmentFields(id: string | undefined): Promise<SegFields | null> {
  if (!id) return null
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return null
    const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Never serve a cached read. See lib/supabase-admin.ts for the 2026-08-08
    // incident this prevents: 14 hours acting on a snapshot frozen at 13:15.
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
    const { data } = await c
      .from('submissions')
      .select('email, stage, persona, friction, intent_30d, frequency_score, depth_score, breadth_score, momentum, ai_tools, job_level, score, utm_source, hours_lost, hours_would_use_for, depth_actions')
      .eq('id', id)
      .maybeSingle()
    return (data as SegFields) || null
  } catch { return null }
}

const STRIPE_TRIAL_URL = process.env.NEXT_PUBLIC_PAYMENT_URL || 'https://buy.stripe.com/14A5kC67m22McnWfBxdQQ0e'

// The lifetime payment link, for the countries where the trial never renews.
// Distinct from the trial link because the static link is what people reach
// when the modal fails, and a lifetime pitch must never hand off to a $4.99
// subscription checkout.
const STRIPE_LIFETIME_URL = process.env.NEXT_PUBLIC_LIFETIME_PAYMENT_URL || null

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
  // ONE effective rung drives the copy, the percentile and the gauge. They used
  // to fall back differently when the stage was unknown — rungConfig defaults to
  // Curious, the gauge to whichever band the needle landed in — so the headline
  // could say "you're a curious" while the chart highlighted Practitioner.
  const rawStage = segFields?.stage ?? searchParams.stage ?? null
  const LADDER_KEYS = ['S0_unaware', 'S1_curious', 'S2_experimenter', 'S3_practitioner', 'S4_power_user', 'S5_builder']
  const stageKey = rawStage && LADDER_KEYS.includes(rawStage) ? rawStage : 'S2_experimenter'
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
  // Stamp the submission onto the payment link, so a sale can be credited back
  // to the quiz even when the buyer pays with a different email.
  //
  // WHY. The embedded checkout puts submission_id in Stripe metadata, but the
  // STATIC link cannot carry metadata at all, and people reach it constantly:
  // the link arm of checkout_embed_v1, anyone who closes the modal and comes
  // back, every CTA when the modal fails. On 2026-08-09 a li_ads visitor did
  // exactly that, paid with a personal Gmail that Stripe Link autofilled
  // instead of the work email she used on the quiz, and the sale landed on a
  // second row with no utm_source. LinkedIn was never credited for a sale it
  // had made.
  //
  // Payment Links forward ?client_reference_id onto the checkout session, which
  // is the one identifier the static link CAN carry, so the webhook now reads
  // it. Only applied to buy.stripe.com URLs: a custom ctaUrl from the editor
  // may be anything, and appending a Stripe param to it would be nonsense.
  // ── Which offer this visitor sees ────────────────────────────────────────
  //
  // India's trials do not renew. Not rarely: 42 due, zero renewals, against
  // 62.6% in the US. So India is sold the library outright instead, and the
  // whole page speaks in one offer's terms rather than putting lifetime copy
  // over a trial button.
  //
  // Both gates must be open: the Stripe price has to exist AND the static
  // fallback link has to exist, because a visitor whose modal fails is sent to
  // that link and it must charge what the page promised. Either one missing
  // and India simply sees the normal page, because a wrong charge is the only
  // outcome that must be impossible. ?offer=lifetime previews it anywhere,
  // ?offer=trial forces the normal page.
  //
  // DECLARED HERE, above rawCheckoutUrl, because that line reads it. This page
  // has already shipped one temporal-dead-zone crash (digest 1002650819) that
  // tsc could not see.
  const visitorCountry = headers().get('x-vercel-ip-country') ?? undefined
  const offerParam = typeof searchParams.offer === 'string' ? searchParams.offer.trim().toLowerCase() : ''
  const lifetimeReady = !!lifetimePriceId() && !!STRIPE_LIFETIME_URL
  const offer = offerParam === 'trial'
    ? TRIAL_OFFER
    : offerParam === 'lifetime' && lifetimeReady
      ? LIFETIME_OFFER
      : offerForCountry(visitorCountry, lifetimeReady)
  const isLifetime = offer.key === 'lifetime'
  // Every CTA on the page asks for the offer this visitor is being shown.
  const CTA = isLifetime ? CTA_LABEL_LIFETIME : CTA_LABEL

  const rawCheckoutUrl = isLifetime && STRIPE_LIFETIME_URL
    ? STRIPE_LIFETIME_URL
    : endScreen?.ctaUrl ?? STRIPE_TRIAL_URL
  const checkoutUrl = (() => {
    if (!rowId || !/(^|\/\/)(buy\.stripe\.com)/.test(rawCheckoutUrl)) return rawCheckoutUrl
    try {
      const u = new URL(rawCheckoutUrl)
      u.searchParams.set('client_reference_id', rowId)
      return u.toString()
    } catch {
      return rawCheckoutUrl
    }
  })()

  const passName = (name || 'AI Professional').trim()
  const refNo = 'AC-' + (rowId ? rowId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() : '0723')
  const now = new Date()
  const issued = `${String(now.getMonth() + 1).padStart(2, '0')} / ${now.getFullYear()}`

  // TWO percentiles, deliberately. `topPct` is LEVERAGE — the honest, lower
  // number that drives the gauge and the sell. `badgeTopPct` is ADOPTION — the
  // proud number on the shareable pass. Both are true of the same person: a
  // fast adopter getting little leverage. Keeping them separate means making
  // the diagnostic honest never costs us the pass_share acquisition loop.
  const topPct = 100 - rt.aheadPct
  const badgeTopPct = adopterTopPct(segFields?.score ?? score)
  const cost = costLine(segFields?.hours_lost, segFields?.hours_would_use_for)
  // Design lab: ?design=a|b|c|d swaps the hero for a candidate direction so the
  // owner can preview 4 full, real result pages. No param → the normal hero, so
  // real visitors are unaffected. Leverage here is illustrative (derived from the
  // usage score); the real reframe will compute it from building actions.
  const design = typeof searchParams.design === 'string' ? searchParams.design.trim().toLowerCase() : ''
  const leverage = Math.min(90, Math.max(8, Math.round(score * 0.33)))
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai'
  // Visitor country is resolved above, with the offer that depends on it.

  // Next rung up the ladder (for the gauge caption). Weeks rule: the next
  // step is always ~1 week away.
  // Only claim a "next stop" when we actually know the rung. The old
  // Math.max(0, -1) fallback made an unknown stage look like rung 0, so the
  // caption announced the rung the gauge was already pointing at.
  const ladder = STAGES.filter(s => s.key !== 'unknown')
  const currentLadderIdx = ladder.findIndex(s => s.key === stageKey)
  const nextStage = currentLadderIdx >= 0 ? (ladder[currentLadderIdx + 1] ?? null) : null

  // ── Experiments: sticky-first deterministic assignment (fails open) ──
  // v3_structure tests the day-1 insights: pass section pulled above the
  // study plan and reviews, hero anchor to it, exit-rescue dwell 60s→240s.
  const cookieStore = cookies()
  const anonId = cookieStore.get('ac_aid')?.value ?? headers().get('x-anon-id') ?? null
  // Admin preview: ?xv=<variantKey> (or expKey:variantKey) force-renders that
  // variant's copy WITHOUT recording an exposure or an assignment, so the owner
  // can eyeball each version. Real visitors never carry this param.
  const previewVar = typeof searchParams.xv === 'string' ? searchParams.xv.trim() : ''
  const { assignments, overrides } = previewVar
    ? { assignments: [] as { experimentKey: string; variantKey: string }[], overrides: await getVariantOverrides('result', previewVar) }
    : await resolveExperiments({
        anonId,
        cookieVariant: k => cookieStore.get(`ac_exp_${k}`)?.value,
        stage: stageKey,
        persona,
        utmSource: segFields?.utm_source ?? null,
        page: 'result',
      })
  // Apply a variant's copy override for a slot (token-expanded), else the
  // hardcoded default. `overrides` is empty unless an experiment is running AND
  // NEXT_PUBLIC_EXPERIMENTS_ENABLED === 'true', so with the flag off this is a
  // no-op and the page renders exactly as before.
  const ov = (slot: string, current: string) => (overrides[slot] != null ? p(overrides[slot]) : current)

  // ── result_sellfirst_v1 · structural arm ────────────────────────────
  // One hypothesis in three moves: stop making people watch a video before
  // they can see what they get and what it costs. The plan (best-converting
  // CTA) and the offer come first, the video drops to an optional tour.
  // Structural, so it cannot ride the copy-slot engine — it reads the assigned
  // variant directly. ?xv=sellfirst previews it without recording an exposure.
  // result_sellfirst_v1 CONCLUDED and sell-first won decisively: 38.1% vs 22.7%
  // on 197/198 exposures, a 15.4 point gap (z=3.31, p<0.001), ahead on every
  // one of the six days it ran. That is a 68% relative lift in click rate, so
  // it is now simply the page rather than an arm.
  //
  // Video-first: the layout sell-first replaced, now BACK as a live arm.
  //
  // result_sellfirst_v1 was called on checkout_click, where sellfirst won
  // +14.4pts at p=0.002. Re-read on net_new_paid it was 8-to-5 BEHIND, with
  // click-to-paid falling from 16.7% to 6.6% — it bought clicks, not sales.
  // The paid gap is not significant (p=0.40), so this is not "video-first was
  // better", it is "we never had evidence sell-first sold more". This re-test
  // settles it with net_new_paid as the primary metric.
  const videoFirst =
    previewVar.includes('videofirst') ||
    assignments.some(a => a.experimentKey === 'result_sellfirst_v2' && a.variantKey === 'videofirst')

  // ── `reveal` arm · the honest unlock wheel ───────────────────────────
  // Theatre without a luck claim: everyone sees the same segments and the copy
  // says so on the page. Lands on the $4.99 BEFORE any CTA click, which is the
  // expectation gap the autopsy found (30 of 38 abandon the form in <10s).
  //
  // The preview (?xv=reveal) and the live arm are deliberately NOT the same
  // flag. The preview also forces the aspirational layout so the owner can see
  // the intended combination in one link; the live arm must not, or the wheel
  // experiment would drag its own layout along and we would be measuring two
  // things at once. See the `aspirational` block below.
  const revealPreview = previewVar.includes('reveal')
  const reveal =
    revealPreview ||
    assignments.some(a => a.experimentKey === 'result_reveal_v1' && a.variantKey === 'reveal')

  // ── One-tap wallets (Express Checkout Element) ───────────────────────
  // 64% of payment intents are canceled — people open the hosted form and
  // leave. This skips the form entirely.
  //
  // ON for everyone as of Aug 6. The owner's condition was "if the express
  // does not save the card I don't want it, I'd lose the renewal later", and
  // that is not a promise, it is enforced: /api/checkout/intent returns
  // renewalCheck, and ExpressPay REFUSES to confirm the payment when
  // renewalCheck.ok is false. A wallet payment therefore cannot complete
  // unless the intent carries setup_future_usage=off_session with a customer
  // attached — the same mechanism the card path uses, which demonstrably
  // renews. Verified live: {"setupFutureUsage":"off_session","customer":
  // "cus_...","ok":true}.
  //
  // Deliberately NOT A/B tested. The realistic effect on click-to-paid is a
  // few points and the MDE at this traffic is ~10, so a 16-day test would
  // return "inconclusive" while half of everyone got the slower path. The
  // question worth answering is not "does it convert better" but "does the
  // day-28 renewal actually charge", which is an observation, not an
  // experiment. Kill switch: NEXT_PUBLIC_EXPRESS_PAY='false', or ?express=0.
  const expressParam = typeof searchParams.express === 'string' ? searchParams.express.trim() : ''
  const expressOn =
    expressParam === '1' ||
    (process.env.NEXT_PUBLIC_EXPRESS_PAY !== 'false' && expressParam !== '0')
  const expressPayEl = expressOn ? (
    <ExpressPay
      offer={offer.key}
      submissionId={rowId}
      anonId={anonId ?? undefined}
      utmSource={segFields?.utm_source ?? undefined}
      utmRef={typeof searchParams.utm_ref === 'string' ? searchParams.utm_ref : undefined}
    />
  ) : null

  // ── `aspirational` arm ──────────────────────────────────────────────
  // Reframes the hero from what someone IS to what they are ABOUT TO BE, and
  // puts a real buy button above the fold — today the only above-fold action
  // is a scroll anchor, and two thirds of visitors never reach a real CTA.
  // Body order follows the same logic: result, then the goods, then the plan.
  //
  // ORTHOGONALITY. This used to read `reveal || …`, which forced everyone in
  // the wheel arm onto the aspirational layout. That is fine for a preview link
  // and fatal for a live test: the wheel arm would differ from its control by
  // BOTH the wheel and the whole page order, so a win would be unattributable.
  //
  // Bucketing is fnv1a32(anonId|experimentKey|salt), so two experiments with
  // different keys randomize independently and the layout is balanced across
  // the wheel's arms by construction. That makes wheel × layout a proper 2x2
  // and lets both run at once on full traffic instead of queueing, which
  // matters a lot at ~21 exposures per arm per day.
  const aspirational =
    revealPreview ||
    previewVar.includes('aspirational') ||
    assignments.some(a => a.experimentKey === 'result_aspirational_v1' && a.variantKey === 'aspirational')

  // ── Embedded checkout A/B (experiment `checkout_embed_v1`) ──────────
  // 'embedded' arm: every CTA opens an on-page Stripe modal (mirrors the
  // beehiiv link 1:1); 'link' arm: unchanged, navigates to the beehiiv link.
  // Assignment comes from the running experiment; `?checkout=embedded|link`
  // force-previews a mode for eyeballing WITHOUT recording an exposure. Gated
  // on the publishable key so we never intercept clicks we can't fulfil.
  const checkoutPreview = typeof searchParams.checkout === 'string' ? searchParams.checkout.trim() : ''
  const canEmbed = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  // Embedded checkout adopted for everyone: the checkout_embed_v1 A/B was even on
  // the (slow) paid metric, and embedded is the better on-domain experience with a
  // link fallback. Default embedded when the key is set; ?checkout=link forces the
  // classic link for previewing. (Experiment concluded; assignment no longer gates this.)
  const checkoutMode: 'link' | 'embedded' = canEmbed && checkoutPreview !== 'link' ? 'embedded' : 'link'

  // The free win now lives INSIDE the study-plan stepper (week 1 playable,
  // weeks 2-5 walled) rather than as a section above the offer — a free thing
  // at the top gives closure and sends people off-domain before they ever see
  // the offer. See components/result2/StudyPlan.tsx.
  // Fixed order (restructure): reviews → plan → pass at the very bottom,
  // gated by LinkedIn. Sections kept as blocks for readability.
  const studyPlanSection = (
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
        <div className="mt-9 flex flex-col items-center gap-3">
          <BlockButton2 href={checkoutUrl} label={ov('studyPlan.ctaLabel', CTA)} placement="v2_study_plan" submissionId={rowId} />
          <PayBadges fallbackUrl={checkoutUrl} submissionId={rowId} placement="v2_study_plan_badges" />
          <p style={{ fontSize: 13, color: MUTE, textAlign: 'center', maxWidth: 460 }}>
            Unlocking your plan opens the whole library: 1,200+ tutorials and 50+ templates, not just these five.
          </p>
        </div>
      </div>
    </section>
  )

  // ── result_sellfirst_v1 · the sections that move ────────────────────
  // The video block, factored out so both arms render the SAME embed. Autoplay
  // is a parameter, not a constant: in the challenger the video sits six
  // sections down, where autoplaying on load would burn the visitor's data on
  // a video that finishes before they ever scroll to it.
  const videoBlock = (autoplay: boolean) => (
    <div className="mt-8" style={{ border: `3px solid ${INK}`, backgroundColor: '#000', position: 'relative', paddingBottom: '56.25%', height: 0 }}>
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0&playsinline=1${autoplay ? '&autoplay=1&mute=1' : ''}`}
        title="Introducing the Ultimate AI Library from AI Central"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  )

  // The offer. `withVideo` is the whole experiment in one flag: control puts
  // the 4-minute video in front of the price, the challenger does not.
  const offerSection = (withVideo: boolean) => (
    <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: CREAM }}>
      <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
        <Eyebrow>The unfair advantage</Eyebrow>
        <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
          Wanna climb to the top 1%? Here&rsquo;s how
        </h2>
        <p className="mt-3 max-w-[640px]" style={{ fontWeight: 300, fontSize: 17, lineHeight: 1.5, color: BODY }}>
          Upskill yourself with the unfair advantage 2,500+ took to become irreplaceable.
        </p>

        {/* Their own answer, quoted back. Renders only for people who
            answered the cost question (NULL on pre-launch rows). */}
        {cost && (
          <div className="mt-6" style={{ borderLeft: `4px solid ${FULVOUS}`, backgroundColor: '#FFFFFF', padding: '14px 18px', maxWidth: 640 }}>
            <p style={{ fontSize: 15.5, lineHeight: 1.5, color: RICH, fontWeight: 500 }}>{cost}</p>
          </div>
        )}

        {/* The gap, before the offer, because it is the REASON for the offer.
            What it costs them (above) → what is missing (here) → what it costs
            to fix (below). Renders nothing for people at the top of the ladder
            or for rows from before depth_actions existed. */}
        <NextStageGap
          depthActions={segFields?.depth_actions ?? null}
          nextStageLabel={nextStage?.label ?? null}
          checkoutUrl={checkoutUrl}
          submissionId={rowId}
          ctaLabel={CTA}
        />

        {withVideo && videoBlock(true)}

        <OfferStack
          offer={offer}
          checkoutUrl={checkoutUrl}
          submissionId={rowId}
          rungClassName={rung.className}
          ctaLabel={ov('offerCard.ctaLabel', CTA)}
          expressPay={expressPayEl}
        />

        {/* Directly under the price, because that is the exact moment the
            objection lands. Theory under test: the blocker is not $59.75, it
            is whose money it is. See the component for the kill number. */}
        {/* The expense-request template exists to get a RENEWAL approved by
            someone else's budget. A lifetime buyer has no renewal, so this is
            not copy to reword, it is a section that does not apply to them. */}
        {!isLifetime && (
          <div style={{ maxWidth: 640 }}>
            <ExpenseEmail
              stageLabel={rung.className}
              hoursLost={segFields?.hours_lost ?? null}
              submissionId={rowId}
            />
          </div>
        )}

        {/* Live trial notifications sit UNDER the pay buttons, not over the
            video: social proof lands hardest at the moment of decision. */}
        <FomoNotifications checkoutUrl={checkoutUrl} submissionId={rowId} visitorCountry={visitorCountry} />
      </div>
    </section>
  )

  // Challenger only: the video, demoted to an optional tour after the proof.
  const videoTourSection = (
    <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: CREAM }}>
      <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
        <Eyebrow>The full tour</Eyebrow>
        <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
          Prefer to see it first? Four minutes
        </h2>
        <p className="mt-3 max-w-[640px]" style={{ fontWeight: 300, fontSize: 17, lineHeight: 1.5, color: BODY }}>
          A walk through the library, the templates and how members actually use it day to day.
        </p>
        {videoBlock(false)}
      </div>
    </section>
  )

  const reviewsSection = (
    <>
      <section style={{ borderTop: `3px solid ${INK}` }}>
        <div className="max-w-[880px] mx-auto px-6 sm:px-10 pt-12 sm:pt-14 pb-8 text-center">
          <Eyebrow>Loved by 2,500+ members</Eyebrow>
          <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
            What people say about AI Central
          </h2>
        </div>
      </section>
      <Marquee2 mode="reviews" reviews={REVIEWS} checkoutUrl={checkoutUrl} submissionId={rowId} />
    </>
  )

  const passSection = (
    <section id="pass" style={{ borderTop: `3px solid ${INK}`, backgroundColor: PAPER, backgroundImage: GRAIN, position: 'relative', scrollMarginTop: 12 }}>
      <Confetti />
      <div className="max-w-[720px] mx-auto px-6 sm:px-10 py-14 sm:py-20 text-center">
        <Eyebrow>You made it</Eyebrow>
        <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(28px, 3.8vw, 44px)', lineHeight: 1.0, letterSpacing: '-0.04em', color: RICH }}>
          Here&rsquo;s your member pass
        </h2>
        <p className="mt-4 mx-auto max-w-[520px]" style={{ fontWeight: 300, fontSize: 16.5, lineHeight: 1.5, color: BODY }}>
          Top {badgeTopPct}% of AI adopters worldwide, verified by the assessment.
          It is already made out to you, add your LinkedIn to sign it, then post it and your card unfurls automatically.
        </p>
        <div className="mt-9">
          <PassGate
            name={passName}
            profileLabel={content.label}
            stageLabel={rung.className}
            topPct={badgeTopPct}
            refNo={refNo}
            issued={issued}
            description={content.outlook}
            submissionId={rowId}
            site={site}
          />
        </div>
      </div>
    </section>
  )

  return (
    <CheckoutModalProvider
      mode={checkoutMode}
      offer={offer}
      submissionId={rowId}
      country={visitorCountry}
      anonId={anonId ?? undefined}
      utmSource={segFields?.utm_source ?? undefined}
      utmRef={typeof searchParams.utm_ref === 'string' ? searchParams.utm_ref : undefined}
      fallbackUrl={checkoutUrl}
    >
      <TrackView event="result_view" props={{ pageVariant: 'v4', stage: stageKey, persona, submissionId: rowId }} />
      <ClarityTag submissionId={rowId} variant="v4" />
      <ExperimentTracker assignments={assignments} submissionId={rowId} />
      <Confetti onLoad />

      <div className="flex flex-col" style={{ backgroundColor: PAPER, color: INK, paddingBottom: 84 }}>

        {/* ── 1 · HERO (design lab: ?design=a|b|c|d swaps this; default below) ── */}
        {aspirational ? (
          <AspirationalHero
            offer={offer}
            firstName={firstName}
            score={segFields?.score ?? score}
            aheadPct={rt.aheadPct}
            stageKey={stageKey}
            rungClassName={rung.className}
            nextStageLabel={nextStage?.label ?? null}
            checkoutUrl={checkoutUrl}
            submissionId={rowId}
            ctaLabel={ov('offerCard.ctaLabel', CTA)}
          />
        ) : ['a', 'b', 'c', 'd'].includes(design) ? (
          <LabHero variant={design} firstName={firstName} score={score} topPct={topPct} leverage={leverage} rungClassName={rung.className} stageKey={stageKey} aheadPct={rt.aheadPct} checkoutUrl={checkoutUrl} submissionId={rowId} />
        ) : (
        // Two columns on desktop (copy left, gauge right) so the library video
        // clears the fold; stacks and centres on a phone.
        <section style={{ backgroundColor: PAPER, backgroundImage: GRAIN }}>
          <div className="max-w-[1100px] mx-auto px-6 sm:px-12 pt-10 sm:pt-16 pb-12 grid grid-cols-1 min-[900px]:grid-cols-[1fr_1fr] gap-10 min-[900px]:gap-20 items-center text-center min-[900px]:text-left">
            <div>
            <Eyebrow>Your quiz results</Eyebrow>
            {/* Two lenses, both true. Lead with the proud ADOPTION number (this
                is also what goes on the shareable pass), then open the gap: the
                gauge underneath shows the LEVERAGE rung, which is the low one.
                A fast adopter who is not yet getting AI to do the work. */}
            <h1 className="mt-4 font-bold" style={{ fontSize: 'clamp(34px, 5vw, 58px)', lineHeight: 1.0, letterSpacing: '-0.045em', color: RICH }}>
              {firstName ? `${firstName}, you` : 'You'}&rsquo;re a top{' '}
              <span style={{ color: FULVOUS }}>{badgeTopPct}%</span> AI adopter
            </h1>
            <p className="mt-4 mx-auto min-[900px]:mx-0 max-w-[520px]" style={{ fontWeight: 300, fontSize: 17.5, lineHeight: 1.5, color: BODY }}>
              Genuinely ahead of your peers. But adoption is not leverage, and on that ladder
              you&rsquo;re a <strong style={{ fontWeight: 700, color: RICH }}>{rung.className.toLowerCase()}</strong> with{' '}
              {nextStage ? 'room above you' : 'the top in sight'}. Here&rsquo;s the climb.
            </p>
            <div className="mt-5">
              <a
                href="#pass"
                className="inline-flex items-center gap-2"
                style={{ border: `2px dashed ${INK}`, backgroundColor: CREAM, color: INK, padding: '10px 22px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
              >
                🎟 Scroll down to unlock your pass ↓
              </a>
            </div>
            </div>

            {/* Right column: the tachometer */}
            <div className="min-w-0">
              <StageGauge stageKey={stageKey} aheadPct={rt.aheadPct} />
              {nextStage && (
                <p className="mt-1 text-center" style={{ fontSize: 14, color: BODY, fontWeight: 300 }}>
                  Next stop: <strong style={{ fontWeight: 700, color: RICH }}>{nextStage.label}</strong>, ≈1 wk away with the library.
                </p>
              )}
            </div>
          </div>
        </section>
        )}

        {/* ── 2+ · body order · the result_sellfirst_v1 arms ──────────────
            control:    video+offer → grid → reviews → plan → guarantee
            sellfirst:  plan → offer (no video) → grid → reviews → tour →
                        guarantee
            Every section is identical between arms, only the order and the
            video's position change, so a win is attributable to the order. */}
        {reveal && (
          <UnlockReveal
            offer={offer}
            firstName={firstName || null}
            checkoutUrl={checkoutUrl}
            submissionId={rowId}
            ctaLabel={ov('offerCard.ctaLabel', CTA)}
            // Imported in a server component, so the question list costs the
            // client bundle nothing and the claim tracks the real quiz length.
            questionCount={QUIZ_QUESTIONS.length}
          />
        )}

        {aspirational ? (
          // Result → the goods → the plan → the price. The wall is framed as
          // what the NEXT rung reads, so it is the thing between them and the
          // headline's promise rather than a catalogue.
          <>
            <LibraryGrid checkoutUrl={checkoutUrl} submissionId={rowId} nextStageLabel={nextStage?.label ?? null} />
            {studyPlanSection}
            {offerSection(false)}
            {reviewsSection}
            {videoTourSection}
          </>
        ) : !videoFirst ? (
          // The winner of result_sellfirst_v1, now the default page.
          <>
            {studyPlanSection}
            {offerSection(false)}
            <LibraryGrid checkoutUrl={checkoutUrl} submissionId={rowId} />
            {reviewsSection}
            {videoTourSection}
          </>
        ) : (
          <>
            {offerSection(true)}
            {/* Show the goods before the proof: real covers make "1,200+
                tutorials" concrete in a way the number never can, grouped by
                category so people find THEIR use case. */}
            <LibraryGrid checkoutUrl={checkoutUrl} submissionId={rowId} />
            {reviewsSection}
            {studyPlanSection}
          </>
        )}

        {/* Last objection, answered at the last decision point: everyone who
            reached the bottom and did not click is holding a "what if I get
            stuck with a renewal" worry, not a value worry. */}
        <RiskFree offer={offer} checkoutUrl={checkoutUrl} submissionId={rowId} ctaLabel={ov('riskFree.ctaLabel', CTA)} />

        {/* ── THE PASS · the reward, before the housekeeping ──────────── */}
        {passSection}

        {/* ── FAQ last: answers for the undecided, out of the way of
               everyone else. It should never sit between desire and reward. ── */}
        <section style={{ borderTop: `3px solid ${INK}` }}>
          <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
            <Eyebrow>Questions</Eyebrow>
            <div className="mt-6">
              {FAQS.map(f => <FAQItem key={f.q} q={f.q} a={f.a} />)}
            </div>
          </div>
        </section>
      </div>

      {/* Paid traffic only, and only after they have read the whole page AND
          moved to leave. A downsell must never reach someone who might still
          buy; by the time both gates pass, this person has already said no. */}
      <AdsRescue
        offerPrice={offer.price}
        submissionId={rowId}
        email={segFields?.email ?? null}
        firstName={firstName || null}
        utmSource={segFields?.utm_source ?? (typeof searchParams.utm_source === 'string' ? searchParams.utm_source : null)}
      />

      <OfferBar offer={offer} paymentUrl={checkoutUrl} submissionId={rowId} ctaLabel={ov('offerBar.ctaLabel', `${CTA} ↗`)} />
    </CheckoutModalProvider>
  )
}
