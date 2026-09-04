'use client'

// "Which CTA gets clicked" — extracted from the dashboard's Row 7 (owner,
// 2026-08-29: move non-critical insights off the main dashboard into their
// own 'Insights' section). Same component, same data shape (PlacementStat),
// just a second call site now: /admin/dashboard no longer renders this,
// /admin/insights does.

import { useState } from 'react'
import type { PlacementStat } from '@/app/admin/dashboard/DashboardBento.client'

const INK = '#1A1A1A'
const MUTE = '#9C9C9C'
const HAIR = '#E8E2D4'
const ROWHAIR = '#F1ECE2'
const TRACK = '#F1ECE0'
const LATTE = '#FEF7E7'
const GRID_CTA = '158px 1fr 70px 66px 56px 56px 68px'
const tnum: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }

const PLACEMENT_NAME: Record<string, string> = {
  v2_offer_stack: 'Offer stack',
  v2_offer_stack_badges: 'Offer stack · pay marks',
  v2_hero_cta: 'Hero button (above the fold)',
  v2_offer_bar: 'Sticky bottom bar',
  v2_offer_bar_banner: 'Sticky bottom bar · whole strip',
  v2_video_cta: 'Under the video',
  v2_study_plan: 'Study plan',
  v2_study_plan_badges: 'Study plan · pay marks',
  v2_social_marquee: 'Reviews marquee',
  v2_fomo_notification: 'Trial notification',
  v2_embedded_fallback: 'Checkout modal · classic-checkout link',
  v2_free_win_prompt: 'Free win · prompt',
  v2_free_win_tutorial: 'Free win · tutorial',
  v2_result_pass: 'Member pass',
}

function humanizePlacement(p: string): string {
  return PLACEMENT_NAME[p]
    || p.replace(/^v2_/, '').replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()).trim()
    || p
}

function PlacementThumb({ placement }: { placement: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    // Clean labeled tile for placements we haven't captured (legacy CTAs, or
    // ones that only render mid-video) — never an empty "no preview" box.
    const isV2 = placement.startsWith('v2_')
    return (
      <span title={placement} style={{ width: 138, height: 56, border: `1px solid ${isV2 ? '#CBD9E6' : '#E0DACE'}`, background: isV2 ? 'linear-gradient(135deg,#EAF2F9,#F8FBFD)' : 'linear-gradient(135deg,#F6F1E5,#FBF8F1)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '0 6px' }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>🖼️</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#6B6B6B', textAlign: 'center', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{humanizePlacement(placement)}</span>
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/admin-placements/${placement}.png`}
      alt={placement}
      style={{ width: 138, height: 56, objectFit: 'cover', objectPosition: 'top', border: '1px solid #C9C2B4', background: TRACK }}
      onError={() => setFailed(true)}
    />
  )
}

export default function CtaClickedTable({ placements }: { placements: PlacementStat[] }) {
  const bestCtr = placements.reduce<string | null>((best, p) => {
    if (!p.views || !p.clicks) return best
    const ctr = p.clicks / p.views
    const bp = placements.find(x => x.placement === best)
    return !bp || !bp.views || ctr > bp.clicks / bp.views ? p.placement : best
  }, null)
  // The button that SELLS, which is not always the button that gets clicked.
  // Badging the top click rate as "Best" was quietly wrong: the click-quality
  // guardrail already caught an arm winning on clicks while selling less.
  const bestSeller = placements.reduce<string | null>((best, p) => {
    if (!p.sales) return best
    const bp = placements.find(x => x.placement === best)
    return !bp || p.sales > bp.sales ? p.placement : best
  }, null)

  return (
    <div style={{ border: '1px solid #333333', background: '#FFFDFA' }}>
      <div className="flex items-baseline justify-between" style={{ padding: '12px 20px', background: LATTE, borderBottom: `1px solid ${HAIR}` }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Which CTA gets clicked</span>
        <span style={{ fontSize: 10.5, color: '#6B6B6B' }}>of the people who SAW each button, how many clicked it · since Jul 5</span>
      </div>
      <div className="ac-scrollx"><div>
      <div className="grid" style={{ gridTemplateColumns: GRID_CTA, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B6B6B', borderBottom: `1px solid ${HAIR}`, padding: '0 20px' }}>
        <span style={{ padding: '8px 0' }}>Shown</span><span style={{ padding: '8px 0' }}>Button</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Saw it</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Clicked</span><span style={{ padding: '8px 0', textAlign: 'right' }}>Rate</span><span style={{ padding: '8px 0', textAlign: 'right' }} title="Net-new paid among the people who clicked THIS button">Sold</span><span style={{ padding: '8px 0', textAlign: 'right' }} title="Revenue from the people who clicked this button">Revenue</span>
      </div>
      {placements.length === 0 && <p style={{ padding: '10px 20px', fontSize: 12, color: MUTE }}>No placement events yet.</p>}
      {placements.map(p => (
        <div key={p.placement} className="grid items-center hover:bg-[#FEF7E7]" style={{ gridTemplateColumns: GRID_CTA, fontSize: 12, borderBottom: `1px solid ${ROWHAIR}`, padding: '6px 20px' }}>
          <PlacementThumb placement={p.placement} />
          <span className="flex items-center" style={{ fontSize: 12, fontWeight: 600, color: INK, gap: 8, minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.placement}>{humanizePlacement(p.placement)}</span>
            {bestSeller === p.placement && <span title="Most net-new sales, not most clicks" style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: '#62A758', color: '#FFFFFF', padding: '1px 6px', flexShrink: 0 }}>Sells</span>}
            {bestCtr === p.placement && <span title="Highest click rate. Clicks are not sales, see the Sold column." style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', background: '#E7B02F', color: '#333333', padding: '1px 6px', flexShrink: 0 }}>Clicks</span>}
          </span>
          <span style={{ textAlign: 'right', ...tnum }}>{p.views > 0 ? p.views.toLocaleString() : '–'}</span>
          <span style={{ textAlign: 'right', fontWeight: 700, ...tnum }}>{p.clicks.toLocaleString()}</span>
          <span style={{ textAlign: 'right', fontWeight: 700, color: '#046BB1', ...tnum }}>{p.views > 0 ? `${((p.clicks / p.views) * 100).toFixed(1)}%` : '–'}</span>
          <span style={{ textAlign: 'right', fontWeight: 700, color: p.sales > 0 ? '#62A758' : MUTE, ...tnum }}>{p.sales > 0 ? p.sales.toLocaleString() : '–'}</span>
          <span style={{ textAlign: 'right', fontWeight: 700, color: p.revenue > 0 ? '#62A758' : MUTE, ...tnum }}>{p.revenue > 0 ? `$${p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '–'}</span>
        </div>
      ))}
      </div></div>
    </div>
  )
}
