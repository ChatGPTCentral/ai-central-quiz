// Minimal analytics dispatcher (funnel handoff "Analytics events").
// Every event goes to TWO sinks:
//   1. window.dataLayer (for a tag manager / Clarity segmentation, if present)
//   2. /api/events via lib/events-client → the first-party funnel_events
//      table. The server keeps an event-name allowlist, so any track() call
//      outside the known funnel vocabulary persists nowhere — safe default.
// Never throws — analytics must not break the funnel.

import { sendEvent } from './events-client'

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const w = window as unknown as { dataLayer?: Record<string, unknown>[] }
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push({ event, ...props })
  } catch { /* non-fatal */ }
  // Promote a submission id when the caller provides one so the event can
  // be joined to the submissions row server-side.
  const sid = props && typeof props.submissionId === 'string' ? props.submissionId : undefined
  sendEvent(event, { props, submissionId: sid })
}
