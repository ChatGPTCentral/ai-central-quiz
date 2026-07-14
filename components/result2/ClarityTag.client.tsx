'use client'

import { useEffect } from 'react'

// Tags the Clarity session with the submission id + page variant, so a
// person's recording is findable in the Clarity dashboard (filter recordings
// by the submissionId custom tag) and we can tell which result page they saw.
export function ClarityTag({ submissionId, variant }: { submissionId?: string; variant: string }) {
  useEffect(() => {
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
