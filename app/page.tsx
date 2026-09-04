import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import AICentralLogo from '@/components/AICentralLogo'
import FomoMarquee from '@/components/FomoMarquee.client'
import TrackView from '@/components/TrackView'
import ExperimentTracker from '@/components/ExperimentTracker.client'
import { resolveExperiments, getVariantOverrides } from '@/lib/experiments'
import { PassCard } from '@/components/result/PassCard'

// landing_skip_v1 (owner, 2026-08-25): does skipping the landing page and
// sending traffic straight to quiz question 1 change anything? Declared
// 2 weeks, closes 2026-09-07. Primary metric quiz_completed (a landing-page
// change is exactly the "quiz-entry style test" experiment-queries.ts calls
// out as worth deciding on completion, not clicks), net_new_paid watched as
// the guardrail per CLAUDE.md's testing rule 4. 50/50, bandit OFF — a
// declared test wants a stable split for its whole window, not weights
// drifting mid-read.
//
// The 'skip' arm never renders this page, so the normal client-side
// <ExperimentTracker> exposure beacon never mounts for it. Recorded
// server-side instead, via the same RPC /api/events uses, before the
// redirect fires — the control arm still gets its exposure the normal way,
// from the ExperimentTracker already on this page.
function opsDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export const metadata = {
  title: 'AI Central, where do you rank in AI adoption?',
  description:
    'A 40-second quiz. Discover your AI Readiness Type and exactly where you land vs. everyone else, then get a plan to climb.',
}

// Design tokens (funnel handoff aesthetic on the proven prod layout)
const FULVOUS = '#E48715'
const INK = '#333333'
const RICH = '#1A1A1A'
const CREAM = '#FEF7E7'
const PAPER = '#FFFDFA'
const MUTE = '#666666'

// Subtle paper grain — inline SVG (the handoff texture PNG is too heavy).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")"

