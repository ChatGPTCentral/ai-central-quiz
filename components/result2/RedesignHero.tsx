import type { Offer } from '@/lib/offers'
import type { WindowState } from '@/lib/founding-window'
import FoundingCountdown from '@/components/result2/FoundingCountdown.client'
import {
  NAVY, NAVY_SOFT, RD_BODY, RD_MUTE, RD_CREAM, RD_FULVOUS, RD_FULVOUS_DEEP,
  RD_GREEN, RD_GREEN_BG, RD_LINE, RD_RADIUS, RED_URGENT,
} from '@/lib/redesign-tokens'

// result_page_v4 'redesign' arm — the hero for the "story first" structural
// candidate: reveal, then a real stage-journey device, then the real
// founding-window deadline (when one exists), THEN a scroll to the offer.
// Approved over ~6 mockup rounds this session; ported here with every
// illustrative number swapped for the real prop it corresponds to on this
// page (rt.aheadPct, rung.className, nextStage, offer.price/term, fw).
//
// The countdown box and the "unlocked" banner both render ONLY when the
// founding window is actually enabled and valid for this visitor — with it
// off (today's default), the hero still reads as a complete, honest page,
// it just has no countdown to show, because there is no real deadline to
// show one for. See lib/founding-window.ts.

function StageJourneyBar({
  rungClassName, aheadPct, nextLabel, nextAheadPct,
}: {
  rungClassName: string
  aheadPct: number
  nextLabel: string | null
  nextAheadPct: number | null
}) {
  const curPct = Math.max(4, Math.min(96, aheadPct))
  const nextPct = nextLabel ? Math.max(curPct + 6, Math.min(98, nextAheadPct ?? curPct + 15)) : null
  return (
    <div
      className="mt-7 mx-auto text-left"
      style={{ maxWidth: 480, background: '#FFFFFF', border: `1px solid ${RD_LINE}`, borderRadius: RD_RADIUS, padding: '20px 22px', boxShadow: '0 8px 24px -10px rgba(29,53,87,0.18)' }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: RD_MUTE, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Where you are{nextLabel ? ' → where this plan takes you' : ''}
      </div>
      <div className="relative mt-4">
        <div style={{ height: 6, background: RD_LINE, borderRadius: 999, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${curPct}%`, background: NAVY }} />
          {nextPct != null && (
            <div style={{ position: 'absolute', left: `${curPct}%`, top: 0, bottom: 0, width: `${nextPct - curPct}%`, background: RD_FULVOUS, opacity: 0.55 }} />
          )}
        </div>
        <div style={{ position: 'absolute', left: `${curPct}%`, top: -7, width: 20, height: 20, borderRadius: 999, background: NAVY, border: '3px solid #FFFDFA', transform: 'translateX(-10px)' }} />
        {nextPct != null && (
          <div style={{ position: 'absolute', left: `${nextPct}%`, top: -7, width: 20, height: 20, borderRadius: 999, background: RD_FULVOUS, border: '3px solid #FFFDFA', transform: 'translateX(-10px)' }} />
        )}
      </div>
      <div className="flex items-start justify-between mt-3" style={{ gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: NAVY }}>You: {rungClassName}</div>
          <div style={{ fontSize: 11, color: RD_MUTE, fontWeight: 600 }}>ahead of ~{aheadPct}%</div>
        </div>
        {nextLabel && (
          <div className="text-right">
            <div style={{ fontSize: 13, fontWeight: 800, color: RD_FULVOUS_DEEP }}>Next: {nextLabel}</div>
            <div style={{ fontSize: 11, color: RD_MUTE, fontWeight: 600 }}>what this plan builds toward</div>
          </div>
        )}
      </div>
    </div>
  )
}

export function RedesignHero({
  firstName, rungClassName, tagline, aheadPct, nextStage, offer, fw, windowNote,
}: {
  firstName: string
  rungClassName: string
  tagline: string
  aheadPct: number
  nextStage: { label: string; aheadPct: number } | null
  offer: Offer
  fw: WindowState | null
  windowNote: string | null
}) {
  // A held-rate arrival (recovery email) has no real countdown to show — the
  // rate is honored, not ticking. Only a genuine remaining window gets the
  // pulsing digits; see lib/founding-window.ts's own comment on this.
  const showCountdown = !!(fw && fw.enabled && fw.valid && !fw.held && fw.expiresAt)

  return (
    <section style={{ backgroundColor: RD_CREAM }}>
      <div className="max-w-[720px] mx-auto px-6 sm:px-10 pt-12 sm:pt-16 pb-4 text-center">

        {windowNote && (
          <div
            className="inline-flex items-center gap-2 mx-auto"
            style={{ background: RD_FULVOUS, borderRadius: 999, padding: '9px 18px', maxWidth: '100%' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
              <path d="M6 10V8a6 6 0 1112 0v2M5 10h14a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1z" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.35 }}>{windowNote}</span>
          </div>
        )}

        <div className="mt-4">
          <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: RD_FULVOUS_DEEP, fontWeight: 600 }}>
            Your AI Readiness Type
          </span>
          <h1 className="font-black" style={{ fontSize: 'clamp(38px, 6vw, 56px)', letterSpacing: '-0.03em', color: NAVY, margin: '10px 0 6px', lineHeight: 1.02 }}>
            {rungClassName}
          </h1>
          <p className="mx-auto" style={{ fontSize: 18, color: RD_BODY, fontWeight: 500, maxWidth: '38ch', lineHeight: 1.5 }}>
            {firstName ? `${firstName}, ` : ''}{tagline}
          </p>
        </div>

        <StageJourneyBar rungClassName={rungClassName} aheadPct={aheadPct} nextLabel={nextStage?.label ?? null} nextAheadPct={nextStage?.aheadPct ?? null} />

        {showCountdown && fw?.expiresAt && (
          <div
            className="mx-auto mt-7"
            style={{ maxWidth: 360, background: RED_URGENT, borderRadius: RD_RADIUS, padding: '18px 20px', border: '2px solid #FFFFFF' }}
          >
            <div className="flex items-center justify-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 9v4M12 17h.01M10.3 3.9L2.5 17a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="#FFD9DF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your founding rate ends in</span>
            </div>
            <div className="flex items-center justify-center mt-2.5">
              <FoundingCountdown expiresAt={fw.expiresAt} fontSize={28} />
            </div>
            <div style={{ fontSize: 10, color: '#FFD9DF', fontWeight: 700, marginTop: 8, letterSpacing: '0.02em' }}>
              hours&nbsp;&nbsp;&nbsp;&nbsp;minutes&nbsp;&nbsp;&nbsp;&nbsp;seconds
            </div>
          </div>
        )}

        <p className="mt-5" style={{ fontSize: 15, color: NAVY, fontWeight: 700 }}>
          {offer.price} {offer.term}. That&rsquo;s it.
        </p>

        <div className="mt-3">
          <a
            href="#offer"
            className="inline-flex items-center justify-center gap-2 w-full transition-transform hover:-translate-y-px"
            style={{ maxWidth: 340, background: RD_FULVOUS, color: '#FFFFFF', fontWeight: 800, fontSize: 16.5, height: 54, borderRadius: 999, textDecoration: 'none', boxShadow: '0 10px 24px -8px rgba(228,135,21,0.5)' }}
          >
            See what&rsquo;s included
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M7 17L17 7M9 7h8v8" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center" style={{ gap: '8px 16px' }}>
          <span style={{ fontSize: 12.5, color: NAVY_SOFT, fontWeight: 700 }}>2,500+ members since we started</span>
          <span style={{ width: 4, height: 4, borderRadius: 999, background: RD_MUTE }} />
          <span style={{ fontSize: 12.5, color: RD_MUTE, fontWeight: 600 }}>AI Central, 94,000+ weekly readers</span>
        </div>
      </div>
    </section>
  )
}

// This-is / not-yet honesty box. Cheap to build, and the whole redesign
// leans on the same "we say true things, including the unflattering ones"
// voice already established for RiskFree/OfferStack.
export function FitCheckSection() {
  return (
    <section style={{ backgroundColor: RD_CREAM }}>
      <div className="max-w-[720px] mx-auto px-6 sm:px-10 pb-10 sm:pb-12">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div style={{ background: RD_GREEN_BG, borderRadius: 14, padding: '18px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: RD_GREEN, textTransform: 'uppercase', letterSpacing: '0.06em' }}>This is for you if</div>
            <p style={{ fontSize: 13.5, color: NAVY_SOFT, lineHeight: 1.55, margin: '8px 0 0', fontWeight: 500 }}>
              You&rsquo;ve already used AI for real work at least once, and you want it to stop being a one-off.
            </p>
          </div>
          <div style={{ background: '#FFFFFF', border: `1px solid ${RD_LINE}`, borderRadius: 14, padding: '18px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: RD_FULVOUS_DEEP, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Not yet, if</div>
            <p style={{ fontSize: 13.5, color: NAVY_SOFT, lineHeight: 1.55, margin: '8px 0 0', fontWeight: 500 }}>
              You haven&rsquo;t opened an AI tool at work yet, start with the free basics first, then come back.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
