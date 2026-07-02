'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'

// A 2,500-dot "whole world" density chart (50×50), one dot ≈ 3.2M people,
// coloured by the most advanced AI interaction each person has. Tiers stack
// from the bottom-right (rarest last). Palette validated with the dataviz
// skill's validator (green/amber/red CVD ΔE ≈ 22, all checks pass); identity
// is never colour-alone — stacked bands + legend + a black/white "you" ring.
//
// Figures (2026, illustrative): never used AI ~6.8B (84%) · free chatbot user
// ~1.3B (16%) · pays $20/mo ~15–25M (0.3%) · uses coding agents ~2–5M (0.04%).

const COLS = 50
const ROWS = 50
const CODING = 1 // cells
const PAYS = 8
const CHATBOT = 400

type TierKey = 'never' | 'chatbot' | 'pays' | 'coding'

const TIERS: { key: TierKey; label: string; count: string; pct: string; color: string }[] = [
  { key: 'never', label: 'Never used AI', count: '~6.8B', pct: '84%', color: '#D6D1C7' },
  { key: 'chatbot', label: 'Free chatbot user', count: '~1.3B', pct: '16%', color: '#5A9B50' },
  { key: 'pays', label: 'Pays $20/mo for AI', count: '~15–25M', pct: '0.3%', color: '#C67F12' },
  { key: 'coding', label: 'Uses coding agents', count: '~2–5M', pct: '0.04%', color: '#BE3B3B' },
]
const TIER = Object.fromEntries(TIERS.map((t) => [t.key, t])) as Record<TierKey, (typeof TIERS)[number]>

/** Rank from the bottom-right (0 = bottom-right cell) so the rarest tiers sit there. */
function rankOf(r: number, c: number): number {
  return (ROWS - 1 - r) * COLS + (COLS - 1 - c)
}
function tierOfRank(rank: number): TierKey {
  if (rank < CODING) return 'coding'
  if (rank < CODING + PAYS) return 'pays'
  if (rank < CODING + PAYS + CHATBOT) return 'chatbot'
  return 'never'
}
function cellCenterPct(rank: number): { left: number; top: number } {
  const r = ROWS - 1 - Math.floor(rank / COLS)
  const c = COLS - 1 - (rank % COLS)
  return { left: ((c + 0.5) / COLS) * 100, top: ((r + 0.5) / ROWS) * 100 }
}

/** Which cell "you" occupy, by stage. S5→coding, S3/S4→pays, else→chatbot band. */
function youRankForStage(stage?: string | null): number {
  switch (stage) {
    case 'S5_builder':
      return 0 // the single coding-agents dot
    case 'S4_power_user':
    case 'S3_practitioner':
      return CODING + 3 // mid of the pays band
    default:
      return CODING + PAYS + 165 // central cell of the chatbot band
  }
}

interface Props {
  variant?: 'cover' | 'result'
  stage?: string | null
  aheadPct?: number
  firstName?: string
  /** Cover-only: render just the chart (subtitle + card), dropping the big
   *  headline + trailing caption. Used in the 2-column desktop hero where the
   *  page's own h1 + CTA already carry the copy. */
  bare?: boolean
}

