'use client'

import { useEffect, useState } from 'react'
import { NAVY, RED_URGENT } from '@/lib/redesign-tokens'

// A ticking HH:MM:SS to a REAL fixed point in time (fw.expiresAt), not a
// generic session-anchored timer like CountdownTimer/InlineCountdown (those
// reset every session on purpose, for an evergreen page-level nudge). This
// one exists because founding-window urgency is a personal deadline the
// checkout actually enforces (lib/founding-window.ts): the number on screen
// must be the real time left, or it is exactly the fake-deadline device
// CLAUDE.md bans. Renders nothing until mounted, same as its siblings — a
// server-computed remaining-time string would already be stale by the time
// the client hydrates, and disagreeing timestamps read as a hydration bug.

function Digit({ v }: { v: string }) {
  return (
    <span
      className="tabular-nums"
      style={{ background: '#FFFFFF', color: RED_URGENT, fontWeight: 800, fontSize: 'inherit', borderRadius: 8, padding: '6px 7px', minWidth: '1.9em', textAlign: 'center', lineHeight: 1, display: 'inline-block' }}
    >
      {v}
    </span>
  )
}

function Sep() {
  return <span style={{ color: '#FFFFFF', fontWeight: 800 }} aria-hidden>:</span>
}

export default function FoundingCountdown({
  expiresAt, fontSize = 22, gap = 5,
}: {
  expiresAt: string
  fontSize?: number
  gap?: number
}) {
  const [msLeft, setMsLeft] = useState<number | null>(null)

  useEffect(() => {
    const target = new Date(expiresAt).getTime()
    const tick = () => setMsLeft(Math.max(0, target - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  if (msLeft === null) return null
  if (msLeft <= 0) return <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize }}>Your founding rate just ended</span>

  const total = Math.floor(msLeft / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')

  return (
    <span aria-label={`${h} hours ${m} minutes ${s} seconds left`} style={{ display: 'inline-flex', alignItems: 'center', gap, fontSize }}>
      <Digit v={h} /><Sep /><Digit v={m} /><Sep /><Digit v={s} />
    </span>
  )
}

// Same digits, small enough for a sticky bar or a closing line — kept here
// rather than a prop-driven size mess, since the two use cases really do
// want different markup (chips vs plain mono text).
export function FoundingCountdownInline({ expiresAt }: { expiresAt: string }) {
  const [msLeft, setMsLeft] = useState<number | null>(null)

  useEffect(() => {
    const target = new Date(expiresAt).getTime()
    const tick = () => setMsLeft(Math.max(0, target - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  if (msLeft === null) return null
  if (msLeft <= 0) return <span>rate ended</span>

  const total = Math.floor(msLeft / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')

  return <strong className="tabular-nums" style={{ color: NAVY }}>{h}:{m}:{s}</strong>
}
