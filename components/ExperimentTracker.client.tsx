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
      // Tag the session with the variant so recordings and every later event
      // can be filtered per arm.
      //
      // BOTH tools, because the PostHog side is what survives Clarity being
      // retired. register() puts the variant on every subsequent event from
      // this session, which is strictly better than a Clarity custom tag: it
      // filters replays AND makes "did this arm convert" answerable in a
      // query, which a recording filter never could.
      try {
        const w = window as unknown as {
          clarity?: (cmd: string, k: string, v: string) => void
          posthog?: { register?: (p: Record<string, unknown>) => void; capture?: (e: string, p?: Record<string, unknown>) => void }
        }
        w.clarity?.('set', 'experiment', `${a.experimentKey}:${a.variantKey}`)
        w.posthog?.register?.({ experiment: a.experimentKey, variant: a.variantKey })
        // An explicit exposure event, so arm balance and arm conversion are
        // both answerable from PostHog alone. The six-hour watcher reads this.
        w.posthog?.capture?.('experiment_exposure', {
          experiment: a.experimentKey,
          variant: a.variantKey,
          submissionId,
        })
      } catch { /* non-fatal */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
