// Share landing for the member pass. This is the URL people post on
// LinkedIn / X / WhatsApp — its Open Graph tags point at the dynamic
// pass image, so the share unfurls as the person's actual card. Humans
// who click through see the pass + a CTA into the quiz.

import type { Metadata } from 'next'
import TrackView from '@/components/TrackView'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://quiz.thecentral.ai'

const INK = '#333333'
const RICH = '#1A1A1A'
const CREAM = '#FEF7E7'
const PAPER = '#FFFDFA'
const FULVOUS = '#E48715'

type Search = Record<string, string | undefined>

function passImageUrl(sp: Search): string {
  const p = new URLSearchParams()
  // 'style' + 'photo' are the v2 ID-card variant params — absent on v1
  // share links, so their unfurls are unchanged.
  for (const k of ['name', 'stage', 'profile', 'pct', 'issued', 'ref', 'desc', 'style', 'photo']) {
    if (sp[k]) p.set(k, sp[k]!)
  }
  return `${SITE}/api/pass-image?${p.toString()}`
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const pct = (searchParams.pct || '').replace(/[^0-9.]/g, '')
  const name = searchParams.name?.trim().split(/\s+/)[0]
  const title = pct
    ? `${name ? `${name} is` : "I'm"} in the top ${pct}% of AI users worldwide`
    : 'Where do you rank in AI adoption?'
  const description = 'Take the 40-second quiz to get your AI Readiness Type, your member pass, and your place among 8.1 billion people.'
  const img = passImageUrl(searchParams)
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'AI Central',
      images: [{ url: img, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [img],
    },
  }
}

export default function PassSharePage({ searchParams }: { searchParams: Search }) {
  const img = passImageUrl(searchParams)
  const pct = (searchParams.pct || '').replace(/[^0-9.]/g, '')
  // Viral-loop attribution: takers arriving from a shared card carry
  // utm_source=pass_share (+ the sharer's ref) into the quiz, so they stop
  // landing in "Direct / unknown" and K-factor becomes measurable.
  const sharerRef = (searchParams.ref || '').slice(0, 40)
  const quizHref = `/quiz-v2?utm_source=pass_share${sharerRef ? `&utm_ref=${encodeURIComponent(sharerRef)}` : ''}`

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ backgroundColor: PAPER }}>
      <TrackView event="pass_view" props={{ ref: sharerRef || null, pct: pct || null }} />
      {/* Dark top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6" style={{ backgroundColor: INK, height: 46 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full-dark-bg.png" alt="AI Central" style={{ height: 18, width: 'auto', display: 'block' }} />
        <span className="font-mono" style={{ fontSize: 10.5, letterSpacing: '0.1em', color: '#E7B02F' }}>
          2,768 COMPLETED · FREE
        </span>
      </div>

      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[720px] text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img}
            alt="AI Central member pass"
            style={{ display: 'block', width: '100%', height: 'auto', border: `3px solid ${RICH}` }}
          />
          <h1
            className="mt-8 font-bold"
            style={{ fontSize: 'clamp(26px, 3.6vw, 40px)', lineHeight: 1.05, letterSpacing: '-0.035em', color: RICH }}
          >
            {pct ? (
              <>This pass puts them in the <span style={{ color: FULVOUS }}>top {pct}%</span> of AI users worldwide</>
            ) : (
              <>Where do <span style={{ color: FULVOUS }}>you</span> rank in AI adoption?</>
            )}
          </h1>
          <p className="mt-3" style={{ fontSize: 15.5, fontWeight: 300, lineHeight: 1.5, color: '#4A4A4A' }}>
            10 questions, 40 seconds. Get your AI Readiness Type, your member pass, and your place
            among 8.1 billion people
          </p>
          <a href={quizHref} className="mt-7 inline-flex transition-transform hover:-translate-y-px active:scale-[0.98]" style={{ textDecoration: 'none' }}>
            <span className="inline-flex items-center justify-center" style={{ backgroundColor: INK, color: CREAM, fontWeight: 600, fontSize: 17, height: 54, padding: '0 26px' }}>
              discover your ranking
            </span>
            <span className="inline-flex items-center justify-center" style={{ backgroundColor: FULVOUS, color: RICH, width: 54, height: 54, borderLeft: `2px solid ${RICH}`, fontWeight: 600, fontSize: 17 }} aria-hidden>
              ↗
            </span>
          </a>
          <p className="mt-3" style={{ fontSize: 12.5, color: '#666666' }}>free, no card, 40 seconds</p>
        </div>
      </main>
    </div>
  )
}
