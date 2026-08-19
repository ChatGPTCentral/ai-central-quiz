'use client'

import { useRef, useState } from 'react'

// Pan/zoom shell for the funnel board. Deliberately thin: the board itself is
// SVG rendered on the server from live data, so what you drag around is the
// real thing, not a picture of it. Wheel to zoom, drag to pan, or use the
// buttons — and the board is fully readable with no interaction at all.
export default function XrayCanvas({
  width, height, children,
}: { width: number; height: number; children: React.ReactNode }) {
  const [z, setZ] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const clamp = (v: number) => Math.min(2.2, Math.max(0.35, v))
  const btn: React.CSSProperties = {
    border: '2px solid #1A1A1A', background: '#FFFDFA', color: '#1A1A1A',
    fontWeight: 800, fontSize: 13, width: 30, height: 28, cursor: 'pointer', lineHeight: 1,
  }

  return (
    <div style={{ position: 'relative', border: '2px solid #1A1A1A', background: '#FBF7EE', overflow: 'hidden', height: '76vh', minHeight: 520 }}>
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, display: 'flex', gap: 6 }}>
        <button style={btn} onClick={() => setZ(v => clamp(v + 0.15))} aria-label="Zoom in">+</button>
        <button style={btn} onClick={() => setZ(v => clamp(v - 0.15))} aria-label="Zoom out">−</button>
        <button style={{ ...btn, width: 54, fontSize: 11 }} onClick={() => { setZ(1); setPan({ x: 0, y: 0 }) }}>reset</button>
      </div>
      <div style={{ position: 'absolute', bottom: 10, left: 12, zIndex: 5, fontSize: 11, color: '#75705F' }}>
        drag to pan · wheel to zoom · {Math.round(z * 100)}%
      </div>
      <div
        style={{ width: '100%', height: '100%', cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        onWheel={e => { setZ(v => clamp(v - e.deltaY * 0.0012)) }}
        onPointerDown={e => {
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={e => {
          if (!drag.current) return
          setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) })
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerLeave={() => { drag.current = null }}
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${z})`, transformOrigin: '0 0', width, height }}>
          {children}
        </div>
      </div>
    </div>
  )
}