export default async function HomePage({
  searchParams,
}: { searchParams: Record<string, string | string[] | undefined> }) {
  // Forward every incoming query param verbatim onto the "Start the quiz"
  // CTA, so a single shareable URL like /?email=…&utm_source=… still
  // triggers the email-skip + UTM capture once the user lands on /quiz-v2.
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === 'string' && v.trim() !== '') params.set(k, v)
  }
  const qs = params.toString()
  const quizHref = qs ? `/quiz-v2?${qs}` : '/quiz-v2'

  // ── Experiments on the landing page ──────────────────────────────────
  // Same engine and the same admin kill switch as /result, just page:'landing'.
  // Fails open: any error serves the page exactly as it is today.
  const cookieStore = cookies()
  const anonId = cookieStore.get('ac_aid')?.value ?? headers().get('x-anon-id') ?? null
  const previewVar = typeof searchParams.xv === 'string' ? searchParams.xv.trim() : ''
  // landing_skip_v1 doesn't express itself as an override slot like every
  // other experiment on this page — it's a redirect, so ?xv= preview needs
  // its own check here rather than going through getVariantOverrides.
  // Preview only: never records an exposure, same as every other ?xv= look.
  if (previewVar) {
    const [a, b] = previewVar.split(':')
    const previewExpKey = b ? a : null
    const previewVarKey = (b ?? a).trim()
    if (previewVarKey === 'skip' && (!previewExpKey || previewExpKey === 'landing_skip_v1')) redirect(quizHref)
  }
  const { assignments, overrides } = previewVar
    ? { assignments: [] as { experimentKey: string; variantKey: string }[], overrides: await getVariantOverrides('landing', previewVar) }
    : await resolveExperiments({
        anonId,
        cookieVariant: k => cookieStore.get(`ac_exp_${k}`)?.value,
        utmSource: typeof searchParams.utm_source === 'string' ? searchParams.utm_source : null,
        page: 'landing',
      })

  // landing_skip_v1: the 'skip' arm never sees this page at all.
  const skipAssignment = assignments.find(a => a.experimentKey === 'landing_skip_v1')
  if (skipAssignment?.variantKey === 'skip') {
    if (anonId) {
      const c = opsDb()
      if (c) {
        await c.rpc('upsert_experiment_assignment', {
          p_experiment_key: 'landing_skip_v1',
          p_anon_id: anonId,
          p_variant_key: 'skip',
        }).then(
          ({ error }) => { if (error) console.error('[landing_skip_v1] exposure RPC failed:', error.message) },
          err => console.error('[landing_skip_v1] exposure RPC threw:', err),
        )
      }
    }
    redirect(quizHref)
  }

  // The desktop button under the pass card. Today it says "Share on LinkedIn"
  // on a page where the visitor has nothing to share yet, and it is the most
  // saturated element in the left column. Desktop converts 45.8% to a quiz
  // start against mobile's 60.5%, on twice the traffic, and mobile is the
  // layout that does NOT have this button.
  const secondaryCta = overrides['landing.secondaryCta'] === 'quiz' ? 'quiz' : 'share'

  // entry_microcopy_v1 (research play #6): the effort line under both CTAs.
  // Control is today's copy, verbatim, as the fallback — the variant swaps in
  // a concrete question count and a reader-exclusive frame via the same
  // override map secondaryCta uses. Copy-only: no new code paths, fails open
  // to today's line on any resolution error.
  const effortNote = overrides['landing.effortNote'] ?? 'free, no card, 40 seconds'

  // landing_desktop_v1. Desktop is two thirds of our traffic and starts the
  // quiz at 45.7% against mobile's 60.8% — a fifteen point gap that has held
  // for six straight weeks. Mobile's advantage is not its size, it is its
  // ORDER: headline, one button, then the reward. Desktop currently splits
  // attention across two columns where the pass card competes with the CTA,
  // which is the same pattern that produced 169 dead clicks on that card
  // before we made it clickable. This variant gives desktop the mobile
  // order in a desktop-sized layout: one column, one obvious action, the
  // pass below as the reward rather than the rival. Mobile is untouched.
  // Note the viewport pin below: the two-column hero is fixed to exactly one
  // screen (lg:h-[100dvh] + overflow-hidden). The one-column stack is TALLER
  // than that by design (the pass sits under the CTA), so with the pin left on
  // it would be silently clipped and unscrollable. The variant drops the pin.
  const desktopOneCol = overrides['landing.desktopLayout'] === 'onecol'

  return (
    <div
      className={`relative min-h-[100dvh] ${desktopOneCol ? '' : 'lg:h-[100dvh] lg:overflow-hidden'} flex flex-col`}
      style={{ backgroundColor: PAPER, backgroundImage: GRAIN }}
    >
      <TrackView event="quiz_view" />
      <ExperimentTracker assignments={assignments} />

      {/* Top bar — logo only (prod layout). */}
      <nav className="px-5 sm:px-8 py-4 sm:py-5">
        <div className="max-w-6xl mx-auto">
          <AICentralLogo height={22} />
        </div>
      </nav>

      {/* xl:pr reserves the right rail the fixed FOMO marquee occupies, so the
          flipped hero copy never runs underneath it. */}
      <main
        className={`flex-1 flex items-start justify-center px-5 sm:px-8 py-6 xl:pr-[280px] ${
          desktopOneCol ? 'lg:pt-10 lg:pb-16' : 'min-h-0 lg:items-center lg:py-0'
        }`}
      >
        {/* ── MOBILE (<lg) — owner's explicit order: headline → tagline →
            LinkedIn-style CTA (see where I rank) → free note → description →
            card. Hidden on lg+, which uses the flipped two-column grid. ── */}
        <div className="lg:hidden w-full max-w-md mx-auto flex flex-col items-center text-center">
          {/* The headline is tapped and it went nowhere: 6 dead clicks in six
              hours on 2026-09-04, split between the two halves of this
              sentence. Same lesson as the completions badge in 9abd55d — on a
              page whose only job is to start the quiz, anything a person
              reaches for should start the quiz. The question mark is an
              invitation; it now answers. */}
          <Link href={quizHref} aria-label="see where I rank" style={{ textDecoration: 'none', color: 'inherit', display: 'block', width: '100%' }}>
            <h1
              className="font-bold"
              style={{ fontSize: 'clamp(30px, 8.5vw, 40px)', lineHeight: 1.04, letterSpacing: '-0.035em', color: RICH, marginBottom: 12 }}
            >
              Most people haven&apos;t started with AI.{' '}
              <span style={{ color: FULVOUS }}>Where do you rank?</span>
            </h1>
          </Link>
          <p className="uppercase" style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.05em', color: FULVOUS, marginBottom: 18 }}>
            The 40-second AI readiness quiz
          </p>
          <Link
            href={quizHref}
            aria-label="see where I rank"
            className="inline-flex items-center justify-center gap-2.5 rounded-full bg-[#0A66C2] hover:bg-[#004182] transition-colors w-full"
            style={{ color: '#FFFFFF', padding: '14px 28px', fontSize: 16, fontWeight: 600, textDecoration: 'none' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }} aria-hidden>
              <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
            </svg>
            see where I rank
          </Link>
          <p style={{ fontSize: 12.5, color: MUTE, marginTop: 10, marginBottom: 18 }}>{effortNote}</p>
          <p style={{ fontSize: 16, fontWeight: 300, lineHeight: 1.5, color: '#4A4A4A', marginBottom: 22 }}>
            Take the quiz to get your <strong style={{ color: INK, fontWeight: 600 }}>AI Readiness Type</strong> and
            see exactly where you land versus everyone else, then a plan to climb
          </p>
          <div className="w-full max-w-[400px]">
            {/* The pass is the single most tapped thing on this page and it
                did nothing. Clarity counted 169 dead clicks in 14 days across
                1,365 landing sessions: a card that says YOUR NAME and STAGE:
                ????? reads as the thing to touch, and touching it went
                nowhere. It goes to the quiz now, same destination as the
                button under it. A person who wants to act should never have to
                find the right pixel. */}
            <Link href={quizHref} aria-label="take the quiz and mint your member pass" style={{ display: 'block', textDecoration: 'none' }}>
              <PassCard
                name="YOUR NAME"
                personaLabel="AI Professional"
                stageLine="STAGE: ?????"
                passPct="Top ??% World"
                issued={`${String(new Date().getMonth() + 1).padStart(2, '0')} / ${new Date().getFullYear()}`}
                refNo="AC-????"
                description="Take the 40-second quiz to mint your member pass, see your AI Readiness Type, and where you rank among 8.1 billion people."
              />
            </Link>
          </div>
        </div>

        {/* ── DESKTOP one-column (landing_desktop_v1 variant) ──────────
            Mobile's order, at desktop scale: headline, the single action,
            the effort note, one line of what they get, then the pass as the
            reward underneath. Nothing here competes with the button. */}
        {desktopOneCol && (
          <div className="hidden lg:flex w-full max-w-[760px] mx-auto flex-col items-center text-center">
            <p className="uppercase" style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.05em', color: FULVOUS, marginBottom: 14 }}>
              The 40-second AI readiness quiz
            </p>
            {/* Clickable for the same reason as the mobile headline above. */}
            <Link href={quizHref} aria-label="see where I rank" style={{ textDecoration: 'none', color: 'inherit', display: 'block', width: '100%' }}>
              <h1
                className="font-bold"
                style={{ fontSize: 'clamp(38px, 3.6vw, 52px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH, marginBottom: 16 }}
              >
                Most people haven&apos;t started with AI.{' '}
                <span style={{ color: FULVOUS }}>Where do you rank?</span>
              </h1>
            </Link>
            <p style={{ fontSize: 18, fontWeight: 300, lineHeight: 1.5, color: '#4A4A4A', maxWidth: 560, marginBottom: 26 }}>
              Take the quiz to get your <strong style={{ color: INK, fontWeight: 600 }}>AI Readiness Type</strong> and
              see exactly where you land versus everyone else, then a plan to climb
            </p>

            <Link
              href={quizHref}
              className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]"
              style={{ textDecoration: 'none' }}
            >
              <span
                className="inline-flex items-center justify-center"
                style={{ backgroundColor: INK, color: CREAM, fontWeight: 700, fontSize: 19, height: 62, padding: '0 38px' }}
              >
                see where I rank
              </span>
              <span
                className="inline-flex items-center justify-center"
                style={{ backgroundColor: FULVOUS, color: RICH, width: 62, height: 62, borderLeft: `2px solid ${RICH}`, fontWeight: 700, fontSize: 19 }}
                aria-hidden
              >
                ↗
              </span>
            </Link>
            <p style={{ fontSize: 13, color: MUTE, marginTop: 12 }}>{effortNote}</p>

            {/* This badge was the single most dead-clicked element on the
                page (41 clicks in 14 days, PostHog $dead_click, more than
                anywhere else): the bordered pill reads as a button, and
                people tap it expecting something to happen. Same fix as the
                pass card below — it goes to the quiz now (2026-09-02). */}
            <Link
              href={quizHref}
              aria-label="take the quiz"
              className="inline-flex items-center justify-center gap-4 px-4 py-2.5 font-mono transition-transform hover:-translate-y-px active:scale-[0.98]"
              style={{ backgroundColor: '#FFFFFF', border: `2px solid ${INK}`, fontSize: 10.5, letterSpacing: '0.08em', color: INK, marginTop: 18, textDecoration: 'none' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={FULVOUS} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
                ~40 SEC TO COMPLETE
              </span>
              <span aria-hidden style={{ color: '#C9C7BF' }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span style={{ color: '#62A758' }}>●</span>
                2,768 COMPLETED
              </span>
            </Link>

            {/* The reward, underneath and smaller: it shows what the quiz
                mints without competing for the click. Still clickable, since
                people reach for it. */}
            <div className="mt-8" style={{ width: 420 }}>
              <Link href={quizHref} aria-label="take the quiz and mint your member pass" style={{ display: 'block', textDecoration: 'none' }}>
                <PassCard
                  name="YOUR NAME"
                  personaLabel="AI Professional"
                  stageLine="STAGE: ?????"
                  passPct="Top ??% World"
                  issued={`${String(new Date().getMonth() + 1).padStart(2, '0')} / ${new Date().getFullYear()}`}
                  refNo="AC-????"
                  description="Take the 40-second quiz to mint your member pass, see your AI Readiness Type, and where you rank among 8.1 billion people."
                />
              </Link>
            </div>
          </div>
        )}

        {/* ── DESKTOP (lg+) — the flipped two-column hero. ── */}
        <div className={`${desktopOneCol ? 'hidden' : 'hidden w-full max-w-6xl lg:grid lg:grid-cols-2'} gap-10 lg:gap-12 items-center`}>
          {/* Left column — the hook: the member pass the quiz mints for you.
              "YOUR NAME" placeholder makes the reward tangible at a glance.
              (Flipped to the left per owner request.) */}
          <div className="w-full max-w-[440px] mx-auto flex flex-col items-center">
            {/* The pass is the single most tapped thing on this page and it
                did nothing. Clarity counted 169 dead clicks in 14 days across
                1,365 landing sessions: a card that says YOUR NAME and STAGE:
                ????? reads as the thing to touch, and touching it went
                nowhere. It goes to the quiz now, same destination as the
                button under it. A person who wants to act should never have to
                find the right pixel. */}
            <Link href={quizHref} aria-label="take the quiz and mint your member pass" style={{ display: 'block', textDecoration: 'none' }}>
              <PassCard
                name="YOUR NAME"
                personaLabel="AI Professional"
                stageLine="STAGE: ?????"
                passPct="Top ??% World"
                issued={`${String(new Date().getMonth() + 1).padStart(2, '0')} / ${new Date().getFullYear()}`}
                refNo="AC-????"
                description="Take the 40-second quiz to mint your member pass, see your AI Readiness Type, and where you rank among 8.1 billion people."
              />
            </Link>

            {/* landing_cta_v1 · the button under the pass card.
                control  'share' — today's page, verbatim.
                variant  'quiz'  — the same slot, saying something a first-time
                                   visitor can actually act on, and tied to the
                                   blank pass directly above it. */}
            {secondaryCta === 'share' ? (
              <Link
                href={quizHref}
                className="mt-6 inline-flex items-center justify-center gap-2.5 rounded-full bg-[#0A66C2] hover:bg-[#004182] transition-colors"
                style={{ color: '#FFFFFF', padding: '12px 28px', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
                aria-label="Share on LinkedIn"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }} aria-hidden>
                  <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
                </svg>
                Share on LinkedIn
              </Link>
            ) : (
              <Link
                href={quizHref}
                className="mt-6 flex transition-transform hover:-translate-y-px active:scale-[0.98]"
                style={{ textDecoration: 'none' }}
                aria-label="mint my member pass"
              >
                <span
                  className="inline-flex items-center justify-center"
                  style={{ backgroundColor: INK, color: CREAM, fontWeight: 600, fontSize: 15, height: 48, padding: '0 24px' }}
                >
                  mint my member pass
                </span>
                <span
                  className="inline-flex items-center justify-center"
                  style={{ backgroundColor: FULVOUS, color: RICH, width: 48, height: 48, borderLeft: `2px solid ${RICH}`, fontWeight: 600, fontSize: 15 }}
                  aria-hidden
                >
                  ↗
                </span>
              </Link>
            )}
          </div>

          {/* Right column — the hero copy + CTA. */}
          <div className="text-center lg:text-left">
            <p className="uppercase mb-4" style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.05em', color: FULVOUS }}>
              The 40-second AI readiness quiz
            </p>
            {/* Clickable for the same reason as the two headlines above. */}
            <Link href={quizHref} aria-label="see where I rank" style={{ textDecoration: 'none', color: 'inherit', display: 'block', width: '100%' }}>
              <h1
                className="mb-4 sm:mb-5 font-bold"
                style={{ fontSize: 'clamp(32px, 4.4vw, 54px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}
              >
                Most people haven&apos;t started with AI.{' '}
                <span style={{ color: FULVOUS }}>Where do you rank?</span>
              </h1>
            </Link>
            <p
              className="mb-7 sm:mb-8 max-w-[540px] mx-auto lg:mx-0"
              style={{ fontSize: 'clamp(15px, 1.5vw, 18px)', fontWeight: 300, lineHeight: 1.5, color: '#4A4A4A' }}
            >
              Take the quiz to get your <strong style={{ color: INK, fontWeight: 600 }}>AI Readiness Type</strong> and
              see exactly where you land versus everyone else, then a plan to climb
            </p>

            {/* Block CTA — new-style two-piece button */}
            <Link
              href={quizHref}
              className="flex sm:inline-flex w-full sm:w-auto transition-transform hover:-translate-y-px active:scale-[0.98]"
              style={{ textDecoration: 'none' }}
            >
              <span
                className="flex-1 sm:flex-none inline-flex items-center justify-center"
                style={{ backgroundColor: INK, color: CREAM, fontWeight: 600, fontSize: 17, height: 54, padding: '0 26px' }}
              >
                see where I rank
              </span>
              <span
                className="inline-flex items-center justify-center"
                style={{ backgroundColor: FULVOUS, color: RICH, width: 54, height: 54, borderLeft: `2px solid ${RICH}`, fontWeight: 600, fontSize: 17 }}
                aria-hidden
              >
                ↗
              </span>
            </Link>
            <p className="mt-3" style={{ fontSize: 12.5, color: MUTE }}>
              {effortNote}
            </p>

            {/* Survey time + completions count — social-proof strip, hard-edge
                restyle. This is the live desktop layout (desktopOneCol is
                false for real traffic now that landing_desktop_v1 ended),
                so this is the copy that was actually eating the 41 dead
                clicks: the bordered pill reads as a button. Now one
                (2026-09-02). */}
            <Link
              href={quizHref}
              aria-label="take the quiz"
              className="mt-5 inline-flex items-center justify-center gap-3 sm:gap-4 px-4 py-2.5 font-mono transition-transform hover:-translate-y-px active:scale-[0.98]"
              style={{ backgroundColor: '#FFFFFF', border: `2px solid ${INK}`, fontSize: 10.5, letterSpacing: '0.08em', color: INK, textDecoration: 'none' }}
            >
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={FULVOUS} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
                ~40 SEC TO COMPLETE
              </span>
              <span aria-hidden style={{ color: '#C9C7BF' }}>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span style={{ color: '#62A758' }}>●</span>
                2,768 COMPLETED
              </span>
            </Link>
          </div>
        </div>
      </main>

      <FomoMarquee />
    </div>
  )
}
