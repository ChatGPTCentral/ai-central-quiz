// Minimal analytics dispatcher (funnel handoff "Analytics events").
// Pushes to window.dataLayer when a tag manager is present; no-ops
// otherwise. Never throws — analytics must not break the funnel.

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  try {
    const w = window as unknown as { dataLayer?: Record<string, unknown>[] }
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push({ event, ...props })
  } catch { /* non-fatal */ }
}
