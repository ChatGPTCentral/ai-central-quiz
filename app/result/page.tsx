import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import CountdownTimer from '@/components/CountdownTimer'
import InlineCountdown from '@/components/InlineCountdown'
import FomoPopup from '@/components/FomoPopup'
import { RadarChart } from '@/components/RadarChart'
import { DocSearch } from '@/components/result/DocSearch'
import { EndScreenBlocks } from '@/components/result/EndScreenBlocks'
import { resolveTokens } from '@/lib/piping'
import { personaContent } from '@/lib/persona-content'
import { TESTIMONIALS } from '@/lib/sales-content'
import { stageDef, personaDef } from '@/lib/segmentation-v2'
import { getSegmentCopy } from '@/lib/segment-content'
import { getLivePublishedConfig } from '@/lib/form-config'
import { suggestedDocs } from '@/lib/notion'
import type { EndScreen } from '@/lib/form-schema'
import { pickEndScreen } from '@/lib/form-schema'

interface SegFields {
  email?: string | null
  stage?: string | null
  persona?: string | null
  friction?: string | null
  intent_30d?: string | null
  frequency_score?: number | null
  depth_score?: number | null
  breadth_score?: number | null
  momentum?: number | null
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
      .select('email, stage, persona, friction, intent_30d, frequency_score, depth_score, breadth_score, momentum, score')
      .eq('id', id)
      .maybeSingle()
    return (data as SegFields) || null
  } catch { return null }
}

/** Strip em/en dashes from any user-facing string (clean punctuation, not
 *  the repo's code-comment ` - -` convention). */
function noDash(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ', ')
}

/** Build the radar axes (0–100) from the submission's per-dimension scores.
 *  Used for the result-page "you today vs with AI Central" radar. */
function radarAxes(f: SegFields | null, overallScore: number): { label: string; value: number }[] {
  const freq = Math.min(100, ((f?.frequency_score ?? 0) / 3) * 100)
  const depth = Math.min(100, ((f?.depth_score ?? 0) / 6) * 100)
  const breadth = Math.min(100, ((f?.breadth_score ?? 0) / 6) * 100)
  const mom = Math.min(100, (((f?.momentum ?? 0) + 2) / 4) * 100)   // momentum is now -2..2
  return [
    { label: 'Frequency', value: Math.max(8, freq) },
    { label: 'Depth', value: Math.max(8, depth) },
    { label: 'Breadth', value: Math.max(8, breadth) },
    { label: 'Momentum', value: Math.max(8, mom) },
    { label: 'Overall', value: Math.max(8, overallScore) },
  ]
}

const UPSELL_URL = process.env.NEXT_PUBLIC_UPSELL_URL || 'https://buy.stripe.com/7sIcQe7NAgLT8s8008'
const LIBRARY_BASE = process.env.NEXT_PUBLIC_LIBRARY_URL || 'https://app.thecentral.ai'

/**
 * Build the library handoff URL for the trial CTA. Routes through the
 * library's own /login → /pricing → /api/stripe/checkout flow so the buyer
 * ends up in the library's Supabase (the legacy buy.stripe.com link
 * created a charge with no gated access). Pre-fills email when known so
 * the user doesn't retype it.
 */
