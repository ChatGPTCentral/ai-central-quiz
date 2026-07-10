// First-party funnel event sender (client side).
//
// Ships events to /api/events, which persists them in the funnel_events
// table. Uses navigator.sendBeacon (survives page unloads — critical for
// checkout_click, where the browser is navigating to Stripe) with a fetch
// keepalive fallback. text/plain keeps sendBeacon CORS-preflight-free.
//
// Analytics must never break the funnel: everything is try/catch'd and
// this module never throws.

const SESSION_KEY = 'ac_sid'

export function getSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY)
    if (!sid) {
      sid = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, sid)
    }
    return sid
  } catch {
    return 'no-session'
  }
}

export interface EventOpts {
  props?: Record<string, unknown>
  submissionId?: string
  experimentKey?: string
  variantKey?: string
  /** Use fetch instead of sendBeacon when the response matters (e.g. the
   *  exposure call, whose response sets the sticky variant cookie). */
  viaFetch?: boolean
}

export function sendEvent(event: string, opts: EventOpts = {}): void {
  if (typeof window === 'undefined') return
  try {
    // On the entry event, record where the visitor came from — external
    // referrers decompose coarse/missing UTMs (e.g. which thecentral.ai
    // page an untagged embed lives on).
    let props = opts.props
    if (event === 'quiz_view') {
      try {
        const ref = document.referrer
        if (ref && !ref.startsWith(location.origin)) {
          props = { ...props, referrer: ref.slice(0, 200) }
        }
      } catch { /* non-fatal */ }
    }
    const payload = JSON.stringify({
      event,
      sessionId: getSessionId(),
      path: location.pathname,
      utmSource: new URLSearchParams(location.search).get('utm_source') || undefined,
      submissionId: opts.submissionId,
      experimentKey: opts.experimentKey,
      variantKey: opts.variantKey,
      props,
    })
    if (!opts.viaFetch && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon('/api/events', new Blob([payload], { type: 'text/plain' }))
      if (ok) return
    }
    fetch('/api/events', {
      method: 'POST',
      body: payload,
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'text/plain' },
    }).catch(() => { /* non-fatal */ })
  } catch { /* non-fatal */ }
}
