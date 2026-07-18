// Minimal analytics dispatcher (funnel handoff "Analytics events").
// Every event goes to TWO sinks:
//   1. window.dataLayer (for a tag manager / Clarity segmentation, if present)
//   2. /api/events via lib/events-client → the first-party funnel_events
//      table. The server keeps an event-name allowlist, so any track() call
//      outside the known funnel vocabulary persists nowhere — safe default.
// Never throws — analytics must not break the funnel.

import { sendEvent } from './events-client'

// LinkedIn Insight Tag event-conversions: map a funnel event → a LinkedIn
// conversion id (numeric, from Campaign Manager). Set per-conversion via env
// so LinkedIn can COUNT + OPTIMIZE toward quiz milestones on ads that drive
// here. No-op until the matching env var is set; never throws.
const LI_CONVERSIONS: Record<string, string | undefined> = {
  result_view: process.env.NEXT_PUBLIC_LI_CONV_QUIZ_COMPLETE, // reached scored result = quiz completed
  email_submitted: process.env.NEXT_PUBLIC_LI_CONV_QUIZ_LEAD, // gave email = lead (optional)
}

function fireLinkedInConversion(event: string): void {
  const id = LI_CONVERSIONS[event]
  if (!id) return
  try {
    const w = window as unknown as { lintrk?: (a: string, b: Record<string, unknown>) => void }
    if (typeof w.lintrk === 'function') w.lintrk('track', { conversion_id: Number(id) })
  } catch { /* non-fatal */ }
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const w = window as unknown as { dataLayer?: Record<string, unknown>[] }
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push({ event, ...props })
  } catch { /* non-fatal */ }
  // Fire a LinkedIn conversion for mapped milestone events (env-gated).
  fireLinkedInConversion(event)
  // Promote a submission id when the caller provides one so the event can
  // be joined to the submissions row server-side.
  const sid = props && typeof props.submissionId === 'string' ? props.submissionId : undefined
  sendEvent(event, { props, submissionId: sid })
}
