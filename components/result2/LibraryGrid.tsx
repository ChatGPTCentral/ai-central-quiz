import CheckoutLink from '@/components/CheckoutLink.client'

// "Show, don't tell" — real covers from the library, grouped by category, so
// people can find THEIR use case rather than reading the number 1,200 and
// imagining nothing. Explicitly framed as a SAMPLE: claiming this grid is the
// library would be a lie people discover 30 seconds after paying.
//
// Covers come from the publisher's CDN, keyed by the same qf codes as the study
// plan and the starter kit, so nothing new has to be hosted.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'

interface Doc { qf: string; title: string }
interface Section { name: string; blurb: string; docs: Doc[] }

const SECTIONS: Section[] = [
  {
    name: 'Setup & foundations',
    blurb: 'Get your workspace right once, benefit every day after',
    docs: [
      { qf: 'w_aice27', title: 'Claude Setup Guide: Make Claude 10x Smarter in 5 Steps' },
      { qf: 'w_chau290', title: 'The Complete ChatGPT Mastery Guide for AI Productivity' },
      { qf: 'w_aice25', title: '13 Free Courses from Anthropic: Claude & AI Fluency' },
    ],
  },
  {
    name: 'Prompting that works',
    blurb: 'Write instructions AI cannot misread',
    docs: [
      { qf: 'w_chau288', title: 'Official GPT-5.2 Prompting Guide From OpenAI' },
      { qf: 'w_chau185', title: 'Copywriting Prompts with ChatGPT: Better Copy, Faster' },
      { qf: 'w_chau136', title: 'How To Instantly Create Stunning Presentations With AI' },
    ],
  },
  {
    name: 'Automation & agents',
    blurb: 'Where AI stops helping and starts doing the work',
    docs: [
      { qf: 'w_aice24', title: 'How to Set Up Claude Cowork in 8 Steps: Chaos to Mastery' },
      { qf: 'w_aice33', title: 'Learn 80% of Any Skill in One Week Using NotebookLM' },
      { qf: 'w_defa10445', title: 'The Complete Free AI Learning Library' },
    ],
  },
  {
    name: 'For your job',
    blurb: 'Client-grade output, by role',
    docs: [
      { qf: 'w_chau287', title: '10 ChatGPT Prompts for Consultants Using AI' },
    ],
  },
]

const cover = (qf: string) => `https://img.tradepub.com/free/${qf}/images/${qf}c4.gif`

function DocTile({ d, checkoutUrl, submissionId }: { d: Doc; checkoutUrl: string; submissionId?: string }) {
  return (
    <CheckoutLink
      href={checkoutUrl}
      placement="v2_library_grid"
      submissionId={submissionId}
      className="group flex flex-col transition-transform hover:-translate-y-0.5"
      style={{ textDecoration: 'none', border: `2px solid ${INK}`, backgroundColor: '#FFFFFF' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover(d.qf)}
        alt=""
        referrerPolicy="no-referrer"
        style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderBottom: `2px solid ${INK}`, display: 'block', backgroundColor: CREAM }}
      />
      <span
        className="block"
        style={{
          padding: '9px 10px 10px', fontSize: 11.5, fontWeight: 700, lineHeight: 1.3, color: RICH,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {d.title}
      </span>
    </CheckoutLink>
  )
}

export function LibraryGrid({ checkoutUrl, submissionId }: { checkoutUrl: string; submissionId?: string }) {
  return (
    <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: '#FFFDFA' }} aria-label="Inside the library">
      <div className="max-w-[960px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
        <div className="text-center">
          <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}>
            Inside the library
          </span>
          <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
            Tutorials you won&rsquo;t find anywhere else
          </h2>
          <p className="mt-3 mx-auto max-w-[600px]" style={{ fontWeight: 300, fontSize: 16.5, lineHeight: 1.5, color: BODY }}>
            Written and tested in-house, not scraped from the internet. Every one is step by step, with a
            screenshot at each stage, for professionals rather than developers.
          </p>
          <p className="mt-3 font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: '0.12em', color: MUTE, fontWeight: 700 }}>
            A sample &middot; the full library holds 1,200+ tutorials and 50+ templates
          </p>
        </div>

        {SECTIONS.map(s => (
          <div key={s.name} style={{ marginTop: 30 }}>
            <div className="flex items-baseline flex-wrap" style={{ gap: 10, borderBottom: `2px solid ${INK}`, paddingBottom: 7 }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: RICH, letterSpacing: '-0.01em' }}>{s.name}</span>
              <span style={{ fontSize: 12, color: BODY, fontWeight: 300 }}>{s.blurb}</span>
            </div>
            <div className="grid mt-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 14 }}>
              {s.docs.map(d => <DocTile key={d.qf} d={d} checkoutUrl={checkoutUrl} submissionId={submissionId} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
