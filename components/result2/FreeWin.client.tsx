'use client'

import { useEffect, useRef, useState } from 'react'
import { sendEvent } from '@/lib/events-client'
import { firePlacementView } from '@/components/CheckoutLink.client'
import type { FreeWin } from '@/lib/free-win'

// The free win — a real, usable thing given BEFORE the ask. Reciprocity is the
// strongest lever we have and the page had none: it asked for $4.99 having
// delivered only a score.
//
// Two arms (experiment `free_win_v1`):
//   'prompt'   — a paste-ready prompt built from THEIR quiz answers. Unique to
//                them, works in 10 seconds, proves the library's promise.
//   'tutorial' — the first tutorial from their study plan, actually unlocked.
//                Real library content, proves quality but is not personal.
// Both close the same way: this is 1 of 1,200, the rest are $4.99.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const GREEN = '#2D6A26'

export interface TutorialWin {
  qf: string
  title: string
  desc: string
  link: string
}

export default function FreeWinCard({
  variant, win, tutorial, submissionId,
}: {
  variant: 'prompt' | 'tutorial'
  win: FreeWin
  tutorial: TutorialWin
  submissionId?: string
}) {
  const [copied, setCopied] = useState(false)
  const seen = useRef(false)

  useEffect(() => {
    if (seen.current) return
    seen.current = true
    sendEvent('free_win_view', { props: { variant }, submissionId })
    firePlacementView(`v2_free_win_${variant}`, submissionId)
  }, [variant, submissionId])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(win.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2600)
    } catch {
      setCopied(false)
    }
    sendEvent('free_win_copy', { props: { variant }, submissionId })
  }

  return (
    <section style={{ borderTop: `3px solid ${INK}`, backgroundColor: CREAM }}>
      <div className="max-w-[880px] mx-auto px-6 sm:px-10 py-12 sm:py-16">
        <span className="inline-block font-mono uppercase" style={{ fontSize: 11.5, letterSpacing: '0.22em', color: FULVOUS, fontWeight: 600 }}>
          Free, yours right now
        </span>

        {variant === 'prompt' ? (
          <>
            <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
              {win.title}
            </h2>
            <p className="mt-3 max-w-[640px]" style={{ fontWeight: 300, fontSize: 17, lineHeight: 1.5, color: BODY }}>
              {win.why} Paste it into {win.tool} and you get: {win.payoff}
            </p>

            <div className="mt-7" style={{ border: `3px solid ${INK}`, backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center justify-between" style={{ padding: '10px 16px', borderBottom: `2px solid ${INK}`, backgroundColor: CREAM, gap: 12 }}>
                <span className="font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: '0.14em', color: RICH, fontWeight: 700 }}>
                  {win.kind} · for {win.tool}
                </span>
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: copied ? GREEN : INK, color: CREAM, fontWeight: 700, fontSize: 12.5, padding: '7px 14px', flexShrink: 0, border: 'none', cursor: 'pointer' }}
                >
                  {copied ? '✓ copied' : 'copy prompt'}
                </button>
              </div>
              <pre
                style={{
                  margin: 0, padding: '16px 18px', maxHeight: 260, overflowY: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12.5, lineHeight: 1.55, color: '#2A2A2A',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}
              >{win.prompt}</pre>
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-3 font-bold" style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', lineHeight: 1.02, letterSpacing: '-0.04em', color: RICH }}>
              Step 1 of your plan, unlocked
            </h2>
            <p className="mt-3 max-w-[640px]" style={{ fontWeight: 300, fontSize: 17, lineHeight: 1.5, color: BODY }}>
              This is a real tutorial from the library, the first one in your plan. Read it free, right now, no card needed.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-5 items-start" style={{ border: `3px solid ${INK}`, backgroundColor: '#FFFFFF', padding: 20 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://img.tradepub.com/free/${tutorial.qf}/images/${tutorial.qf}c4.gif`}
                alt=""
                referrerPolicy="no-referrer"
                style={{ width: 96, height: 126, objectFit: 'cover', border: `2px solid ${INK}`, display: 'block', backgroundColor: CREAM, flexShrink: 0 }}
              />
              <div className="min-w-0">
                <div className="font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: '0.1em', color: GREEN, fontWeight: 700 }}>Week 1 · free</div>
                <div className="mt-1.5" style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.25, color: RICH }}>{tutorial.title}</div>
                <div className="mt-1.5" style={{ fontSize: 13.5, lineHeight: 1.45, color: BODY, fontWeight: 300 }}>{tutorial.desc}</div>
                <a
                  href={tutorial.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => sendEvent('free_win_copy', { props: { variant }, submissionId })}
                  className="inline-flex mt-4 transition-transform hover:-translate-y-px active:scale-[0.98]"
                  style={{ textDecoration: 'none' }}
                >
                  <span className="inline-flex items-center justify-center" style={{ backgroundColor: INK, color: CREAM, fontWeight: 700, fontSize: 14, height: 44, padding: '0 18px' }}>read it free</span>
                  <span className="inline-flex items-center justify-center" style={{ backgroundColor: FULVOUS, color: RICH, width: 44, height: 44, borderLeft: `2px solid ${RICH}`, fontWeight: 700 }} aria-hidden>↗</span>
                </a>
              </div>
            </div>
          </>
        )}

        {/* The close: the free thing is the proof, the library is the offer. */}
        <p className="mt-6 max-w-[640px]" style={{ fontSize: 15.5, lineHeight: 1.55, color: BODY, fontWeight: 300 }}>
          {variant === 'prompt'
            ? <>That is <strong style={{ color: RICH, fontWeight: 700 }}>one</strong> prompt, built for you in about a second. The library has <strong style={{ color: RICH, fontWeight: 700 }}>1,200+ tutorials and 50+ templates</strong> like it, sequenced into the 30-day plan below.</>
            : <>That is <strong style={{ color: RICH, fontWeight: 700 }}>1 of 1,200+</strong>. The other 1,199, plus 50+ templates, are sequenced into the 30-day plan below.</>}
        </p>
      </div>
    </section>
  )
}
