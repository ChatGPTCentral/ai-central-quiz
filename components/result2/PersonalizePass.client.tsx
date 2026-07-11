'use client'

import { useRef, useState } from 'react'

// Pass personalization: a small popup widget that lets the person add
// their face to the member pass (client-side square crop → instant overlay
// on the card) and link their LinkedIn profile. Persists via
// POST /api/pass-photo when a submission id exists; without one it's a
// local preview only. Also exports SharePostBox — the suggested LinkedIn
// post with @AICentral + #AICentral and a copy button (LinkedIn's share
// URL can't prefill text, so copy-then-share is the bridge).

const INK = '#333333'
const RICH = '#1A1A1A'
const MUTE = '#9C9C9C'
const FULVOUS = '#E48715'

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

export function PersonalizePass({
  children,
  submissionId,
}: {
  children: React.ReactNode
  submissionId?: string
}) {
  const [face, setFace] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [linkedin, setLinkedin] = useState('')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'done' | 'local'>('idle')
  const fileRef = useRef<HTMLInputElement>(null)

  const pick = async (f: File | undefined) => {
    if (!f || !f.type.startsWith('image/')) return
    try { setFace(await toSquareDataUrl(f)) } catch { /* unsupported file */ }
  }

  const save = async () => {
    if (!face && !linkedin.trim()) { setOpen(false); return }
    if (!submissionId) { setSaved('local'); setOpen(false); return }
    setSaved('saving')
    try {
      await fetch('/api/pass-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, imageBase64: face || undefined, linkedinUrl: linkedin.trim() || undefined }),
      })
      setSaved('done')
    } catch { setSaved('local') }
    setOpen(false)
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        {children}
        {face && (
          // Face badge over the card's top-right corner (outside PassCard,
          // so its overflow-hidden and -1.6deg tilt don't apply).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={face}
            alt="Your photo on the pass"
            style={{
              position: 'absolute', top: -6, right: 2, width: 84, height: 84,
              borderRadius: '50%', objectFit: 'cover', border: `3px solid ${RICH}`,
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)', zIndex: 5, backgroundColor: '#FEF7E7',
            }}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 transition-transform hover:-translate-y-px"
          style={{ border: `2px solid ${INK}`, backgroundColor: '#FFFFFF', padding: '9px 16px', fontSize: 13.5, fontWeight: 700, color: INK, cursor: 'pointer' }}
        >
          🪪 Add your face + LinkedIn
        </button>
        {saved === 'done' && <span style={{ fontSize: 12, color: '#2E7D32', fontWeight: 700 }}>✓ saved to your pass</span>}
        {saved === 'local' && <span style={{ fontSize: 12, color: MUTE }}>previewing locally</span>}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Personalize your pass"
        >
          <div
            className="w-full max-w-[380px] bg-white p-6"
            style={{ border: `3px solid ${INK}`, boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: 17, fontWeight: 800, color: RICH }}>Personalize your pass</p>
            <p className="mt-1" style={{ fontSize: 12.5, color: '#4A4A4A', fontWeight: 300, lineHeight: 1.45 }}>
              Add your face and your LinkedIn - - it shows on the card before you share it.
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
                  <img src={face} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${INK}` }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#2E7D32' }}>Photo added - - tap to change</span>
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
              {saved === 'saving' ? 'Saving…' : 'Put it on my pass'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function SharePostBox({ shareText }: { shareText: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(shareText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    }).catch(() => {})
  }
  return (
    <div className="mt-7 mx-auto text-left" style={{ maxWidth: 480, border: `2px solid ${INK}`, backgroundColor: '#FFFFFF' }}>
      <div className="flex items-center justify-between" style={{ padding: '8px 12px', borderBottom: `2px solid ${INK}`, backgroundColor: '#FEF7E7' }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em', color: INK }}>SUGGESTED POST</span>
        <button
          type="button"
          onClick={copy}
          style={{ fontSize: 11.5, fontWeight: 800, color: copied ? '#2E7D32' : FULVOUS, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.04em' }}
        >
          {copied ? '✓ COPIED' : 'COPY TEXT'}
        </button>
      </div>
      <p style={{ padding: '12px 14px', fontSize: 13, lineHeight: 1.55, color: '#4A4A4A', whiteSpace: 'pre-wrap' }}>{shareText}</p>
      <p style={{ padding: '0 14px 10px', fontSize: 10.5, color: MUTE }}>
        LinkedIn opens with your card attached - - paste this text into the post.
      </p>
    </div>
  )
}
