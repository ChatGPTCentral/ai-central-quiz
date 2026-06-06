'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface Props {
  children: React.ReactNode
}

const NAV_SECTIONS: { label: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    label: 'CRM',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: '◧' },
      { href: '/admin/submissions', label: 'Submissions', icon: '☰' },
      { href: '/admin/in-progress', label: 'In progress', icon: '◴' },
      { href: '/admin/lab', label: 'Enrich', icon: '✨' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/admin/debug', label: 'Debug lookup', icon: '⌖' },
      { href: '/admin/stats', label: 'Stats', icon: '◔' },
      { href: '/admin/flow', label: 'Flow', icon: '⇋' },
    ],
  },
  {
    label: 'Forms',
    items: [
      { href: '/admin/editor', label: 'Editor', icon: '✎' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/admin/settings', label: 'Classifications', icon: '⚙' },
    ],
  },
]

export default function AdminShell({ children }: Props) {
  const pathname = usePathname()
  const [leftCollapsed, setLeftCollapsed] = useState(false)

  // Persist state
  useEffect(() => {
    const l = localStorage.getItem('admin_left_collapsed')
    if (l === '1') setLeftCollapsed(true)
  }, [])
  useEffect(() => { localStorage.setItem('admin_left_collapsed', leftCollapsed ? '1' : '0') }, [leftCollapsed])

  return (
    <div className="min-h-screen bg-[#FFFDFA] flex">
      {/* LEFT SIDEBAR */}
      <aside
        className="sticky top-0 self-start h-screen bg-white border-r border-[#E8E4DF] flex flex-col transition-all duration-200 shrink-0"
        style={{ width: leftCollapsed ? 64 : 224 }}
      >
        {/* Logo area + top-right collapse toggle */}
        <div className="px-3 py-4 border-b border-[#E8E4DF] flex items-center justify-between gap-2">
          {leftCollapsed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo-square.svg" alt="AI Central" className="w-9 h-9 mx-auto" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo-full-light-bg.png" alt="AI Central" className="h-7 w-auto" />
          )}
          {!leftCollapsed && (
            <button
              onClick={() => setLeftCollapsed(true)}
              title="Collapse sidebar"
              className="text-[#9C9C9C] hover:text-[#333333] text-base leading-none px-1.5 py-1 rounded hover:bg-[#F5F5F5]"
            >‹</button>
          )}
        </div>
        {leftCollapsed && (
          <button
            onClick={() => setLeftCollapsed(false)}
            title="Expand sidebar"
            className="mx-auto mt-2 text-[#9C9C9C] hover:text-[#333333] text-base leading-none px-1.5 py-1 rounded hover:bg-[#F5F5F5]"
          >›</button>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-3 overflow-y-auto">
          {NAV_SECTIONS.map(section => (
            <div key={section.label} className="flex flex-col gap-0.5">
              {!leftCollapsed && (
                <p className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C]">
                  {section.label}
                </p>
              )}
              {leftCollapsed && (
                <div className="px-3 pt-1 pb-1 border-t border-[#E8E4DF] first:border-t-0" />
              )}
              {section.items.map(n => {
                const active = pathname.startsWith(n.href)
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    title={n.label}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      active ? 'bg-[#333333] text-[#FFFDFA]' : 'text-[#333333] hover:bg-[#F5F5F5]'
                    } ${leftCollapsed ? 'justify-center' : ''}`}
                  >
                    <span className="text-base shrink-0">{n.icon}</span>
                    {!leftCollapsed && <span className="truncate">{n.label}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 pb-3 flex flex-col gap-1">
          <form action="/api/admin/logout" method="POST">
            <button
              type="submit"
              title="Sign out"
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-[#9C9C9C] hover:bg-[#F5F5F5] hover:text-[#333333] transition-colors ${
                leftCollapsed ? 'justify-center' : ''
              }`}
            >
              <span className="shrink-0">↩</span>
              {!leftCollapsed && <span>Sign out</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* CENTER CONTENT — pages can render their own right-side panel inside */}
      <main className="flex-1 min-w-0">{children}</main>
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
