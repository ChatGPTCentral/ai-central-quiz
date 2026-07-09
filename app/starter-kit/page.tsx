import TrackView from '@/components/TrackView'
import TrackedLink from '@/components/TrackedLink.client'

// ── The AI Central Starter Kit ───────────────────────────────────────
// Secondary offer for result-page visitors who do NOT convert on the
// Ultimate AI Library: a free taste of the library (the 10 most downloaded
// tutorials of 2026, by real NetLine download data), delivered as direct
// TradePub downloads + the Google Drive folder. Soft-sells the full
// library as the upgrade path.
//
// Copy rules honored throughout: "- -" instead of em dashes, no terminal
// periods on headings/display copy, short "you"-directed sentences.

export const metadata = {
  title: 'Take 10 Tutorials, Free - - AI Central',
  description:
    'The 10 most downloaded AI tutorials of 2026, free. A taste of the Ultimate AI Library trusted by 300,000+ senior professionals',
}

const DRIVE_URL = 'https://drive.google.com/drive/folders/1DXN9faBYd_j_975fchaX4DjicgM90jDX'
const UPGRADE_URL = 'https://thecentral.ai/upgrade'

// Ordering = download count, highest first. Cover pattern:
// https://img.tradepub.com/free/{qf}/images/{qf}c4.gif
const KIT: { qf: string; title: string; desc: string; link: string }[] = [
  {
    qf: 'w_chau136',
    title: 'How To Instantly Create Stunning Presentations With AI',
    desc: 'Client-ready presentations in under 5 minutes, without ever opening PowerPoint',
    link: 'https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=oc&_t=oc:&qf=w_chau136',
  },
  {
    qf: 'w_chau185',
    title: 'Copywriting Prompts with ChatGPT: Create Better Copy, Faster',
    desc: 'A universal copywriting template plus 9 proven styles and 5 tone options',
    link: 'https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=oc&_t=oc:&qf=w_chau185',
  },
  {
    qf: 'w_aice27',
    title: 'Claude Setup Guide: Make Claude 10x Smarter in 5 Steps',
    desc: 'Teach Claude your processes with Skills, Cowork and Plugins - - stop repeating yourself every session',
    link: 'https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=pp&_t=pp:&qf=w_aice27&ch=',
  },
  {
    qf: 'w_aice33',
    title: 'How to Learn 80 Percent of Any Skill in One Week Using NotebookLM',
    desc: 'Build an AI brain trained on expert content - - AI podcasts, flashcards and structured reports included',
    link: 'https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=pp&_t=pp:&qf=w_aice33&ch=',
  },
  {
    qf: 'w_chau288',
    title: 'Official GPT-5.2 Prompting Guide From OpenAI',
    desc: "OpenAI's own guide - - reduce hallucinations, enforce structured outputs, manage agent workflows",
    link: 'https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=pp&_t=pp:&qf=w_chau288&ch=',
  },
  {
    qf: 'w_aice24',
    title: 'How to Set Up Claude Cowork in 8 Steps: From Chaos to Mastery',
    desc: 'Folder structure, context files, instructions and plugins that turn copy-paste chaos into a system',
    link: 'https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=pp&_t=pp:&qf=w_aice24&ch=',
  },
  {
    qf: 'w_aice25',
    title: '13 Free Courses from Anthropic: Complete Claude & AI Fluency Training',
    desc: 'Every free course in Anthropic Academy, mapped from beginner to advanced',
    link: 'https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=pp&_t=pp:&qf=w_aice25&ch=',
  },
  {
    qf: 'w_defa10445',
    title: 'The Complete Free AI Learning Library: Master ChatGPT, Claude, Gemini & More',
    desc: 'The best free AI tutorials, tools and training libraries of 2026 across 8 major platforms',
    link: 'https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=pp&_t=pp:&qf=w_defa10445&ch=',
  },
  {
    qf: 'w_chau287',
    title: '10 ChatGPT Prompts for Consultants Using AI',
    desc: 'AI in 10 core consulting workflows - - market research, financial models, SWOT, Porter’s Five Forces',
    link: 'https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=pp&_t=pp:&qf=w_chau287',
  },
  {
    qf: 'w_chau290',
    title: 'The Complete ChatGPT Mastery Guide for AI Productivity',
    desc: 'Prompt templates, the Ultimate Prompt Framework and built-in tools like Agent Mode and Deep Research',
    link: 'https://gptcentral.tradepub.com/c/pubRD.mpl?secure=1&sr=pp&_t=pp:&qf=w_chau290',
  },
]

