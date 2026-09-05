'use client'

import { useEffect, useRef } from 'react'
import { sendEvent } from '@/lib/events-client'
import { firePlacementView } from '@/components/CheckoutLink.client'

/**
 * Measures the video and gives blocked viewers a way out.
 *
 * WHY THIS EXISTS (2026-09-05). The owner reported the embed failing with the
 * browser's own "this page cannot be reached", and asked how long it had been
 * broken. Nobody could answer: `funnel_events` held ZERO video events of any
 * kind, so the video has been on the page that sells with no measurement at
 * all. From the server the video is fine — the oEmbed API returns 200 with
 * the right title, and both youtube.com and youtube-nocookie.com serve the
 * embed — and the error he saw is the browser failing to REACH the address,
 * not YouTube refusing to play. `youtube-nocookie.com` sits on the block
 * lists of common ad and tracker blockers, which is the likeliest cause, and
 * it means some share of real visitors sees the same empty box he did.
 *
 * So: a plain link to the same video on youtube.com, which the same blockers
 * usually allow, and two events so the next person asking "since when" gets
 * a real answer:
 *   placement_view v2_video   the block scrolled into view
 *   checkout_click is NOT used here — this is not an offer, and counting it
 *                             as one would inflate the only metric we trust.
 *   video_fallback_click      somebody had to use the escape hatch, which is
 *                             the closest thing to a broken-embed signal we
 *                             can measure from our own side.
 */
export default function VideoWatch({ videoId, submissionId }: { videoId: string; submissionId?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            firePlacementView('v2_video', submissionId)
            obs.disconnect()
          }
        }
      },
      { threshold: 0.3 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [submissionId])

  return (
    <div ref={ref} className="mt-2 text-center">
      <a
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => sendEvent('video_fallback_click', { props: { videoId }, submissionId })}
        style={{ fontSize: 12.5, color: '#4A4A4A', textDecoration: 'underline' }}
      >
        Video not loading? Watch it on YouTube
      </a>
    </div>
  )
}
