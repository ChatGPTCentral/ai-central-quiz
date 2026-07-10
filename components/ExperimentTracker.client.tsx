'use client'

import { useEffect, useRef } from 'react'
import { sendEvent } from '@/lib/events-client'

/**
 * Exposure beacon for experiment assignments (TrackView pattern).
 *
 * Fired client-side on mount — this dedupes per session, naturally excludes
 * non-JS bots from denominators, and goes through fetch (not sendBeacon) so
 * the response's Set-Cookie (the sticky ac_exp_* variant cookie) is applied
 * deterministically.
 */
export default function ExperimentTracker({
  assignments,
  submissionId,
}: {
  assignments: { experimentKey: string; variantKey: string }[]
  submissionId?: string
}) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current || assignments.length === 0) return
    fired.current = true
    for (const a of assignments) {
      try {
        const seenKey = `ac_exp_seen_${a.experimentKey}`
        if (sessionStorage.getItem(seenKey)) continue
        sessionStorage.setItem(seenKey, '1')
      } catch { /* storage blocked — fire anyway */ }
      sendEvent('exposure', {
        experimentKey: a.experimentKey,
        variantKey: a.variantKey,
        submissionId,
        viaFetch: true,
      })
      // Tag the Clarity session with the variant so recordings/heatmaps can
      // be filtered per variant (Filters → Custom tags → experiment).
      try {
        const w = window as unknown as { clarity?: (cmd: string, k: string, v: string) => void }
        w.clarity?.('set', 'experiment', `${a.experimentKey}:${a.variantKey}`)
      } catch { /* non-fatal */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
