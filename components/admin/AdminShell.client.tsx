'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import CommandPalette from './CommandPalette.client'

interface Props {
  children: React.ReactNode
}

// ── Attio-grade admin shell (design: "Admin section redesign" 1a/1g) ──
// Warm paper sidebar, sectioned nav, active item as a raised white card,
// lucide-style line icons, ⌘K search affordance. Routes are the real
// admin pages; nothing here is a dead control.

type IconName =
  | 'dashboard' | 'funnel' | 'experiments' | 'roadmap' | 'people' | 'board' | 'inprogress' | 'simulator'
  | 'enrich' | 'debug' | 'stats' | 'flow' | 'editor' | 'settings' | 'ads'

function Icon({ name, active }: { name: IconName; active?: boolean }) {
  // On the jet-black sidebar: inactive icons battleship grey, active rich
  // black (they sit on the paper active plate).
  const c = active ? '#1A1A1A' : '#9C9C9C'
  const p = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (name) {
    case 'dashboard': return <svg {...p}><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
    case 'funnel': return <svg {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
    case 'experiments': return <svg {...p}><path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.6a1 1 0 0 0 .9 1.4h12.8a1 1 0 0 0 .9-1.4l-5.1-10.2a2 2 0 0 1-.2-.9V2" /><path d="M8.5 2h7" /><path d="M7 16h10" /></svg>
    case 'roadmap': return <svg {...p}><path d="M12 13v8" /><path d="M12 3v3" /><path d="M4 6h13a1 1 0 0 1 .78.37l2.4 3a1 1 0 0 1 0 1.26l-2.4 3a1 1 0 0 1-.78.37H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" /></svg>
    case 'simulator': return <svg {...p}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8" /><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8" /></svg>
    case 'people': return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    case 'board': return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18" /></svg>
    case 'inprogress': return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    case 'enrich': return <svg {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></svg>
    case 'debug': return <svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
    case 'stats': return <svg {...p}><path d="M21.2 15.9A10 10 0 1 1 8 2.8" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>
    case 'flow': return <svg {...p}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4v5a4 4 0 0 1-4 4H6" /></svg>
    case 'editor': return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
    case 'ads': return <svg {...p}><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></svg>
    case 'settings': return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
  }
}

const GROUPS: { label?: string; items: { href: string; label: string; icon: IconName }[] }[] = [
  {
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { href: '/admin/experiments', label: 'Experiments', icon: 'experiments' },
      { href: '/admin/pages', label: 'Result pages', icon: 'editor' },
      { href: '/admin/ads', label: 'Ads', icon: 'ads' },
      { href: '/admin/pass-recovery', label: 'Pass Recovery', icon: 'stats' },
      { href: '/admin/simulator', label: 'Simulator', icon: 'simulator' },
      { href: '/admin/roadmap', label: 'Roadmap', icon: 'roadmap' },
    ],
  },
  {
    label: 'Records',
    items: [
      { href: '/admin/submissions', label: 'People', icon: 'people' },
      { href: '/admin/referrers', label: 'Referrers', icon: 'people' },
      { href: '/admin/in-progress', label: 'In progress', icon: 'inprogress' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/admin/lab', label: 'Enrich', icon: 'enrich' },
      { href: '/admin/enrich-game', label: 'Enrich tuner', icon: 'stats' },
      { href: '/admin/debug', label: 'Debug lookup', icon: 'debug' },
      { href: '/admin/flow', label: 'Flow', icon: 'flow' },
      { href: '/admin/editor', label: 'Form editor', icon: 'editor' },
    ],
  },
]

export default function AdminShell({ children }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  // Mobile drawer. Closes on navigation, otherwise tapping a nav item would
  // leave the drawer covering the page you just asked for.
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => { setMobileOpen(false) }, [pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mobileOpen])

  useEffect(() => {
    if (localStorage.getItem('admin_left_collapsed') === '1') setCollapsed(true)
  }, [])
  useEffect(() => { localStorage.setItem('admin_left_collapsed', collapsed ? '1' : '0') }, [collapsed])

  const openPalette = () => window.dispatchEvent(new Event('ac:cmdk'))

  const W = collapsed ? 62 : 240

  // NavPlate: jet-black sidebar, active item = full-width paper plate with a
  // 3px xanthous left bar. Radius 0 everywhere.
  const navItem = (n: { href: string; label: string; icon: IconName }) => {
    const active = pathname === n.href || pathname.startsWith(n.href + '/')
    return (
      <Link
        key={n.href}
        href={n.href}
        title={n.label}
        className="group flex items-center transition-colors"
        style={{
          height: 32,
          gap: 10,
          fontSize: 13,
          fontWeight: active ? 700 : 500,
          color: active ? '#1A1A1A' : 'rgba(255,253,250,0.78)',
          background: active ? '#FFFDFA' : 'transparent',
          borderLeft: `3px solid ${active ? '#E7B02F' : 'transparent'}`,
          padding: collapsed ? '0 0 0 0' : '0 16px 0 16px',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,253,250,0.08)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
      >
        <span className="shrink-0"><Icon name={n.icon} active={active} /></span>
        {!collapsed && <span className="truncate">{n.label}</span>}
      </Link>
    )
  }

  const current = GROUPS.flatMap(g => g.items).find(n => pathname === n.href || pathname.startsWith(n.href + '/'))

  return (
    <div className="ac-admin min-h-screen flex" style={{ background: '#FFFDFA' }}>
      {/* Mobile top bar — the sidebar is a 240px fixed column, which on a phone
          left almost no room for content. Below 900px it becomes a drawer and
          this bar carries the menu button and the current page name. */}
      <div className="ac-topbar">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="ac-burger">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFDFA" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.svg" alt="" style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFDFA', letterSpacing: '-0.01em' }}>{current?.label ?? 'Admin'}</span>
        <button onClick={openPalette} aria-label="Search people" className="ac-topsearch">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9C9C9C" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
        </button>
      </div>
      {mobileOpen && <div className="ac-scrim" onClick={() => setMobileOpen(false)} aria-hidden />}

      <aside
        className={`ac-side sticky top-0 self-start h-screen flex flex-col shrink-0 transition-all duration-200${mobileOpen ? ' ac-side--open' : ''}`}
        style={{ width: W, background: '#333333' }}
      >
        {/* Brand + collapse */}
        <div className="flex items-center justify-between gap-2" style={{ padding: collapsed ? '16px 8px 12px' : '16px 16px 12px' }}>
          {collapsed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo-light.svg" alt="AI Central" style={{ width: 26, height: 26, margin: '0 auto' }} />
          ) : (
            <div className="flex items-center min-w-0" style={{ gap: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-light.svg" alt="" style={{ width: 28, height: 28, display: 'block' }} />
              <div className="min-w-0" style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#FFFDFA', letterSpacing: '-0.01em' }}>AI Central</div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#E7B02F', marginTop: 1 }}>Admin console</div>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
            className="leading-none"
            style={{ color: '#9C9C9C', fontSize: 15, padding: '2px 5px' }}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,253,250,0.14)', margin: collapsed ? '0 8px' : '0 16px' }} />

        {/* Search plate / ⌘K affordance */}
        <button
          onClick={openPalette}
          title="Search people (⌘K)"
          className="flex items-center"
          style={{ margin: collapsed ? '14px 8px' : '14px 16px', height: 32, gap: 8, background: 'rgba(255,253,250,0.07)', border: '1px solid rgba(255,253,250,0.22)', borderRadius: 0, padding: collapsed ? 0 : '0 10px', justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9C9C9C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          {!collapsed && <>
            <span style={{ fontSize: 12, color: 'rgba(255,253,250,0.55)' }}>Search people</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 600, color: 'rgba(255,253,250,0.6)', border: '1px solid rgba(255,253,250,0.25)', padding: '1px 5px' }}>⌘K</span>
          </>}
        </button>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto flex flex-col" style={{ padding: '0 0 12px' }}>
          {GROUPS.map((g, i) => (
            <div key={g.label ?? i} className="flex flex-col">
              {g.label && !collapsed && (
                <p style={{ margin: '14px 0 4px', padding: '0 16px 0 19px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9C9C9C' }}>{g.label}</p>
              )}
              {g.label && collapsed && <div style={{ borderTop: '1px solid rgba(255,253,250,0.14)', margin: '10px 8px 6px' }} />}
              {g.items.map(navItem)}
            </div>
          ))}
        </nav>

        {/* Footer: settings + identity + sign out */}
        <div style={{ borderTop: '1px solid rgba(255,253,250,0.14)', padding: '10px 0 12px' }}>
          {navItem({ href: '/admin/settings', label: 'Classifications', icon: 'settings' })}
          <div className="flex items-center" style={{ gap: 9, padding: collapsed ? '10px 0 0' : '10px 16px 0 19px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <span className="flex items-center justify-center shrink-0" style={{ width: 26, height: 26, background: '#FEF7E7', color: '#333333', fontSize: 10, fontWeight: 800 }}>AC</span>
            {!collapsed && (
              <div className="min-w-0" style={{ lineHeight: 1.25 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#FFFDFA' }}>Admin</div>
                <div style={{ fontSize: 10, color: '#9C9C9C' }}>Signed in</div>
              </div>
            )}
            <form action="/api/admin/logout" method="POST" className={collapsed ? 'hidden' : 'ml-auto'}>
              <button type="submit" title="Sign out" style={{ color: '#9C9C9C', padding: 4 }} className="hover:text-[#FFFDFA]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="ac-main flex-1 min-w-0" style={{ background: '#FFFDFA' }}>{children}</main>
      <CommandPalette />

      <style>{`
        .ac-topbar, .ac-scrim { display: none; }
        @media (max-width: 900px) {
          .ac-topbar {
            display: flex; align-items: center; gap: 10px;
            position: fixed; top: 0; left: 0; right: 0; z-index: 60;
            height: 52px; padding: 0 12px; background: #333333;
            border-bottom: 1px solid rgba(255,253,250,0.14);
          }
          .ac-burger { padding: 6px; margin-left: -2px; line-height: 0; }
          .ac-topsearch { margin-left: auto; padding: 6px; line-height: 0; }
          .ac-scrim {
            display: block; position: fixed; inset: 0; z-index: 70;
            background: rgba(20,15,5,0.5);
          }
          /* Drawer: off-canvas until opened, never squeezing the content column */
          .ac-side {
            position: fixed !important; top: 0; left: 0; z-index: 80;
            width: 262px !important;
            transform: translateX(-100%);
            transition: transform .22s ease;
          }
          .ac-side--open { transform: translateX(0); box-shadow: 0 0 40px rgba(0,0,0,.4); }
          .ac-main { padding-top: 52px; }
          .ac-main > * { max-width: 100vw; }
          /* Every admin page hardcodes a 36px side padding inline, which on a
             390px screen spends a fifth of the width on margins. A stylesheet
             !important beats a plain inline declaration, so this tightens all
             of them at once without touching ten files. */
          .ac-main header { padding-left: 16px !important; padding-right: 16px !important; }
          .ac-main h1 { font-size: 22px !important; }
        }
        @media (prefers-reduced-motion: reduce) { .ac-side { transition: none; } }
      `}</style>
    </div>
  )
}

/**
 * Right sidebar that pages render inside their own content area.
 * Used by /admin/dashboard for the filter panel.
 */
export function RightSidebar({
  title = 'Filters',
  children,
  storageKey = 'admin_right_collapsed',
}: {
  title?: string
  children: React.ReactNode
  storageKey?: string
}) {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => { if (localStorage.getItem(storageKey) === '1') setCollapsed(true) }, [storageKey])
  useEffect(() => { localStorage.setItem(storageKey, collapsed ? '1' : '0') }, [collapsed, storageKey])
  return (
    <aside
      className="sticky top-0 self-start h-screen bg-white border-l border-[#E8E4DF] flex flex-col transition-all duration-200 shrink-0"
      style={{ width: collapsed ? 44 : 288 }}
    >
      <div className="flex items-center justify-between px-3 py-4 border-b border-[#E8E4DF]">
        {!collapsed && <span className="text-xs font-bold uppercase tracking-widest text-[#9C9C9C]">{title}</span>}
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="text-[#9C9C9C] hover:text-[#333333] text-base leading-none ml-auto"
        >
          {collapsed ? '‹' : '›'}
        </button>
      </div>
      {!collapsed && <div className="flex-1 overflow-y-auto p-5">{children}</div>}
    </aside>
  )
}
