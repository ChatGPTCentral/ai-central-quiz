'use client'

import { useEffect, useRef } from 'react'

// Confetti bursts on result v2: one on page load, one when the "You made
// it" pass section scrolls into view. Hand-rolled canvas (zero deps),
// fired once per instance. Skipped for prefers-reduced-motion.

const COLORS = ['#E7B02F', '#E48715', '#62A758', '#046BB1', '#3B4C99', '#FEF7E7']

interface P { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; color: string; life: number }

function burst(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = (canvas.width = window.innerWidth)
  const H = (canvas.height = window.innerHeight)

  const parts: P[] = []
  const spawn = (x: number, y: number, angle: number, spread: number, n: number, speed: number) => {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread
      const v = speed * (0.55 + Math.random() * 0.75)
      parts.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 1,
      })
    }
  }
  spawn(0, H * 0.62, -Math.PI / 3.2, 0.9, 60, 15)          // left cannon →
  spawn(W, H * 0.62, Math.PI + Math.PI / 3.2, 0.9, 60, 15) // right cannon ←
  spawn(W / 2, H * 0.25, Math.PI / 2, Math.PI, 50, 8)      // top-center shower

  const t0 = performance.now()
  const tick = (t: number) => {
    const elapsed = (t - t0) / 1000
    ctx.clearRect(0, 0, W, H)
    let alive = false
    for (const p of parts) {
      p.vy += 0.32       // gravity
      p.vx *= 0.985
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      p.life = Math.max(0, 1 - elapsed / 2.4)
      if (p.life <= 0 || p.y > H + 30) continue
      alive = true
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.globalAlpha = Math.min(1, p.life * 1.6)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    if (alive) requestAnimationFrame(tick)
    else canvas.remove()
  }
  requestAnimationFrame(tick)
}

function fireOnce() {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:80'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  burst(canvas)
}

export default function Confetti({ onLoad = false }: { onLoad?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const fired = useRef(false)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    if (onLoad) {
      if (fired.current) return
      fired.current = true
      const t = setTimeout(fireOnce, 350)
      return () => clearTimeout(t)
    }

    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (!e.isIntersecting || fired.current) continue
          fired.current = true
          obs.disconnect()
          fireOnce()
          return
        }
      },
      { threshold: 0.35 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [onLoad])

  if (onLoad) return null
  // Invisible sentinel — parent places it inside the celebrated section.
  return <div ref={ref} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
}
