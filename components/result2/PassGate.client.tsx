'use client'

import { useState } from 'react'
import { PassCard } from '@/components/result/PassCard'
import { PassStudio } from '@/components/result2/PassStudio.client'
import { sendEvent } from '@/lib/events-client'

// The member pass, gated behind a LinkedIn URL. The reward sits at the very
// bottom of the result page: a blurred pass teases underneath, and pasting a
// LinkedIn profile unlocks it (reveal + share + download). The URL is saved to
// the person's record (fill-only) via /api/pass-photo, so it also becomes an
// enrichment signal we can re-run from.

const INK = '#333333'
const RICH = '#1A1A1A'
const BODY = '#4A4A4A'
const FULVOUS = '#E48715'
const LI_RE = /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/.+/i

interface Props {
  name: string
  profileLabel: string
  stageLabel: string
  topPct: number
  refNo: string
  issued: string
  description?: string
  submissionId?: string
  site: string
}

export function PassGate(props: Props) {
  const [unlocked, setUnlocked] = useState(false)
  const [linkedin, setLinkedin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const unlock = async () => {
    const url = linkedin.trim()
    if (!LI_RE.test(url)) { setErr('Paste your full LinkedIn profile URL (linkedin.com/in/…)'); return }
    setBusy(true); setErr('')
    try {
      if (props.submissionId) {
        await fetch('/api/pass-photo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId: props.submissionId, linkedinUrl: url }),
        }).catch(() => {})
      }
      sendEvent('pass_unlock', { props: { placement: 'v2_result_pass' }, submissionId: props.submissionId })
    } finally {
      setBusy(false)
      setUnlocked(true) // unlock even if the save hiccups — never trap the reward
    }
  }

  if (unlocked) return <PassStudio {...props} />

  const firstName = (props.name || '').trim().split(/\s+/)[0] || ''

  return (
    <div className="mx-auto" style={{ maxWidth: 480 }}>
      {/* PEEK: the top of the card is crisp — they see their OWN name on it —
          and it fades into the gate below. A fully frozen card is a stranger's
          card; a card with your name on it is already yours, you are just
          finishing it. Ownership, not curiosity. */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 46%, rgba(0,0,0,0.55) 62%, rgba(0,0,0,0.12) 80%, transparent 94%)',
            maskImage: 'linear-gradient(to bottom, #000 0%, #000 46%, rgba(0,0,0,0.55) 62%, rgba(0,0,0,0.12) 80%, transparent 94%)',
            pointerEvents: 'none', userSelect: 'none',
          }}
          aria-hidden
        >
          <PassCard
            name={props.name}
            personaLabel={props.profileLabel}
            stageLine={`STAGE: ${props.stageLabel}`}
            passPct={`Top ${props.topPct}% World`}
            issued={props.issued}
            refNo={props.refNo}
            description={props.description}
          />
        </div>
        {/* Small seal over the crisp part so it reads as issued-but-unsigned */}
        <span
          className="inline-flex items-center"
          style={{
            position: 'absolute', top: 12, right: 12, gap: 5,
            background: 'rgba(26,26,26,0.86)', color: '#E7B02F',
            fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em',
            padding: '4px 8px', textTransform: 'uppercase',
          }}
        >
          🔒 Not signed yet
        </span>
      </div>

      {/* Gate — now BELOW the peek instead of covering it */}
      <div
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
          textAlign: 'center', padding: '18px 22px 20px', marginTop: -10,
          background: 'rgba(254,247,231,0.94)', border: `2px solid ${INK}`,
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 800, color: RICH, letterSpacing: '-0.02em' }}>
          {firstName ? `${firstName}, your pass is ready` : 'Your pass is ready'}
        </p>
        <p style={{ fontSize: 13, color: BODY, lineHeight: 1.5, maxWidth: 360 }}>
          It already has your name and your Top {props.topPct}% rank on it. Add your LinkedIn to sign it,
          then download it and post it.
        </p>
        <input
          type="url"
          inputMode="url"
          value={linkedin}
          onChange={e => { setLinkedin(e.target.value); if (err) setErr('') }}
          onKeyDown={e => { if (e.key === 'Enter') unlock() }}
          placeholder="https://www.linkedin.com/in/you"
          className="w-full"
          style={{ maxWidth: 360, marginTop: 4, fontSize: 14, padding: '11px 13px', border: `2px solid ${err ? '#BE3B3B' : INK}`, borderRadius: 8, background: '#FFFFFF', outline: 'none' }}
        />
        {err && <p style={{ fontSize: 12, fontWeight: 600, color: '#BE3B3B' }}>{err}</p>}
        <button
          type="button"
          onClick={unlock}
          disabled={busy}
          className="transition-transform hover:-translate-y-px active:scale-[0.98]"
          style={{ marginTop: 2, backgroundColor: INK, color: '#FEF7E7', fontWeight: 700, fontSize: 15, padding: '12px 26px', border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Signing…' : '🎟 Sign and unlock my pass'}
        </button>
        <p style={{ fontSize: 10.5, color: '#9C9C9C', marginTop: 2 }}>
          We use it to verify your rank and personalize your card. <span style={{ color: FULVOUS }}>No spam.</span>
        </p>
      </div>
    </div>
  )
}
