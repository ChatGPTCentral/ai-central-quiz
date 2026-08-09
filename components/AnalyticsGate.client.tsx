'use client'

// One gate in front of every third-party tag, so "exclude my laptop" means
// ALL of them and not just the one we remembered.
//
// Clarity and the LinkedIn Insight Tag used to be inline <Script> blocks in the
// root layout, which is a server component and therefore cannot see a
// per-device flag. They live here now. PostHog gates itself in its own provider
// using the same helper.
//
// The tags are injected imperatively inside an effect rather than rendered as
// JSX. That is deliberate. Rendering a tag conditionally on a value that only
// exists in the browser means the server HTML and the first client render
// disagree, which is exactly the hydration failure that silently broke the
// wheel arm on 2026-08-07. An effect runs after hydration, so there is no
// mismatch to have, and "afterInteractive" is what the Script strategy meant
// anyway.

import { useEffect, useState } from 'react'
import { resolveAnalyticsOptOut } from '@/lib/analytics-optout'

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void
    lintrk?: { (a: unknown, b?: unknown): void; q?: unknown[] }
    _linkedin_partner_id?: string
    _linkedin_data_partner_ids?: string[]
  }
}

function loadClarity(id: string) {
  if (document.getElementById('ms-clarity')) return
  const s = document.createElement('script')
  s.id = 'ms-clarity'
  s.async = true
  s.src = `https://www.clarity.ms/tag/${id}`
  document.head.appendChild(s)
  // Clarity's own snippet defines this queue before the tag lands. Without it
  // any clarity(...) call made in the gap throws.
  if (!window.clarity) {
    const q: unknown[] = []
    window.clarity = ((...args: unknown[]) => { q.push(args) }) as Window['clarity']
  }
}

function loadLinkedIn(partnerId: string) {
  if (document.getElementById('linkedin-insight')) return
  window._linkedin_partner_id = partnerId
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || []
  window._linkedin_data_partner_ids.push(partnerId)
  if (!window.lintrk) {
    const queue: unknown[] = []
    const fn = (a: unknown, b?: unknown) => { queue.push([a, b]) }
    window.lintrk = Object.assign(fn, { q: queue })
  }
  const s = document.createElement('script')
  s.id = 'linkedin-insight'
  s.async = true
  s.src = 'https://snap.licdn.com/li.lms-analytics/insight.min.js'
  document.head.appendChild(s)
}

export default function AnalyticsGate() {
  const [notice, setNotice] = useState<'off' | 'on' | null>(null)

  useEffect(() => {
    const { optedOut, justChanged, changedTo } = resolveAnalyticsOptOut()

    if (justChanged) {
      setNotice(changedTo)
      const t = setTimeout(() => setNotice(null), 6000)
      // Nothing else to do on the load that flipped the switch to "off": the
      // tags below are skipped, and anything already running is stopped.
      if (optedOut) {
        try { window.clarity?.('stop') } catch { /* tag may not be present */ }
      }
      if (changedTo === 'off') return () => clearTimeout(t)
    }

    if (optedOut) {
      // Belt and braces for a device that loaded the tags before opting out.
      try { window.clarity?.('stop') } catch { /* tag may not be present */ }
      return
    }

    const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
    if (clarityId) loadClarity(clarityId)

    // Defaults to the AI Central Media tag so it works on deploy; override or
    // disable via NEXT_PUBLIC_LINKEDIN_PARTNER_ID. Conversion EVENTS are fired
    // from lib/track.ts once the matching NEXT_PUBLIC_LI_CONV_* var holds the
    // Campaign Manager id.
    const liPartnerId = process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID || '5552676'
    if (liPartnerId) loadLinkedIn(liPartnerId)
  }, [])

  if (!notice) return null

  // Only ever shown to whoever just typed the parameter. Confirmation matters:
  // an invisible switch you cannot verify is a switch you stop trusting.
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 2147483647,
        background: '#1A1A1A',
        color: '#FFFFFF',
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 13,
        fontWeight: 600,
        maxWidth: 320,
        lineHeight: 1.4,
        boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
      }}
    >
      {notice === 'off'
        ? 'Analytics OFF on this device. No recordings, no events, no ad pixel.'
        : 'Analytics back ON for this device.'}
    </div>
  )
}
