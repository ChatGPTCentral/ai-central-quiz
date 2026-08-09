'use client'

import { useEffect } from 'react'
import { identifyPerson } from '@/components/PostHogProvider.client'

// Tags the session with the submission id + page variant, in BOTH Clarity and
// PostHog, so a person's recording is findable and their behaviour is joinable
// to what they did afterwards.
//
// The PostHog half was missing and that was load-bearing. identifyPerson had
// been written and exported but never called anywhere, so PostHog only ever
// knew people by an anonymous device id. The consequence was invisible until
// 2026-08-09: the Stripe webhook fires a `purchase` event keyed on the
// submission id, and with nobody identified by that id it created a BRAND NEW
// person carrying no browsing history. The buyer cohort would have been a list
// of ghosts. Identifying here is what stitches the session to the sale.
export function ClarityTag({ submissionId, variant }: { submissionId?: string; variant: string }) {
  useEffect(() => {
    // PostHog: alias this browser to the submission id, so every event before
    // AND after the purchase belongs to one person.
    identifyPerson({ submissionId })
    try {
      const w = window as unknown as { clarity?: (...args: unknown[]) => void }
      if (typeof w.clarity !== 'function') return
      if (submissionId) {
        w.clarity('identify', submissionId)
        w.clarity('set', 'submissionId', submissionId)
      }
      w.clarity('set', 'pageVariant', variant)
    } catch { /* non-fatal */ }
  }, [submissionId, variant])
  return null
}
