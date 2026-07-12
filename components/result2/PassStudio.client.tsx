'use client'

import { useState } from 'react'
import { sendEvent } from '@/lib/events-client'
import { PassCard } from '@/components/result/PassCard'

// The pass studio: the member pass (same card as always), a hi-fi LinkedIn
// post preview embedding the REAL og image the unfurl will use, a share
// button that copies the post text to the clipboard before opening
// LinkedIn (the sample text travels; LinkedIn can't prefill it via URL),
// and a Download button for the card image.

const INK = '#333333'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const LI_BLUE = '#0A66C2'

/** Post text with @AI Central / #AICentral rendered LinkedIn-blue. */
function HighlightedPost({ text }: { text: string }) {
  const parts = text.split(/(@AI Central|#AICentral)/g)
  return (
    <>
      {parts.map((p, i) =>
        p === '@AI Central' || p === '#AICentral'
          ? <span key={i} style={{ color: LI_BLUE, fontWeight: 600 }}>{p}</span>
          : <span key={i}>{p}</span>,
      )}
    </>
  )
}

export function PassStudio({
  name,
  profileLabel,
  stageLabel,
  topPct,
  refNo,
  issued,
  description,
  submissionId,
  site,
}: {
  name: string
  profileLabel: string
  stageLabel: string
  topPct: number
  refNo: string
  issued: string
  description?: string
  submissionId?: string
  site: string
}) {
  const [copied, setCopied] = useState(false)

  const firstName = name.trim().split(/\s+/)[0] || 'AI Professional'

  // FULL name in the share params: the /pass title and the og card must
  // show the person, never the "AI Professional" fallback. The URL inside
  // the post text is IDENTICAL to the share button's URL, so a pasted
  // link unfurls the same card.
  const baseParams = new URLSearchParams({
    name: name.trim() || 'AI Professional',
    stage: stageLabel,
    profile: profileLabel,
    pct: String(topPct),
    ref: refNo,
  })
  const ogImageUrl = `/api/pass-image?${baseParams.toString()}`
  const sharePassUrl = `${site}/pass?${baseParams.toString()}`
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(sharePassUrl)}`
  const shareText = `I just measured my AI readiness with @AI Central, I'm in the top ${topPct}% of people on their AI journey.\n\nSee where you rank: ${sharePassUrl}\n\n#AICentral`

  const onShare = () => {
    try { navigator.clipboard?.writeText(shareText).then(() => setCopied(true)).catch(() => {}) } catch { /* noop */ }
    sendEvent('share_click', { props: { placement: 'v2_result_pass', ref: refNo, submissionId } })
  }

  const downloadCard = async () => {
    sendEvent('card_download', { props: { placement: 'v2_result_pass' }, submissionId })
    try {
      const res = await fetch(ogImageUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ai-central-member-pass.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch { /* non-fatal */ }
  }

  return (
    <div>
      {/* ── THE MEMBER PASS (same card as prod) ───────────────────── */}
      <div className="mx-auto" style={{ maxWidth: 480 }}>
        <PassCard
          name={name}
          personaLabel={profileLabel}
          stageLine={`STAGE: ${stageLabel}`}
          passPct={`Top ${topPct}% World`}
          issued={issued}
          refNo={refNo}
          description={description}
        />
      </div>

      {/* ── HI-FI LINKEDIN POST PREVIEW ───────────────────────────── */}
      <div className="mt-8 mx-auto text-left" style={{ maxWidth: 500, backgroundColor: '#FFFFFF', border: '1px solid #E0DFDC', borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div className="flex items-center justify-between" style={{ padding: '8px 14px', borderBottom: '1px solid #F0EFEC', backgroundColor: '#FAF9F7' }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: MUTE }}>PREVIEW · YOUR LINKEDIN POST</span>
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(shareText).then(() => setCopied(true)).catch(() => {}) }}
            style={{ fontSize: 11, fontWeight: 800, color: copied ? '#2E7D32' : LI_BLUE, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {copied ? '✓ COPIED' : 'COPY TEXT'}
          </button>
        </div>

        {/* post header */}
        <div className="flex items-center gap-3" style={{ padding: '12px 14px 0' }}>
          <span className="flex items-center justify-center shrink-0" style={{ width: 46, height: 46, borderRadius: '50%', backgroundColor: '#DCE6F1', color: LI_BLUE, fontSize: 19, fontWeight: 800 }}>
            {firstName[0]?.toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block" style={{ fontSize: 14, fontWeight: 700, color: '#191919', lineHeight: 1.2 }}>{name}</span>
            <span className="block" style={{ fontSize: 12, color: '#666', lineHeight: 1.3 }}>{profileLabel} · AI Central member</span>
            <span className="block" style={{ fontSize: 11.5, color: '#666' }}>now · 🌐</span>
          </span>
        </div>

        {/* post text */}
        <p style={{ padding: '10px 14px 12px', fontSize: 13.5, lineHeight: 1.5, color: '#191919', whiteSpace: 'pre-wrap' }}>
          <HighlightedPost text={shareText} />
        </p>

        {/* link preview — the REAL og image the unfurl will render */}
        <div style={{ borderTop: '1px solid #F0EFEC' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ogImageUrl}
            alt="Your member pass as it will appear on LinkedIn"
            style={{ width: '100%', aspectRatio: '1200 / 630', objectFit: 'cover', display: 'block', backgroundColor: CREAM }}
          />
          <div style={{ backgroundColor: '#F3F2EF', padding: '8px 14px' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: '#191919' }}>{name} is in the Top {topPct}% of AI Adoption - Discover Yours</p>
            <p style={{ fontSize: 11, color: '#666' }}>quiz.thecentral.ai</p>
          </div>
        </div>

        {/* decorative action row */}
        <div className="flex items-center justify-around" style={{ padding: '7px 10px', borderTop: '1px solid #F0EFEC', color: '#666', fontSize: 12 }}>
          <span>👍 Like</span><span>💬 Comment</span><span>🔁 Repost</span><span>📤 Send</span>
        </div>
      </div>

      {/* ── SHARE + DOWNLOAD ──────────────────────────────────────── */}
      <div className="mt-6 flex flex-col items-center">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onShare}
            className="inline-flex items-center justify-center gap-2.5 rounded-full bg-[#0A66C2] hover:bg-[#004182] transition-colors"
            style={{ color: '#FFFFFF', padding: '12px 28px', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
            aria-label="Share on LinkedIn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ display: 'block' }} aria-hidden>
              <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
            </svg>
            Share on LinkedIn
          </a>
          <button
            type="button"
            onClick={downloadCard}
            className="inline-flex items-center justify-center gap-2 rounded-full transition-colors hover:bg-[#FEF7E7]"
            style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', color: INK, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            aria-label="Download your member pass as an image"
          >
            ⬇ Download card
          </button>
        </div>
        <p className="mt-2" style={{ fontSize: 11.5, color: copied ? '#2E7D32' : MUTE, fontWeight: copied ? 700 : 400 }}>
          {copied ? '✓ Post text copied, just paste it into LinkedIn' : 'Clicking share copies the post text for you'}
        </p>
      </div>
    </div>
  )
}