function libraryCheckoutUrl(email?: string | null): string {
  const u = new URL(`${LIBRARY_BASE}/login`)
  u.searchParams.set('next', '/pricing')
  if (email) u.searchParams.set('email', email)
  return u.toString()
}

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
  const seg = getSegmentCopy({
    stage: segFields?.stage,
    persona,
    friction: segFields?.friction,
    intent: segFields?.intent_30d,
  })
  const stageMeta = stageDef(segFields?.stage)
  const personaMeta = personaDef(persona)
  // Static trial CTA (replaces the intent-aware copy); an editor end-screen
  // can still override the primary button via ctaText.
  const primaryCta = 'Start your trial'

  // Radar axes from the person's per-dimension scores.
  const axes = radarAxes(segFields, score)

  // Suggested docs from the AI Central document database (Notion), biased to
  // this persona's topics. Empty list if Notion isn't configured.
  const suggested = await suggestedDocs(content.tutorialKeywords, 4)

  // Editor-driven overrides: hero copy + body blocks. Picks the first
  // outcome whose `when` conditions match this submission's score/persona/
  // stage; falls back to a no-condition default outcome; falls through to the
  // stage/persona-driven defaults below when nothing matches.
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
  // Token context for piping — passed to both the hero text and the
  // editor-defined body blocks. Empty answers fall back to '' so labels
  // like "Nice work, {firstName}!" gracefully degrade.
  const tokens = {
    answers: { name: name || '' },
    persona: persona ?? null,
    personaLabel: personaMeta?.key !== 'unknown' ? personaMeta?.label ?? null : null,
    stage: segFields?.stage ?? null,
    stageLabel: stageMeta?.key !== 'unknown' ? stageMeta?.label ?? null : null,
    score,
    intentLabel: segFields?.intent_30d ?? null,
    frictionLabel: segFields?.friction ?? null,
  }
  const heroHeadline = endScreen?.heroHeadline
  const heroSubheadline = endScreen?.heroSubheadline
  const ctaText = endScreen?.ctaText ?? primaryCta
  // Trial CTAs all route into the library funnel by default; an editor
  // end-screen can still override with its own ctaUrl when needed.
  const libraryUrl = libraryCheckoutUrl(segFields?.email)
  const ctaUrl = endScreen?.ctaUrl ?? libraryUrl

  return (
    <>
      <CountdownTimer paymentUrl={libraryUrl} />

      <div className="pt-10 min-h-screen flex flex-col" style={{ backgroundColor: '#FFFDFA' }}>
        {/* ── HERO: 2-column — text left, radar right ─────── */}
        <section
          className="relative px-6 pt-10 pb-12 sm:pb-16 w-full overflow-hidden border-b"
          style={{
            borderColor: '#E8E4DF',
            background: `
              radial-gradient(60% 60% at 80% 15%, #62A75822 0%, transparent 60%),
              radial-gradient(50% 50% at 12% 95%, #E4871522 0%, transparent 60%),
              linear-gradient(180deg, #F4F1EA 0%, #FBFAF5 60%, #FFFDFA 100%)
            `,
          }}
        >
          {/* Apple-style perspective grid overlay */}
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
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center max-w-5xl mx-auto">
            {/* LEFT — copy */}
            <div className="text-center md:text-left">
              {heroHeadline ? (
                <h1 className="text-[30px] sm:text-[36px] md:text-[42px] font-black leading-[1.05] mb-3" style={{ color: '#333333' }}>
                  {resolveTokens(heroHeadline, tokens)}
                </h1>
              ) : (
                <h1 className="text-[30px] sm:text-[36px] md:text-[42px] font-black leading-[1.05] mb-3" style={{ color: '#333333' }}>
                  {firstName ? `${firstName}, you're a ` : "You're a "}
                  <span style={{ color: '#E48715' }}>{stageMeta && stageMeta.key !== 'unknown' ? stageMeta.label : 'rising AI user'}</span>.
                  {' '}Here&apos;s how far AI Central takes you
                </h1>
              )}

              <p className="text-[15px] sm:text-[16px] leading-relaxed max-w-md mx-auto md:mx-0 mb-6 sm:mb-7" style={{ color: '#9C9C9C' }}>
                {heroSubheadline
                  ? resolveTokens(heroSubheadline, tokens)
                  : 'Your skill profile today, and the headroom the library unlocks'}
              </p>

              <a
                href={ctaUrl}
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl font-black text-[15px] sm:text-[16px] transition-all active:scale-[0.99] hover:opacity-90 shadow-sm"
                style={{ backgroundColor: '#333333', color: '#FFFDFA' }}
              >
                Unlock 1,200+ AI tutorials
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </a>
            </div>

            {/* RIGHT — radar */}
            <div className="flex justify-center md:justify-end">
              <div className="w-full max-w-[460px]">
                <RadarChart
                  axes={axes}
                  mode="result"
                  accent="#62A758"
                  size={360}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── EDITOR-DRIVEN BODY BLOCKS (if any) ─────────── */}
        {endScreen && endScreen.blocks.length > 0 && (
          <section className="px-6 pb-6 max-w-2xl mx-auto w-full">
            <EndScreenBlocks blocks={endScreen.blocks} tokens={tokens} accent="#E48715" />
          </section>
        )}

        {/* ── STAGE CARD — the ladder rung the reader is on. ── */}
        {stageMeta && stageMeta.key !== 'unknown' && (
          <section className="px-6 pt-10 pb-6 max-w-2xl mx-auto w-full">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] mb-3" style={{ color: '#9C9C9C' }}>
              Your AI profile
            </p>
            <div
              className="rounded-2xl p-7 mb-4 relative overflow-hidden"
              style={{ backgroundColor: '#FFFFFF', border: `1px solid #E8E4DF`, boxShadow: `0 4px 30px ${stageMeta.color}1A` }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ background: `linear-gradient(90deg, ${stageMeta.color} 0%, #E48715 100%)` }}
              />
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-[32px] leading-none">{stageMeta.emoji}</span>
                <h1 className="text-[28px] sm:text-[34px] font-black leading-tight" style={{ color: stageMeta.color }}>
                  {stageMeta.label}
                </h1>
              </div>
              <p className="text-[15px] leading-relaxed" style={{ color: '#333333' }}>
                {noDash(stageMeta.description)}
              </p>
              {seg.personaLane.lane !== 'general' && (
                <p className="text-[11px] mt-4 italic" style={{ color: '#9C9C9C' }}>
                  💡 {seg.personaLane.hook}
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── PRIMARY CTA — Fulvous, intent-aware copy ───── */}
        <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
          <a
            href={ctaUrl}
            className="block w-full py-4 font-black text-[15px] rounded-xl text-center transition-all active:scale-[0.99] hover:opacity-90"
            style={{ backgroundColor: '#333333', color: '#FFFDFA' }}
          >
            {ctaText} →
          </a>
          <p className="text-center text-[12px] mt-3" style={{ color: '#9C9C9C' }}>
            $4.99 first month · Then $59.75/year · Cancel anytime
          </p>
          <div className="flex items-center justify-center gap-3 mt-2 text-[11px]" style={{ color: '#9C9C9C' }}>
            <span>⭐ 350+ five-star reviews</span>
            <span>·</span>
            <span>30-day guarantee</span>
            <span>·</span>
            <span>Instant access</span>
          </div>
        </section>

        {/* ── AI ADOPTION LADDER (moved up — visible without deep scroll) ── */}
        <section className="px-6 pb-12 max-w-2xl mx-auto w-full">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] mb-3 text-center" style={{ color: '#9C9C9C' }}>
            The AI adoption ladder
          </p>
          <h2 className="text-[24px] sm:text-[28px] font-black mb-6 text-center leading-tight" style={{ color: '#333333' }}>
            {stageMeta && stageMeta.key !== 'unknown'
              ? <>You&apos;re on rung <span style={{ color: stageMeta.color }}>{stageMeta.score + 1} of 6</span>. Here&apos;s the climb</>
              : <>The 6 rungs of the AI adoption ladder</>}
          </h2>

          <div className="flex flex-col gap-2.5">
            {[
              { key: 'S0_unaware',      emoji: '🌑', label: 'Unaware',      desc: 'Heard the name, not on the ladder yet' },
              { key: 'S1_curious',      emoji: '🌱', label: 'Curious',      desc: 'Heard about AI. Hasn\'t used it' },
              { key: 'S2_experimenter', emoji: '🧪', label: 'Experimenter', desc: 'Plays with ChatGPT occasionally' },
              { key: 'S3_practitioner', emoji: '⚙️', label: 'Practitioner', desc: 'Uses AI weekly for real work' },
              { key: 'S4_power_user',   emoji: '🚀', label: 'Power User',   desc: 'Daily. Multiple tools. Saved prompts' },
              { key: 'S5_builder',      emoji: '🏗️', label: 'Builder',      desc: 'Ships AI workflows to customers and team' },
            ].map((rung) => {
              const isCurrent = stageMeta?.key === rung.key
              return (
                <div
                  key={rung.key}
                  className="flex items-center gap-4 p-3.5 rounded-xl transition-all"
                  style={{
                    backgroundColor: isCurrent ? '#FEF7E7' : '#FFFFFF',
                    border: isCurrent ? '2px solid #E48715' : '1px solid #E8E4DF',
                    boxShadow: isCurrent ? '0 4px 14px rgba(228, 135, 21, 0.15)' : 'none',
                  }}
                >
                  <span className="text-[24px] flex-shrink-0">{rung.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[14px] font-black" style={{ color: '#333333' }}>{rung.label}</span>
                      {isCurrent && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider" style={{ backgroundColor: '#E48715', color: '#FFFDFA' }}>
                          You are here
                        </span>
                      )}
                    </div>
                    <p className="text-[12px]" style={{ color: '#9C9C9C' }}>{rung.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── FRICTION BLOCKER (only shown when v2 friction known) ── */}
        {seg.friction && (
          <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
            <div
              className="rounded-2xl p-7"
              style={{ backgroundColor: '#FEF7E7', border: '1px solid #E7B02F' }}
            >
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#BE593B' }}>
                {seg.friction.badge}
              </p>
              <h3 className="text-[22px] sm:text-[26px] font-black mb-3 leading-tight" style={{ color: '#333333' }}>
                {seg.friction.blockerTitle}
              </h3>
              <p className="text-[14px] leading-relaxed" style={{ color: '#333333' }}>
                {seg.friction.blockerBody}
              </p>
            </div>
          </section>
        )}

        {/* ── BAND: latte tint behind library intro + pillars ── */}
        <div className="w-full" style={{ background: '#F4F1EA' }}>
        {/* ── WHAT IS THE AI CENTRAL LIBRARY ── */}
        <section className="px-6 pt-12 pb-10 max-w-2xl mx-auto w-full">
          <h2 className="text-[26px] sm:text-[32px] font-black leading-[1.1] mb-5" style={{ color: '#333333' }}>
            What is the <span style={{ color: '#E48715' }}>AI Central library</span>?
          </h2>
          <p className="text-[15px] leading-relaxed mb-6" style={{ color: '#333333' }}>
            The <strong>1,200+ tutorial library</strong> built for senior professionals who want to actually <em>use</em> AI at work, not read about it. Curated by editors, sequenced into a path, tied to real business outcomes
          </p>

          <ul className="flex flex-col gap-3 mb-6">
            {[
              <>Get <strong>1,200+ tested AI workflows</strong> covering ChatGPT, Claude, Gemini, custom GPTs, automations, agents, and the playbooks behind them</>,
              <>Access <strong>50+ ready-to-deploy templates</strong> for prompts, email sequences, decks, briefs, and standard ops. Copy, paste, ship</>,
              <>Join a <strong>community of 2,000+ paying members</strong> doing the same work you are. Operators, founders, makers, decision-makers</>,
              <>Weekly drops from the <strong>AI Central editorial team</strong> on the new tools, models, and patterns worth your attention</>,
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-[14px]" style={{ color: '#333333' }}>
                <span className="font-black text-[14px] mt-px flex-shrink-0" style={{ color: '#E48715' }}>→</span>
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ul>

          <p className="text-[15px] leading-relaxed" style={{ color: '#333333' }}>
            Unlike free AI content online, every workflow inside the library is{' '}
            <mark style={{ background: 'linear-gradient(180deg, transparent 60%, #FAEFC8 60%)', padding: '0 4px', borderRadius: '2px', color: 'inherit' }}>
              <strong>tested by editors and tied to a real business outcome</strong>
            </mark>
            . You get a sequenced path, not a search bar
          </p>
        </section>

        {/* ── 4 PILLARS GRID ── */}
        <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { eyebrow: 'Tutorials',     title: '1,200+ tested workflows',  body: 'Every tutorial walks you through a real business outcome step by step. No fluff, no theory chapters' },
              { eyebrow: 'Templates',     title: '50+ ready to deploy',      body: 'Prompts, decks, briefs, automations. Copy, paste, ship. Built by operators who use them in production' },
              { eyebrow: 'Community',     title: '2,000+ paying members',    body: 'Operators, founders, makers, and decision-makers actually using AI at work. Share what\'s working in your role' },
              { eyebrow: 'Editorial',     title: 'Weekly drops, no noise',   body: 'The AI Central team filters the 14,000+ tools and 50+ weekly papers down to the handful actually worth your attention' },
            ].map((p) => (
              <div
                key={p.eyebrow}
                className="p-6 rounded-2xl transition-all"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DF', boxShadow: '0 4px 30px rgba(228, 135, 21, 0.05)' }}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.18em] mb-2" style={{ color: '#E48715' }}>{p.eyebrow}</p>
                <h3 className="text-[18px] font-black leading-snug mb-2" style={{ color: '#333333' }}>{p.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: '#555' }}>{p.body}</p>
              </div>
            ))}
          </div>
        </section>
        </div>{/* end latte band: library intro + pillars */}

        {/* ── FOUNDER LETTER (styled as an actual letter) ── */}
        <section className="px-6 pt-12 pb-10 max-w-2xl mx-auto w-full">
          <div
            className="rounded-2xl px-7 py-8 sm:px-10 sm:py-10"
            style={{ backgroundColor: '#FCFAF4', border: '1px solid #E8E4DF', boxShadow: '0 4px 30px rgba(228,135,21,0.05)' }}
          >
            {/* Letterhead */}
            <div className="mb-6 pb-4" style={{ borderBottom: '1px solid #EDE7DC' }}>
              <span className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: '#9C9C9C' }}>
                A note from the founder
              </span>
            </div>

            <div style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              <p className="text-[16px] leading-relaxed mb-5" style={{ color: '#333333' }}>
                {firstName ? `Dear ${firstName},` : 'Hi there,'}
              </p>

              <p className="text-[16px] leading-[1.7] mb-4" style={{ color: '#333333' }}>
                After building AI Central into a <strong style={{ color: '#E48715' }}>300,000+ reader network</strong> and watching <strong style={{ color: '#E48715' }}>2,000+ professionals</strong> upgrade into our paid library, I&apos;ve learned something about who actually wins with AI.
              </p>

              {[
                'Most people researching AI today are stuck in the same loop. They read a viral thread, install a new tool, fiddle for an hour, and put it down. Six months later, nothing has shipped.',
                'The ones who actually win, the ones who quietly become the AI person on their team, do one thing differently. They stop researching and pick one workflow that compounds.',
              ].map((p, i) => (
                <p key={i} className="text-[16px] leading-[1.7] mb-4" style={{ color: '#333333' }}>{p}</p>
              ))}

              <p className="text-[16px] leading-[1.7] mb-4" style={{ color: '#333333' }}>
                <mark style={{ background: 'linear-gradient(180deg, transparent 60%, #FAEFC8 60%)', padding: '0 4px', borderRadius: '2px', color: 'inherit' }}>
                  <strong>One workflow shipped beats ten tutorials watched.</strong>
                </mark>
              </p>

              {[
                "That's the entire premise of the AI Central library. Every tutorial is a workflow, not a lecture, sequenced into a path that fits your role and where you sit on the AI ladder.",
                "You just took the quiz, so we know your stage, your persona, and what's blocking you. Your plan above isn't a generic course recommendation. It's a path mapped to your actual starting line.",
                "If you join today, you keep that path. If you don't, you go back to research mode, and we both know how that ends.",
              ].map((p, i) => (
                <p key={i} className="text-[16px] leading-[1.7] mb-4" style={{ color: '#333333' }}>{p}</p>
              ))}

              <p className="text-[16px] leading-[1.7] mt-6 mb-1" style={{ color: '#333333', fontStyle: 'italic' }}>See you inside, Alex</p>
              <p className="text-[12px] mt-1" style={{ color: '#9C9C9C' }}>Founder &amp; Chief Editor, AI Central</p>
            </div>
          </div>
        </section>


        {/* ── BAND: latte tint behind Notion search + testimonials ── */}
        <div className="w-full" style={{ background: '#F4F1EA' }}>
        {/* ── EXPLORE THE LIBRARY (Notion-backed search) ──────── */}
        <section className="px-6 pt-12 pb-10 max-w-2xl mx-auto w-full">
          <div className="h-px bg-[#E8E4DF] mb-8" />
          <h2 className="text-xl font-black mb-1 text-center" style={{ color: '#333333' }}>Explore the AI Central library</h2>
          <p className="text-[13px] mb-6 text-center" style={{ color: '#9C9C9C' }}>
            {suggested.length > 0
              ? `Hand-picked for ${content.label}s. Search 1,200+ more`
              : 'Search 1,200+ tested AI workflows and templates'}
          </p>
          <DocSearch initialDocs={suggested} paymentUrl={libraryUrl} accent="#E48715" />
        </section>

        {/* ── MODULE 7: TRUSTED BY (testimonials) ──────────── */}
        <section className="px-6 pb-10 max-w-2xl mx-auto w-full">
          <div className="h-px bg-[#E8E4DF] mb-8" />
          <h2 className="text-xl font-black mb-2 text-center" style={{ color: '#333333' }}>Hear from our members</h2>
          <p className="text-[13px] text-center mb-6" style={{ color: '#9C9C9C' }}>Real professionals. Real results. 350+ five-star reviews</p>
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
        </div>{/* end latte band: Notion search + testimonials */}

        {/* ── MODULE 8: UNLOCK YOUR PERSONALIZED PLAN ───────── */}
        <section className="px-6 pt-12 pb-10 max-w-2xl mx-auto w-full" id="pricing">
          <div className="h-px bg-[#E8E4DF] mb-8" />
          <h2 className="text-[26px] sm:text-[32px] font-black leading-[1.1] mb-3 text-center" style={{ color: '#333333' }}>
            Unlock the <span style={{ color: '#E48715' }}>AI Central</span> library
          </h2>
          <p className="text-[14px] leading-relaxed text-center mb-2 max-w-md mx-auto" style={{ color: '#9C9C9C' }}>
            1,200+ curated AI and ChatGPT tutorials. Save months of trial-and-error
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

          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', border: '2px solid #333333', boxShadow: '0 12px 40px rgba(228, 135, 21, 0.15)' }}
          >
            {/* Most-popular ribbon — Fulvous, with live countdown */}
            <div
              className="text-center py-2.5 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 flex-wrap"
              style={{ backgroundColor: '#E48715', color: '#FFFDFA' }}
            >
              <span>Most popular · 30-day guarantee</span>
              <span aria-hidden style={{ opacity: 0.6 }}>·</span>
              <InlineCountdown className="normal-case tracking-normal" />
            </div>

            <div className="p-6 border-b" style={{ borderColor: '#E8E4DF' }}>
              <p className="text-[11px] font-black uppercase tracking-widest mb-4" style={{ color: '#9C9C9C' }}>What&apos;s included</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PLAN_BENEFITS.map((label) => (
                  <div key={label} className="flex items-start gap-2 text-[14px]" style={{ color: '#333333' }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-0.5">
                      <circle cx="7" cy="7" r="7" fill="#62A758"/>
                      <path d="M4.5 7l1.8 1.8L9.5 5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="leading-snug">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6" style={{ backgroundColor: '#FEF7E7' }}>
              <div className="flex items-end justify-between mb-1">
                <span className="font-black text-[18px]" style={{ color: '#333333' }}>Your price today</span>
                <div className="text-right leading-none">
                  <span className="font-black text-[42px]" style={{ color: '#333333' }}>{SALE_PRICE}</span>
                  <p className="text-[11px] mt-1" style={{ color: '#9C9C9C' }}>first month</p>
                </div>
              </div>
              <p className="text-[11px] text-right mb-5" style={{ color: '#9C9C9C' }}>{RENEWAL_COPY}</p>

              <a
                href={libraryUrl}
                className="block w-full py-4 font-black text-[15px] rounded-xl text-center transition-all active:scale-[0.99] hover:opacity-90"
                style={{ backgroundColor: '#333333', color: '#FFFDFA' }}
              >
                Start my 1-month trial →
              </a>

              {/* Trust strip */}
              <div className="flex items-center justify-center gap-3 mt-3 text-[11px]" style={{ color: '#9C9C9C' }}>
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
                  className="text-[12px] underline underline-offset-2 transition-opacity hover:opacity-70"
                  style={{ color: '#9C9C9C' }}
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
          <h2 className="text-[28px] sm:text-[32px] font-black mb-2 text-center leading-tight" style={{ color: '#333333' }}>
            Frequently asked <span style={{ color: '#E48715' }}>questions</span>
          </h2>
          <p className="text-[14px] text-center mb-8" style={{ color: '#9C9C9C' }}>The stuff people actually ask before they join</p>
          <div>
            {FAQS.map((item) => (
              <FAQItem key={item.q} q={noDash(item.q)} a={noDash(item.a)} />
            ))}
          </div>
        </section>

        {/* ── CLOSING: AI doesn't have to be complicated ──── */}
        <section className="px-6 pb-16 max-w-2xl mx-auto w-full">
          <div
            className="rounded-2xl p-8 sm:p-10 text-center relative overflow-hidden"
            style={{ backgroundColor: '#333333' }}
          >
            {/* Fulvous top accent */}
            <div
              className="absolute top-0 left-0 right-0 h-1"
              style={{ background: 'linear-gradient(90deg, #E48715 0%, #E7B02F 100%)' }}
            />
            <h2 className="text-[26px] sm:text-[32px] font-black leading-[1.1] mb-3" style={{ color: '#FFFDFA' }}>
              AI doesn&apos;t have to be <span style={{ color: '#E48715' }}>complicated</span>
            </h2>
            <p className="text-[15px] leading-relaxed mb-7 max-w-md mx-auto" style={{ color: '#FFFDFA', opacity: 0.85 }}>
              Join 2,000+ professionals already using the AI Central library. 1,200+ curated tutorials. 15 minutes to your first result. No fluff
            </p>
            <a
              href={libraryUrl}
              className="inline-block px-8 py-4 font-black text-[14px] rounded-xl transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ backgroundColor: '#E48715', color: '#FFFDFA', boxShadow: '0 6px 20px rgba(228, 135, 21, 0.4)' }}
            >
              {primaryCta} for {SALE_PRICE} →
            </a>
            <p className="text-[11px] mt-4" style={{ color: '#FFFDFA', opacity: 0.5 }}>
              Then $59.75/year · Cancel anytime · 30-day money-back guarantee
            </p>
            <div className="mt-3">
              <a
                href={UPSELL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] underline transition-opacity hover:opacity-80"
                style={{ color: '#FFFDFA', opacity: 0.5 }}
              >
                Or get lifetime access →
              </a>
            </div>
          </div>
        </section>

      </div>

      {/* Sticky bottom bar (mobile) — Fulvous accent */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 py-3 flex items-center justify-between gap-3 sm:hidden z-40 border-t"
        style={{ backgroundColor: '#FFFFFF', borderColor: '#E48715' }}
      >
        <div>
          <p className="text-[12px] font-black" style={{ color: '#333333' }}>{SALE_PRICE}/mo today</p>
          <p className="text-[10px]" style={{ color: '#9C9C9C' }}>30-day guarantee</p>
        </div>
        <a
          href={libraryUrl}
          className="flex-shrink-0 px-5 py-2.5 rounded-xl font-black text-[13px] transition-all active:scale-[0.99]"
          style={{ backgroundColor: '#E48715', color: '#FFFDFA' }}
        >
          {primaryCta.length > 18 ? 'Start trial' : primaryCta} →
        </a>
      </div>

      <FomoPopup />
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