// Pulled from the Starter Kit Google Doc ("What our readers say")
const TESTIMONIALS = [
  {
    name: 'Ahmad Ibrahim Ahmad',
    role: 'Head Capital Projects',
    text: 'I now spend less time at my desk and do more with my free time. I set Claude agents to do most of the routine jobs while I handle the complex engagements that demand my presence',
  },
  {
    name: 'Bruce Glase',
    role: 'Creative Director',
    text: 'I have implemented multiple projects in Claude and ChatGPT using the guides provided on a daily basis. Helpful in time-saving and research on topics I would not typically follow',
  },
  {
    name: 'Ghufran Maniar',
    role: 'IT & Digital Marketing Consultant',
    text: 'AI Central is the gate to AI knowledge city. It helps me as an AI consultant and content strategist. The work became fast and easy',
  },
  {
    name: 'Ashi Malik',
    role: 'Product @ Apple',
    text: 'This is helpful, especially for getting past the blank slate problem',
  },
]

const UPGRADE_BULLETS = [
  '1,200+ practical implementations - - real case studies with templates, prompts and step-by-step guides',
  '500+ tested templates and examples, beginner-friendly',
  'Organized categories: Marketing, Content Creation, Business, Software Development, Education',
  'Advanced search and filtering, weekly updates, permanent access',
  'A community of professionals rooting for your success',
]

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const PAPER = '#FFFDFA'
const AZUL = '#046BB1'
const XANTHOUS = '#E7B02F'
const FULVOUS = '#E48715'

// Diagonal blue/gold accent line (brand rule)
const DIAGONAL = {
  height: 6,
  backgroundImage: `repeating-linear-gradient(-45deg, ${AZUL} 0 14px, ${XANTHOUS} 14px 28px)`,
}

function KitButton({ href, label, event, props, gold = false }: { href: string; label: string; event: string; props?: Record<string, unknown>; gold?: boolean }) {
  return (
    <TrackedLink
      href={href}
      event={event}
      props={props}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]"
      style={{ textDecoration: 'none' }}
    >
      <span className="inline-flex items-center" style={{ backgroundColor: gold ? XANTHOUS : INK, color: gold ? RICH : '#FEF7E7', fontWeight: 600, fontSize: 16, padding: '16px 24px' }}>
        {label}
      </span>
      <span className="inline-flex items-center justify-center" style={{ backgroundColor: gold ? '#FEF7E7' : FULVOUS, color: RICH, padding: 16, borderLeft: `2px solid ${RICH}`, fontWeight: 600, fontSize: 16 }} aria-hidden>
        ↗
      </span>
    </TrackedLink>
  )
}

