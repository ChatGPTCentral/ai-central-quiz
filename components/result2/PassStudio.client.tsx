'use client'

import { useRef, useState } from 'react'
import { sendEvent } from '@/lib/events-client'
import { Barcode } from '@/components/result/PassCard'

// The pass studio (result v2): a US-ID-style member card with a photo box
// (click to add your face + LinkedIn), a hi-fi LinkedIn post preview that
// embeds the REAL og image the unfurl will use, and a share button that
// copies the post text to the clipboard before opening LinkedIn — so the
// sample text travels and the rendered image matches the on-page card.

const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'
const CREAM = '#FEF7E7'
const FULVOUS = '#E48715'
const LI_BLUE = '#0A66C2'

/** Square-crop + downscale a picked file to a 512px JPEG data URL. */
async function toSquareDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const out = 512
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out)
  return canvas.toDataURL('image/jpeg', 0.86)
}

/** Post text with @AICentral / #AICentral rendered LinkedIn-blue. */
function HighlightedPost({ text }: { text: string }) {
  const parts = text.split(/(@AICentral|#AICentral)/g)
  return (
    <>
      {parts.map((p, i) =>
        p === '@AICentral' || p === '#AICentral'
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
  submissionId,
  shareText,
  site,
}: {
  name: string
  profileLabel: string
  stageLabel: string
  topPct: number
  refNo: string
  issued: string
  submissionId?: string
  shareText: string
  site: string
}) {
  const [faceLocal, setFaceLocal] = useState<string | null>(null)
  const [facePublic, setFacePublic] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [linkedin, setLinkedin] = useState('')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'done' | 'local'>('idle')
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const firstName = name.trim().split(/\s+/)[0] || 'AI Professional'
  const face = faceLocal

  const baseParams = new URLSearchParams({
    name: firstName,
    stage: stageLabel,
    profile: profileLabel,
    pct: String(topPct),
    ref: refNo,
    style: 'id',
  })
  if (facePublic) baseParams.set('photo', facePublic)
  const ogImageUrl = `/api/pass-image?${baseParams.toString()}`
  const sharePassUrl = `${site}/pass?${baseParams.toString()}`
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(sharePassUrl)}`

  const pick = async (f: File | undefined) => {
    if (!f || !f.type.startsWith('image/')) return
    try { setFaceLocal(await toSquareDataUrl(f)) } catch { /* unsupported file */ }
  }

  const save = async () => {
    if (!faceLocal && !linkedin.trim()) { setOpen(false); return }
    if (!submissionId) { setSaved('local'); setOpen(false); return }
    setSaved('saving')
    try {
      const res = await fetch('/api/pass-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, imageBase64: faceLocal || undefined, linkedinUrl: linkedin.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.photoUrl) setFacePublic(data.photoUrl as string)
      setSaved('done')
    } catch { setSaved('local') }
    setOpen(false)
  }

  const onShare = () => {
    try { navigator.clipboard?.writeText(shareText).then(() => setCopied(true)).catch(() => {}) } catch { /* noop */ }
    sendEvent('share_click', { props: { placement: 'v2_result_pass', ref: refNo, submissionId } })
  }

  return (
    <div>
      {/* ── THE ID CARD (US-ID style) ─────────────────────────────── */}
      <div className="mx-auto text-left" style={{ maxWidth: 520, border: `3px solid ${RICH}`, backgroundColor: '#FDFBF3', boxShadow: '0 18px 44px rgba(0,0,0,0.18)' }}>
        {/* header band */}
        <div className="flex items-center justify-between" style={{ backgroundColor: INK, padding: '10px 16px' }}>
          <span className="font-mono" style={{ fontSize: 11, letterSpacing: '0.18em', color: CREAM }}>
            AI CENTRAL · MEMBER IDENTIFICATION
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-avatar-light.png" alt="" style={{ width: 20, height: 20, display: 'block' }} />
        </div>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${FULVOUS}, #E7B02F)` }} aria-hidden />

        {/* body: photo box + fields */}
        <div className="flex gap-4" style={{ padding: '16px 16px 14px' }}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 flex flex-col items-center justify-center"
            style={{
              width: 118, height: 148,
              border: face ? `2px solid ${RICH}` : `2px dashed ${MUTE}`,
              backgroundColor: face ? '#000' : '#F1ECE1',
              cursor: 'pointer', padding: 0, overflow: 'hidden',
            }}
            aria-label="Add your photo to the card"
          >
            {face ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={face} alt="Your ID photo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <>
                <span style={{ fontSize: 26, color: MUTE }} aria-hidden>+</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', color: MUTE, marginTop: 4 }}>ADD PHOTO</span>
              </>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: MUTE }}>NAME</p>
            <p className="uppercase" style={{ fontSize: 'clamp(19px, 3vw, 24px)', fontWeight: 900, letterSpacing: '-0.02em', color: RICH, lineHeight: 1.05 }}>{name}</p>
            <p className="mt-1.5 font-mono" style={{ fontSize: 12, letterSpacing: '0.12em', color: FULVOUS, fontWeight: 700 }}>
              STAGE: {stageLabel}
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3" style={{ borderTop: `1px solid #DDD5C4`, paddingTop: 10 }}>
              <div>
                <p style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', color: MUTE }}>PROFILE</p>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: RICH }}>{profileLabel}</p>
              </div>
              <div>
                <p style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', color: MUTE }}>AI LEADERSHIP</p>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: FULVOUS }}>Top {topPct}% World</p>
              </div>
              <div>
                <p style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', color: MUTE }}>ISSUED</p>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: RICH }}>{issued}</p>
              </div>
              <div>
                <p style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', color: MUTE }}>ID NO.</p>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: RICH }}>{refNo}</p>
              </div>
            </div>
          </div>
        </div>

        {/* barcode strip */}
        <div className="flex items-center justify-between" style={{ backgroundColor: CREAM, borderTop: `2px solid ${RICH}`, padding: '9px 16px' }}>
          <Barcode seed={refNo} width={190} height={24} />
          <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: RICH }}>VERIFIED MEMBER</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ fontSize: 12.5, fontWeight: 700, color: INK, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          🪪 {face ? 'Change photo or LinkedIn' : 'Add your face + LinkedIn'}
        </button>
        {saved === 'done' && <span style={{ fontSize: 12, color: '#2E7D32', fontWeight: 700 }}>✓ saved</span>}
        {saved === 'local' && <span style={{ fontSize: 12, color: MUTE }}>previewing locally</span>}
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
          <span className="flex items-center justify-center shrink-0" style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', backgroundColor: '#DCE6F1', color: LI_BLUE, fontSize: 19, fontWeight: 800 }}>
            {face
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={face} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : firstName[0]?.toUpperCase()}
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
            alt="Your member card as it will appear on LinkedIn"
            style={{ width: '100%', aspectRatio: '1200 / 630', objectFit: 'cover', display: 'block', backgroundColor: CREAM }}
          />
          <div style={{ backgroundColor: '#F3F2EF', padding: '8px 14px' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: '#191919' }}>Where do you rank in AI adoption?</p>
            <p style={{ fontSize: 11, color: '#666' }}>quiz.thecentral.ai</p>
          </div>
        </div>

        {/* decorative action row */}
        <div className="flex items-center justify-around" style={{ padding: '7px 10px', borderTop: '1px solid #F0EFEC', color: '#666', fontSize: 12 }}>
          <span>👍 Like</span><span>💬 Comment</span><span>🔁 Repost</span><span>📤 Send</span>
        </div>
      </div>

      {/* ── SHARE ─────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-col items-center">
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
        <p className="mt-2" style={{ fontSize: 11.5, color: copied ? '#2E7D32' : MUTE, fontWeight: copied ? 700 : 400 }}>
          {copied ? '✓ Post text copied, just paste it into LinkedIn' : 'Clicking share copies the post text for you'}
        </p>
      </div>

      {/* ── PERSONALIZE POPUP ─────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Personalize your card"
        >
          <div
            className="w-full max-w-[380px] bg-white p-6 text-left"
            style={{ border: `3px solid ${INK}`, boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: 17, fontWeight: 800, color: RICH }}>Personalize your card</p>
            <p className="mt-1" style={{ fontSize: 12.5, color: '#4A4A4A', fontWeight: 300, lineHeight: 1.45 }}>
              Add your face and your LinkedIn, it shows on the card before you share it.
            </p>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-4 w-full flex items-center justify-center gap-3"
              style={{ border: `2px dashed ${face ? '#2E7D32' : INK}`, backgroundColor: '#FFFDFA', padding: '14px 12px', cursor: 'pointer' }}
            >
              {face ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={face} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', border: `2px solid ${INK}` }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#2E7D32' }}>Photo added, tap to change</span>
                </>
              ) : (
                <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>📷 Upload your photo</span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />

            <label className="block mt-4">
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: MUTE }}>LINKEDIN PROFILE</span>
              <input
                type="url"
                value={linkedin}
                onChange={e => setLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/you"
                className="mt-1 w-full"
                style={{ border: `2px solid ${INK}`, padding: '10px 12px', fontSize: 13.5, outline: 'none' }}
              />
            </label>

            <button
              type="button"
              onClick={save}
              disabled={saved === 'saving'}
              className="mt-5 w-full transition-opacity hover:opacity-90"
              style={{ backgroundColor: FULVOUS, color: RICH, border: `2px solid ${RICH}`, padding: '12px 0', fontSize: 14.5, fontWeight: 800, cursor: 'pointer', opacity: saved === 'saving' ? 0.6 : 1 }}
            >
              {saved === 'saving' ? 'Saving…' : 'Put it on my card'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