export function AdoptionChart({ variant = 'result', stage, aheadPct, firstName, bare = false }: Props) {
  const isCover = variant === 'cover'

  // The static 2,500-dot grid — memoised so the roam animation never re-renders it.
  const grid = useMemo(() => {
    const rects: ReactNode[] = []
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const color = TIER[tierOfRank(rankOf(r, c))].color
        rects.push(<rect key={`${r}-${c}`} x={c * 10 + 1} y={r * 10 + 1} width={8} height={8} rx={1.6} fill={color} />)
      }
    }
    return rects
  }, [])

  // "You" marker position. Result = fixed by stage. Cover = roams the started band.
  const fixedRank = youRankForStage(stage)
  const [roamRank, setRoamRank] = useState(CODING + PAYS + 200)

  useEffect(() => {
    if (!isCover) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const id = setInterval(() => {
      // Roam anywhere in the "already started" area (ranks 0..408).
      setRoamRank(Math.floor(Math.random() * (CODING + PAYS + CHATBOT)))
    }, 360)
    return () => clearInterval(id)
  }, [isCover])

  const markerRank = isCover ? roamRank : fixedRank
  const { left, top } = cellCenterPct(markerRank)
  const youTier = TIER[tierOfRank(fixedRank)]

  const chart = (
    <div className="relative mx-auto w-full max-w-[400px]" aria-hidden>
      <svg viewBox="0 0 500 500" className="w-full h-auto block" role="img" aria-label="World AI adoption, 2,500 dots">
        {grid}
      </svg>
      {/* The one "you" marker — flashing ring (result) or roaming "?" (cover). */}
      <div
        className="absolute ac-you-pulse"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          transition: isCover ? 'left 0.18s ease, top 0.18s ease' : undefined,
        }}
      >
        <div className="ac-you-dot">{isCover ? <span className="ac-you-q">?</span> : null}</div>
      </div>
      <style>{`
        .ac-you-pulse { width: 0; height: 0; }
        .ac-you-dot {
          position: absolute; left: 0; top: 0; transform: translate(-50%, -50%);
          width: 16px; height: 16px; border-radius: 9999px;
          background: ${isCover ? '#333333' : youTier.color};
          box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px #333333;
          display: flex; align-items: center; justify-content: center;
          animation: ac-you-pulse 1.4s ease-in-out infinite;
        }
        .ac-you-q { color: #fff; font-size: 11px; font-weight: 900; line-height: 1; }
        @keyframes ac-you-pulse {
          0%, 100% { box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px #333333, 0 0 0 6px rgba(51,51,51,0.18); }
          50%      { box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px #333333, 0 0 0 12px rgba(51,51,51,0); }
        }
      `}</style>
    </div>
  )

  const legend = (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 max-w-md mx-auto mt-5">
      {TIERS.map((t) => (
        <div key={t.key} className="flex items-center gap-2 text-[11px]" style={{ color: '#555' }}>
          <span className="inline-block h-3 w-3 rounded-[3px] flex-shrink-0" style={{ backgroundColor: t.color }} />
          <span className="leading-tight">
            {t.label} · <strong style={{ color: '#333' }}>{t.count}</strong> <span style={{ color: '#9C9C9C' }}>({t.pct})</span>
          </span>
        </div>
      ))}
    </div>
  )

  const subtitle = (
    <p className="text-[11px] text-center mb-5 font-mono" style={{ color: '#9C9C9C' }}>
      Each dot ≈ 3.2M people · 2,500 = 8.1B humans · colour = most advanced AI use (2026)
    </p>
  )

  const card = (
    <div className="rounded-2xl p-6 sm:p-7" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E4DF', boxShadow: '0 4px 30px rgba(228,135,21,0.06)' }}>
      {chart}
      {legend}
    </div>
  )

  if (isCover) {
    // Chart-only render for the 2-column desktop hero — the page's h1 + CTA
    // already carry the headline, so drop the duplicate <h2> + caption.
    if (bare) {
      return (
        <div className="w-full max-w-lg mx-auto">
          {subtitle}
          {card}
        </div>
      )
    }
    return (
      <div className="w-full max-w-lg mx-auto">
        <h2 className="text-[24px] sm:text-[28px] font-black text-center mb-1 leading-tight" style={{ color: '#333333', fontFamily: 'Georgia, "Times New Roman", serif' }}>
          Almost nobody has started with AI
        </h2>
        {subtitle}
        {card}
        <p className="text-[14px] text-center mt-5 max-w-md mx-auto" style={{ color: '#333333' }}>
          Your dot could be <strong style={{ color: '#E48715' }}>anywhere</strong> in here.{' '}
          <span style={{ color: '#9C9C9C' }}>Take the quiz to lock it in.</span>
        </p>
      </div>
    )
  }

  const lead = firstName ? `${firstName}, you're` : "You're"
  return (
    <section className="px-6 pb-12 max-w-2xl mx-auto w-full">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] mb-3 text-center" style={{ color: '#9C9C9C' }}>
        The bigger picture
      </p>
      <h2 className="text-[26px] sm:text-[30px] font-black text-center mb-1 leading-tight" style={{ color: '#333333', fontFamily: 'Georgia, "Times New Roman", serif' }}>
        {lead} further ahead than you think
      </h2>
      {subtitle}
      {card}
      <p className="text-[14px] text-center mt-5 max-w-md mx-auto leading-relaxed" style={{ color: '#333333' }}>
        <span className="inline-flex items-center gap-1.5 align-middle">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: youTier.color, boxShadow: '0 0 0 2px #fff, 0 0 0 3px #333' }} />
          <strong>That flashing dot is you</strong>
        </span>{' '}
        — a <strong style={{ color: '#333' }}>{youTier.label.toLowerCase()}</strong>
        {typeof aheadPct === 'number' ? <>, ahead of <strong style={{ color: '#E48715' }}>~{aheadPct}%</strong> of everyone</> : null}.
      </p>
      <p className="text-[14px] leading-relaxed text-center mt-3 max-w-md mx-auto" style={{ color: '#555' }}>
        The people who move now spend the next decade ahead of the 84% still waiting.{' '}
        <span style={{ color: '#E48715' }}>AI Central gets you there first.</span>
      </p>
      <p className="text-[10px] text-center mt-3" style={{ color: '#C4BDB2' }}>
        Sources: OpenAI · World Bank &amp; Microsoft AI diffusion · public adoption surveys (2026)
      </p>
    </section>
  )
}
