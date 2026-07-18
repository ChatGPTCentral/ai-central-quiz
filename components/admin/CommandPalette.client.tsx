'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { stageDef } from '@/lib/segmentation-v2'
import Avatar from '@/components/admin/Avatar.client'

// ── ⌘K command palette (design "Admin section redesign" 1f) ──
// Search people, run actions on the top match, jump anywhere. Opened by
// ⌘K / Ctrl-K (listener lives here). Keyboard-driven: ↑↓ move, ↵ run, esc close.

interface Person { id: string; name?: string | null; email: string; jobTitle?: string | null; company?: string | null; stage?: string | null; photoUrl?: string | null }

const NAV = [
  { label: 'Go to Dashboard', href: '/admin/dashboard', keys: 'G D' },
  { label: 'Go to Experiments', href: '/admin/experiments', keys: 'G E' },
  { label: 'Go to People', href: '/admin/submissions', keys: 'G P' },
]

type Item =
  | { kind: 'person'; person: Person }
  | { kind: 'action'; label: string; run: () => void; keys?: string }
  | { kind: 'nav'; label: string; href: string; keys?: string }

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global ⌘K / Ctrl-K + the sidebar Search button (custom event)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('ac:cmdk', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('ac:cmdk', onOpen) }
  }, [])

  useEffect(() => {
    if (open) { setQ(''); setPeople([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 20) }
  }, [open])

  // Debounced people search
  useEffect(() => {
    if (!open) return
    const query = q.trim()
    if (query.length < 2) { setPeople([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/people-search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        const data = await res.json()
        setPeople(Array.isArray(data.people) ? data.people : [])
        setActive(0)
      } catch { /* aborted or failed */ }
    }, 160)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, open])

  const top = people[0]
  const items: Item[] = useMemo(() => {
    const out: Item[] = []
    people.forEach(p => out.push({ kind: 'person', person: p }))
    if (top) {
      out.push({ kind: 'action', label: `Enrich ${top.name || top.email} — full pipeline`, keys: '⌘E', run: () => go('/admin/lab') })
      out.push({ kind: 'action', label: `Copy email — ${top.email}`, run: () => { navigator.clipboard?.writeText(top.email).catch(() => {}); setOpen(false) } })
    }
    NAV.filter(n => !q || n.label.toLowerCase().includes(q.toLowerCase())).forEach(n => out.push({ kind: 'nav', label: n.label, href: n.href, keys: n.keys }))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, q])

  const go = (href: string) => { setOpen(false); router.push(href) }
  const runItem = (it: Item) => {
    if (it.kind === 'person') go(`/admin/submissions/${it.person.id}`)
    else if (it.kind === 'action') it.run()
    else go(it.href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[active]; if (it) runItem(it) }
  }

  if (!open) return null

  // Group boundaries for section labels
  const firstAction = items.findIndex(i => i.kind === 'action')
  const firstNav = items.findIndex(i => i.kind === 'nav')

  const Label = ({ children }: { children: React.ReactNode }) => (
    <div style={{ padding: '10px 16px 5px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9C9C9C' }}>{children}</div>
  )

  return (
    <div className="fixed inset-0 z-[100]" style={{ background: 'rgba(26,26,26,0.45)' }} onMouseDown={() => setOpen(false)}>
      <div
        className="absolute left-1/2"
        style={{ top: 72, transform: 'translateX(-50%)', width: 620, maxWidth: 'calc(100vw - 32px)', background: '#FFFDFA', border: '1px solid #E8E4DF', borderRadius: 6, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden' }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5" style={{ padding: '14px 16px', borderBottom: '1px solid #E8E4DF' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9C9C9C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search people, run actions, jump anywhere…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: '#1A1A1A' }}
          />
          <span style={{ fontSize: 10, color: '#9C9C9C', border: '1px solid #E8E4DF', borderRadius: 3, padding: '2px 6px' }}>esc</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 380, overflowY: 'auto', paddingBottom: 6 }}>
          {items.length === 0 && (
            <p style={{ padding: '20px 16px', fontSize: 13, color: '#9C9C9C' }}>{q.trim().length < 2 ? 'Type to search people…' : 'No matches'}</p>
          )}
          {items.map((it, i) => {
            const isActive = i === active
            const label = it.kind === 'person'
              ? <span className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={it.person.name} email={it.person.email} photoUrl={it.person.photoUrl} size={22} />
                  <span className="min-w-0">
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1A1A1A' }}>{it.person.name || it.person.email}</span>
                    <span className="truncate" style={{ fontSize: 12, color: '#9C9C9C', marginLeft: 8 }}>{[it.person.jobTitle, it.person.company].filter(Boolean).join(' · ')}</span>
                  </span>
                </span>
              : <span style={{ fontSize: 13.5, color: '#1A1A1A' }}>{it.label}</span>
            const keys = it.kind === 'nav' ? it.keys : it.kind === 'action' ? it.keys : undefined
            const stg = it.kind === 'person' ? stageDef(it.person.stage) : null
            return (
              <div key={i}>
                {i === 0 && it.kind === 'person' && <Label>People</Label>}
                {i === firstAction && firstAction >= 0 && <Label>Actions</Label>}
                {i === firstNav && firstNav >= 0 && <Label>Navigate</Label>}
                <div
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runItem(it)}
                  className="flex items-center justify-between gap-3 cursor-pointer"
                  style={{ margin: '0 6px', padding: '9px 10px', borderRadius: 5, background: isActive ? '#FBF3E0' : 'transparent', borderLeft: isActive ? '2px solid #E7B02F' : '2px solid transparent' }}
                >
                  {label}
                  <span className="flex items-center gap-2 shrink-0">
                    {stg && stg.key !== 'unknown' && <span style={{ fontSize: 11.5, color: stg.color, fontWeight: 600 }}>{stg.label}</span>}
                    {keys && <span style={{ fontSize: 10.5, color: '#9C9C9C', border: '1px solid #E8E4DF', borderRadius: 3, padding: '1px 5px' }}>{keys}</span>}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between" style={{ padding: '8px 16px', borderTop: '1px solid #E8E4DF', fontSize: 11, color: '#9C9C9C' }}>
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>{q.trim().length >= 2 ? `${people.length} people` : 'Search'}</span>
        </div>
      </div>
    </div>
  )
}
