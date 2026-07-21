'use client'

import { useEffect, useRef, useState } from 'react'
import AdvancedFilter from '@/app/admin/submissions/AdvancedFilter.client'
import DashboardBento, { type BentoRow, type FunnelEventCounts, type PlacementStat, type Series } from './DashboardBento.client'

// Owns the shared Numbers/Percentages state and hosts the compact header control
// cluster (Launch/All · N/% · Segments · Export) so the segment builder no longer
// eats a full-width strip at the top — it drops down from a button next to Export.
export default function DashboardArea({
  rows, sample, funnelEvents, placements, series, exportHref, launchLabel, rangeLabel, searchParamsStr, error,
}: {
  rows: BentoRow[]; sample: 'launch' | 'all'; funnelEvents: FunnelEventCounts; placements: PlacementStat[]
  series: Series; exportHref: string; launchLabel: string; rangeLabel: string; searchParamsStr: string; error: string | null
}) {
  const [pct, setPct] = useState(true)
  const [segOpen, setSegOpen] = useState(false)
  const segRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!segOpen) return
    const close = (e: MouseEvent) => { if (segRef.current && !segRef.current.contains(e.target as Node)) setSegOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [segOpen])

  const sampleHref = (s: 'launch' | 'all') => {
    const p = new URLSearchParams(searchParamsStr)
    p.set('sample', s); p.delete('offset')
    return `/admin/dashboard?${p.toString()}`
  }

  return (
    <div>
      <header className="flex items-end justify-between flex-wrap" style={{ padding: '22px 36px 14px', gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9C9C9C', marginBottom: 4 }}>
            Overview · {sample === 'launch' ? 'launch cohort' : 'all records'} · {rangeLabel} · one datasource for every number
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: '#1A1A1A' }}>Dashboard</h1>
          {error && <p style={{ fontSize: 12.5, color: '#BE3B3B', marginTop: 6 }}>Error: {error}</p>}
        </div>

        {/* Compact control cluster */}
        <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
          <div className="inline-flex" style={{ border: '1px solid #333333' }}>
            <a href={sampleHref('launch')} style={{ padding: '7px 12px', fontSize: 12, fontWeight: 700, background: sample === 'launch' ? '#333333' : 'transparent', color: sample === 'launch' ? '#FFFDFA' : '#6B6B6B' }}>Launch ({launchLabel}+)</a>
            <a href={sampleHref('all')} style={{ padding: '7px 12px', fontSize: 12, fontWeight: 700, borderLeft: '1px solid #333333', background: sample === 'all' ? '#333333' : 'transparent', color: sample === 'all' ? '#FFFDFA' : '#6B6B6B' }}>All data</a>
          </div>
          <div className="inline-flex" style={{ border: '1px solid #333333' }}>
            <button onClick={() => setPct(false)} style={{ padding: '7px 11px', fontSize: 12, fontWeight: 700, background: !pct ? '#333333' : 'transparent', color: !pct ? '#FFFDFA' : '#6B6B6B' }}>Numbers</button>
            <button onClick={() => setPct(true)} style={{ padding: '7px 11px', fontSize: 12, fontWeight: 700, borderLeft: '1px solid #333333', background: pct ? '#333333' : 'transparent', color: pct ? '#FFFDFA' : '#6B6B6B' }}>%</button>
          </div>
          <div ref={segRef} className="relative inline-block">
            <button onClick={() => setSegOpen(o => !o)} style={{ padding: '7px 13px', fontSize: 12, fontWeight: 700, border: '1px solid #333333', background: segOpen ? '#FEF7E7' : '#FFFDFA' }}>Segments ▾</button>
          </div>
          <a href={exportHref} style={{ padding: '7px 13px', fontSize: 12, fontWeight: 700, background: '#333333', color: '#FFFDFA' }}>Export csv ↗</a>
        </div>
      </header>

      {/* Segment builder drops down full-width only when opened (collapsed by
          default → no permanent top strip). */}
      {segOpen && (
        <div style={{ padding: '0 36px 8px' }}>
          <div style={{ border: '1px solid #333333', background: '#FFFFFF' }}>
            <div style={{ padding: '9px 14px', background: '#FEF7E7', borderBottom: '1px solid #333333', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#1A1A1A' }}>Segments · build &amp; save</div>
            <div style={{ padding: '10px 14px' }}><AdvancedFilter /></div>
          </div>
        </div>
      )}

      <div style={{ padding: '0 36px 44px' }}>
        <DashboardBento rows={rows} sample={sample} funnelEvents={funnelEvents} placements={placements} series={series} pct={pct} />
      </div>
    </div>
  )
}
