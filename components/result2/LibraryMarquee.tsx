import CheckoutLink from '@/components/CheckoutLink.client'

// "Show, don't tell" — a scrolling wall of REAL covers from the library, the
// same treatment as the Senja reviews marquee. The offer stack says "1,200+
// tutorials"; a number is abstract, a wall of covers is not. Every card checks
// out (placement v2_library_marquee).
//
// Covers come from the publisher's own CDN, keyed by the same qf codes used by
// the study plan and the starter kit, so nothing new has to be hosted.

const INK = '#333333'
const RICH = '#1A1A1A'
const CREAM = '#FEF7E7'

interface Doc { qf: string; title: string }

// A spread across the library: setup, prompting, automation, agents, analysis.
const DOCS: Doc[] = [
  { qf: 'w_aice27', title: 'Claude Setup Guide: 10x in 5 Steps' },
  { qf: 'w_chau288', title: 'Official GPT-5.2 Prompting Guide' },
  { qf: 'w_aice24', title: 'Claude Cowork: Chaos to Mastery' },
  { qf: 'w_chau136', title: 'Stunning Presentations With AI' },
  { qf: 'w_chau185', title: 'Copywriting Prompts With ChatGPT' },
  { qf: 'w_aice33', title: 'Learn 80% of Any Skill With NotebookLM' },
  { qf: 'w_chau287', title: '10 ChatGPT Prompts for Consultants' },
  { qf: 'w_aice25', title: '13 Free Courses From Anthropic' },
  { qf: 'w_chau290', title: 'Complete ChatGPT Mastery Guide' },
  { qf: 'w_defa10445', title: 'The Complete AI Learning Library' },
]

const cover = (qf: string) => `https://img.tradepub.com/free/${qf}/images/${qf}c4.gif`

function DocCard({ d }: { d: Doc }) {
  return (
    <span className="inline-flex flex-col" style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', width: 150, flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover(d.qf)}
        alt=""
        referrerPolicy="no-referrer"
        style={{ width: '100%', height: 190, objectFit: 'cover', borderBottom: `2px solid ${INK}`, display: 'block', backgroundColor: CREAM }}
      />
      <span
        className="block"
        style={{
          padding: '8px 9px 9px', fontSize: 11, fontWeight: 700, lineHeight: 1.3, color: RICH,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {d.title}
      </span>
    </span>
  )
}

export function LibraryMarquee({ checkoutUrl, submissionId }: { checkoutUrl: string; submissionId?: string }) {
  const half = (dup: string) => (
    <div className="flex items-stretch" aria-hidden={dup === 'b'} style={{ gap: 12 }}>
      {DOCS.map((d, i) => (
        <CheckoutLink
          key={`${dup}${i}`}
          href={checkoutUrl}
          placement="v2_library_marquee"
          submissionId={submissionId}
          className="inline-flex"
          style={{ textDecoration: 'none' }}
        >
          <DocCard d={d} />
        </CheckoutLink>
      ))}
    </div>
  )

  return (
    <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: '#FFFDFA', overflow: 'hidden' }} aria-label="Inside the library">
      <div className="max-w-[880px] mx-auto px-6 sm:px-10 pt-12 sm:pt-14 pb-6 text-center">
        <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: '#E48715', fontWeight: 600 }}>
          Inside the library
        </span>
        <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
          This is what you get
        </h2>
        <p className="mt-3 mx-auto max-w-[560px]" style={{ fontWeight: 300, fontSize: 16, lineHeight: 1.5, color: '#4A4A4A' }}>
          A few of the 1,200+ tutorials and 50+ templates. Every one is step by step, written for
          professionals, no code required.
        </p>
      </div>
      <div className="ac-libmarq flex" style={{ width: 'max-content', padding: '4px 0 22px', gap: 12 }}>
        {half('a')}
        {half('b')}
      </div>
      <style>{`
        .ac-libmarq { animation: ac-libmarq-scroll 64s linear infinite; will-change: transform }
        .ac-libmarq:hover { animation-play-state: paused }
        @keyframes ac-libmarq-scroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @media (prefers-reduced-motion: reduce) { .ac-libmarq { animation: none } }
      `}</style>
    </section>
  )
}
