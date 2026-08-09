// Keep our own testing out of the analytics.
//
// WHY THIS EXISTS. At current volume the owner's own testing is not noise, it
// is most of the data. On the day PostHog went live it captured three sessions
// and at least one of them was the owner clicking through a result page. A
// replay scanner pointed at that corpus would spend real credits writing
// reports about us, and every funnel number would be measuring the person
// reading it.
//
// The gate is per DEVICE and deliberately durable, because the alternatives are
// worse:
//   - The admin cookie is httpOnly, so client JavaScript cannot read it, and
//     reading it in the root layout would opt every page out of static
//     rendering for all 45,000 readers to catch one person.
//   - Testing usually happens logged OUT, as a visitor, which is the whole
//     point of testing. So "is an admin" would miss exactly the sessions we
//     most want to drop.
//   - A device flag also covers the phone, which is where most of the real
//     traffic is and where the owner checks mobile layout.
//
// Turning it on: visit any page with ?ac_track=off, once per device.
// Turning it off again: ?ac_track=on.
// ?test=1, which already marks a submission as a test, now also suppresses
// analytics for that page load, so the existing habit does the right thing
// without anybody having to remember a second parameter.

const STORAGE_KEY = 'ac_analytics_off'

export type OptOutState = {
  /** True when nothing should be captured on this device. */
  optedOut: boolean
  /** True when this page load is what changed the setting, so we can say so. */
  justChanged: boolean
  /** What it was changed to, for the confirmation message. */
  changedTo: 'off' | 'on' | null
}

/**
 * Decide whether analytics may run, and honour any switch in the URL.
 *
 * Safe to call only on the client. Never throws: a browser with storage
 * disabled falls back to "capture", because silently dropping everyone's data
 * would be a far worse failure than recording one extra owner session.
 */
export function resolveAnalyticsOptOut(): OptOutState {
  if (typeof window === 'undefined') return { optedOut: false, justChanged: false, changedTo: null }

  let params: URLSearchParams
  try {
    params = new URLSearchParams(window.location.search)
  } catch {
    return { optedOut: false, justChanged: false, changedTo: null }
  }

  // A test run is a test run. Not persisted: it applies to this load only, so
  // ?test=1 never accidentally blinds a device for good.
  if (params.get('test') === '1') {
    return { optedOut: true, justChanged: false, changedTo: null }
  }

  const switched = params.get('ac_track')
  if (switched === 'off' || switched === 'on') {
    const off = switched === 'off'
    try {
      if (off) window.localStorage.setItem(STORAGE_KEY, '1')
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage blocked. The switch cannot be made to stick, so say nothing
      // rather than claim success.
      return { optedOut: off, justChanged: false, changedTo: null }
    }
    return { optedOut: off, justChanged: true, changedTo: switched }
  }

  try {
    return { optedOut: window.localStorage.getItem(STORAGE_KEY) === '1', justChanged: false, changedTo: null }
  } catch {
    return { optedOut: false, justChanged: false, changedTo: null }
  }
}

/** Read-only check, for code that only needs the answer. */
export function isAnalyticsOptedOut(): boolean {
  return resolveAnalyticsOptOut().optedOut
}