export default function StarterKitPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK }}>
      <TrackView event="starter_kit_view" />

      {/* ── Header bar ── */}
      <header className="flex items-center justify-between px-4 sm:px-6" style={{ backgroundColor: INK, height: 56 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-dark-bg.png" alt="AI Central" style={{ height: 20, width: 'auto', display: 'block' }} />
        <span className="hidden sm:inline font-mono" style={{ fontSize: 11, letterSpacing: '0.12em', color: '#FEF7E7', opacity: 0.65 }}>
          FREE STARTER KIT
        </span>
      </header>
      <div style={DIAGONAL} aria-hidden />

      {/* ── 1 · Hero ── */}
      <section className="max-w-[1100px] mx-auto px-6 sm:px-10 pt-14 sm:pt-20 pb-12 text-center">
        <p className="font-mono" style={{ fontSize: 11, letterSpacing: '0.18em', color: FULVOUS, fontWeight: 700 }}>
          THE AI CENTRAL STARTER KIT - - NO EMAIL, NO CARD
        </p>
        <h1 className="mt-4 font-bold" style={{ fontSize: 'clamp(36px, 5.4vw, 62px)', lineHeight: 0.98, letterSpacing: '-0.045em', color: RICH }}>
          Take 10 tutorials, free
        </h1>
        <p className="mt-5 mx-auto max-w-[640px]" style={{ fontWeight: 300, fontSize: 'clamp(17px, 2vw, 21px)', lineHeight: 1.45, color: BODY }}>
          The 10 most downloaded AI tutorials of 2026 - - selected by real download
          data from 300,000+ senior professionals. Complete, step-by-step PDFs you
          can put to work today
        </p>
        <div className="mt-8 flex justify-center">
          <KitButton href={DRIVE_URL} label="Get the free kit" event="starter_kit_click" props={{ item: 'drive_folder', placement: 'hero' }} />
        </div>
        <p className="mt-3" style={{ fontSize: 13, color: MUTE }}>
          One folder, all 10 guides - - or pick them one by one below
        </p>
      </section>

      {/* ── 2 · What's inside ── */}
      <section style={{ borderTop: `3px solid ${INK}` }}>
        <div className="max-w-[1100px] mx-auto px-6 sm:px-10 py-14">
          <p className="font-mono" style={{ fontSize: 11, letterSpacing: '0.18em', color: MUTE, fontWeight: 700 }}>WHAT&apos;S INSIDE</p>
          <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', lineHeight: 1.0, letterSpacing: '-0.04em', color: RICH }}>
            Ten tutorials, ranked by real downloads
          </h2>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {KIT.map((k, i) => (
              <div key={k.qf} className="flex flex-col" style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF' }}>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://img.tradepub.com/free/${k.qf}/images/${k.qf}c4.gif`} alt={k.title} style={{ display: 'block', width: '100%', height: 'auto' }} />
                  <span className="absolute top-2 left-2 font-mono font-bold" style={{ backgroundColor: INK, color: XANTHOUS, fontSize: 11, padding: '3px 8px' }}>
                    #{i + 1}
                  </span>
                </div>
                <div className="flex flex-col flex-1 p-3.5">
                  <h3 className="font-bold" style={{ fontSize: 13.5, lineHeight: 1.3, color: RICH }}>{k.title}</h3>
                  <p className="mt-1.5 flex-1" style={{ fontSize: 12, lineHeight: 1.45, color: BODY }}>{k.desc}</p>
                  <TrackedLink
                    href={k.link}
                    event="starter_kit_click"
                    props={{ item: k.qf, placement: 'grid' }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block font-bold underline underline-offset-2 hover:text-[#E48715] transition-colors"
                    style={{ fontSize: 12.5, color: AZUL }}
                  >
                    Download free ↗
                  </TrackedLink>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 flex justify-center">
            <KitButton href={DRIVE_URL} label="Get all 10 in one folder" event="starter_kit_click" props={{ item: 'drive_folder', placement: 'grid_footer' }} />
          </div>
        </div>
      </section>

      {/* ── 3 · Social proof ── */}
      <section style={{ backgroundColor: '#FEF7E7', borderTop: `3px solid ${INK}` }}>
        <div className="max-w-[1100px] mx-auto px-6 sm:px-10 py-14">
          <p className="text-center font-mono" style={{ fontSize: 11, letterSpacing: '0.18em', color: MUTE, fontWeight: 700 }}>WHAT READERS SAY</p>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
            {TESTIMONIALS.map(t => (
              <figure key={t.name} className="p-5" style={{ backgroundColor: PAPER, borderLeft: `4px solid ${XANTHOUS}` }}>
                <blockquote style={{ fontSize: 14.5, lineHeight: 1.55, color: BODY }}>&ldquo;{t.text}&rdquo;</blockquote>
                <figcaption className="mt-3 font-bold" style={{ fontSize: 13, color: RICH }}>
                  {t.name} <span className="font-normal" style={{ color: MUTE }}>- - {t.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4 · Upgrade ── */}
      <section style={{ backgroundColor: INK, borderTop: `3px solid ${RICH}` }}>
        <div className="max-w-[900px] mx-auto px-6 sm:px-10 py-16 text-center">
          <p className="font-mono" style={{ fontSize: 11, letterSpacing: '0.18em', color: XANTHOUS, fontWeight: 700 }}>THE FULL LIBRARY</p>
          <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', lineHeight: 1.0, letterSpacing: '-0.04em', color: '#FEF7E7' }}>
            This kit is the trailer. The library is the full movie
          </h2>
          <p className="mt-4 mx-auto max-w-[560px]" style={{ fontWeight: 300, fontSize: 16, lineHeight: 1.5, color: '#FEF7E7', opacity: 0.75 }}>
            The Ultimate AI Library is the web platform behind these tutorials - -
            1,200+ curated AI &amp; ChatGPT guides, already bought by 2,500+ professionals
          </p>
          <ul className="mt-8 mx-auto max-w-[640px] text-left flex flex-col gap-2.5">
            {UPGRADE_BULLETS.map(b => (
              <li key={b} className="flex items-start gap-3" style={{ fontSize: 14.5, lineHeight: 1.5, color: '#FEF7E7', opacity: 0.9 }}>
                <span style={{ color: XANTHOUS, fontWeight: 700 }} aria-hidden>✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-9 flex justify-center">
            <KitButton href={UPGRADE_URL} label="Unlock the Ultimate AI Library" event="starter_kit_click" props={{ item: 'upgrade', placement: 'upsell' }} gold />
          </div>
          <p className="mt-4" style={{ fontSize: 13, color: '#FEF7E7', opacity: 0.6 }}>
            30-day money-back guarantee, no questions asked
          </p>
        </div>
      </section>

      {/* ── 5 · Footer ── */}
      <div style={DIAGONAL} aria-hidden />
      <footer className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-6" style={{ backgroundColor: RICH }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-dark-bg.png" alt="AI Central" style={{ height: 18, width: 'auto', display: 'block' }} />
        <p className="font-mono" style={{ fontSize: 11, letterSpacing: '0.1em', color: '#FEF7E7', opacity: 0.55 }}>
          AI CENTRAL - - PRACTICAL AI FOR SENIOR PROFESSIONALS
        </p>
      </footer>
    </main>
  )
}
