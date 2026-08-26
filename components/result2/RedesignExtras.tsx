import CheckoutLink from '@/components/CheckoutLink.client'
import type { Offer } from '@/lib/offers'
import type { WindowState } from '@/lib/founding-window'
import FoundingCountdown from '@/components/result2/FoundingCountdown.client'
import {
  NAVY, RD_BODY, RD_CREAM, RD_PAPER, RD_FULVOUS, RD_FULVOUS_DEEP,
  RD_GOLD, RD_LINE, RD_RADIUS,
} from '@/lib/redesign-tokens'

// Small, mostly-static sections for the result_page_v4 'redesign' arm. Kept
// out of RedesignHero.tsx and app/result/page.tsx so neither file balloons;
// none of these hold page logic, they only take the real values the page
// already computed (offer, fw, rungClassName, checkoutUrl…) as props.

const STEP_NUM: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 30, height: 30, borderRadius: 999, background: NAVY, color: '#FFFFFF',
  fontSize: 13, fontWeight: 800, flexShrink: 0,
}

/** The bridge line + either the real answer-echo pitch or the real cost-of-gap
 *  line, whichever the caller already resolved — never a fabricated dollar
 *  figure. Both are the SAME data the default page already computes. */
export function AgitationSection({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ backgroundColor: RD_CREAM }}>
      <div className="max-w-[720px] mx-auto px-6 sm:px-10 pb-2">
        <p className="text-center mx-auto" style={{ fontSize: 17, color: NAVY, fontWeight: 700, lineHeight: 1.55, maxWidth: '42ch', margin: '10px auto 0' }}>
          You know the feeling: AI worked once, on one task, and then the moment passed and the old way took back over.
        </p>
        <div className="mt-5">{children}</div>
      </div>
    </section>
  )
}

export function HowItGoesSection({ rungClassName }: { rungClassName: string }) {
  const steps = [
    { t: 'Your plan opens tonight', d: `Sequenced from your own answers, not a generic curriculum, the ${rungClassName} path, starting where you actually are.` },
    { t: 'You do one real task, start to finish', d: 'Not a demo. The first tutorial uses a real task you already have, with the exact prompts and screenshots.' },
    { t: 'It becomes routine, one week at a time', d: 'Weeks 2 through 4 build on week 1. New tutorials land every week after that, so the library keeps up with the tools.' },
    { t: 'You keep what you built', d: 'The workflows, prompts and templates you use are yours, saved to your own account, not locked behind a login you’ll lose.' },
  ]
  return (
    <section style={{ backgroundColor: RD_CREAM }}>
      <div className="max-w-[720px] mx-auto px-6 sm:px-10 pt-10 sm:pt-12 pb-2">
        <div className="text-center">
          <span className="font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.14em', color: RD_FULVOUS_DEEP, fontWeight: 700 }}>How tonight actually goes</span>
          <h2 className="font-bold" style={{ fontSize: 'clamp(22px, 2.8vw, 26px)', color: NAVY, margin: '8px 0 0' }}>Four steps, not four weeks of theory</h2>
        </div>
        <div className="flex flex-col mt-6" style={{ gap: 16 }}>
          {steps.map((s, i) => (
            <div key={s.t} className="flex items-start" style={{ gap: 14 }}>
              <span style={STEP_NUM}>{i + 1}</span>
              <div>
                <span className="block" style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{s.t}</span>
                <span className="block mt-0.5" style={{ fontSize: 13.5, color: RD_BODY, lineHeight: 1.5 }}>{s.d}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function MechanismSection() {
  return (
    <section style={{ backgroundColor: RD_CREAM }}>
      <div className="max-w-[720px] mx-auto px-6 sm:px-10 pt-8 sm:pt-10 pb-2">
        <div style={{ padding: '22px 24px', background: NAVY, borderRadius: RD_RADIUS }}>
          <span className="font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.14em', color: RD_GOLD, fontWeight: 700 }}>Why this closes it</span>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#E4EAF3', margin: '10px 0 0', fontWeight: 500 }}>
            Reading about AI does not change how you work. Doing one real task, start to finish, does. Every tutorial in
            the library is built the same way: your actual task, the exact prompts, the screenshots, not a demo.
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: '#B9C6DB', margin: '12px 0 0', fontWeight: 500 }}>
            It is not a course you finish once. It is the platform you keep open, the same one you are on right now,
            still working for you next month and the month after.
          </p>
        </div>
      </div>
    </section>
  )
}

// Three real, existing guides the owner named this session, bundled in as a
// no-extra-cost cross-sell rather than the transactional "unlock instantly"
// framing the offer stack already carries. Not links: these are things the
// buyer gets AFTER paying, not a reason to leave the checkout page now.
const BUNDLES = [
  { name: 'The Ultimate ChatGPT Prompts Bundle', value: '$249' },
  { name: 'Master Claude Cowork, the Full Guide', value: '$199' },
  { name: 'The Ultimate Presentation Guide', value: '$149' },
]

export function BundleCrossSell({ nextStageLabel }: { nextStageLabel: string | null }) {
  return (
    <div style={{ background: NAVY, borderRadius: RD_RADIUS, padding: '22px 22px' }}>
      <div className="text-center">
        <div className="font-mono uppercase" style={{ fontSize: 11, fontWeight: 700, color: RD_GOLD, letterSpacing: '0.06em' }}>
          {nextStageLabel ? `You're this close to ${nextStageLabel}` : 'You are this close'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', marginTop: 4 }}>Unlock the unfair advantage inside</div>
      </div>
      <div className="flex flex-col mt-3.5" style={{ gap: 8 }}>
        {BUNDLES.map(b => (
          <div key={b.name} className="flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 16px', gap: 10 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#FFFFFF' }}>{b.name}</span>
            <span className="whitespace-nowrap" style={{ fontSize: 11.5, fontWeight: 700, color: RD_GOLD }}>
              <s style={{ opacity: 0.65 }}>{b.value}</s> included
            </span>
          </div>
        ))}
      </div>
      <p className="text-center" style={{ margin: '12px 0 0', fontSize: 10.5, color: '#B9C6DB', lineHeight: 1.5 }}>
        Three real, existing guides from docs.thecentral.ai, bundled in at no extra cost.
      </p>
    </div>
  )
}

export function FinalUrgencyClose({
  offer, fw, checkoutUrl, submissionId, ctaLabel,
}: {
  offer: Offer
  fw: WindowState | null
  checkoutUrl: string
  submissionId?: string
  ctaLabel: string
}) {
  // No real deadline, no closing countdown: this section exists only to
  // restate a genuine one, never to manufacture urgency where none exists.
  if (!fw || !fw.enabled || !fw.valid || fw.held || !fw.expiresAt) return null
  return (
    <section style={{ backgroundColor: RD_PAPER, borderTop: `1px solid ${RD_LINE}` }}>
      <div className="max-w-[720px] mx-auto px-6 sm:px-10 py-12 sm:py-14 text-center">
        <div style={{ background: NAVY, borderRadius: RD_RADIUS, padding: '30px 26px' }}>
          <div className="font-mono uppercase" style={{ fontSize: 12, fontWeight: 700, color: RD_GOLD, letterSpacing: '0.08em' }}>
            Your founding rate ends in
          </div>
          <div className="flex items-center justify-center mt-2.5">
            <FoundingCountdown expiresAt={fw.expiresAt} fontSize={26} />
          </div>
          <p className="mx-auto" style={{ fontSize: 15.5, color: '#E4EAF3', fontWeight: 600, margin: '14px auto 0', maxWidth: '40ch', lineHeight: 1.5 }}>
            After that, {offer.price} becomes ${(fw.listCents / 100).toFixed(2)}. Nothing else about the offer changes.
          </p>
          <div className="mt-5">
            <CheckoutLink
              href={checkoutUrl}
              placement="v2_redesign_final_close"
              submissionId={submissionId}
              className="inline-flex items-center justify-center gap-2 w-full transition-transform hover:-translate-y-px"
              style={{ maxWidth: 340, background: RD_FULVOUS, color: '#FFFFFF', fontWeight: 800, fontSize: 16.5, height: 54, borderRadius: 999, textDecoration: 'none' }}
            >
              {ctaLabel}
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M7 17L17 7M9 7h8v8" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </CheckoutLink>
          </div>
        </div>
      </div>
    </section>
  )
}
