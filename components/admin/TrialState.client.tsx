'use client'

// The state cell on /admin/revenue: a dropdown that saves on change.
//
// "Auto" is the derived state from trial_ledger, which is always right about
// the money. Picking anything else records a manual override — what the owner
// knows that the charges cannot say (disputed, recovered by hand). The label
// keeps showing the derived state underneath when an override is active, so a
// manual answer never hides the arithmetic.

import { useState } from 'react'
import { liveState, STATE_COLOR, type State } from '@/lib/revenue-states'

// 'hold' is gone from the list (owner, 2026-08-22: "Trialing and hold sono la
// stessa cosa") — it duplicated the derived Trialing state and froze rows out
// of the retry queue. The 81 existing hold overrides were cleared the same
// day; the API refuses the value too, so it cannot come back by accident.
const OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto (from charges)' },
  { value: 'yearly_subscriber', label: 'Yearly subscriber' },
  { value: 'recovered', label: 'Yearly / recovered' },
  { value: 'lifetime', label: 'Lifetime subscriber' },
  { value: 'no_payment', label: 'No payment' },
  { value: 'dispute', label: 'Dispute' },
  { value: 'cancel', label: 'Cancel' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'deleted', label: 'Deleted' },
]

export type StripeCheck = { hasActiveSubscription: boolean; subscriptionStatus: string | null } | { error: string }

export default function TrialState({
  chargeId, customerId, derived, derivedLabel, derivedColor, initial, onLiveColorChange, onStripeCheck,
}: {
  chargeId: string
  /** Needed to re-check Stripe live after a manual change; no check runs
   *  without it. */
  customerId: string | null
  derived: State
  derivedLabel: string
  derivedColor: string
  /** The stored override, or null when the row is on Auto. */
  initial: string | null
  /** Repaints the row's background the instant the dropdown changes — no
   *  reload (owner, 2026-08-23: "when i change status by hand it also
   *  changes row color"). Called with the OPTIMISTIC color immediately, then
   *  again if the save fails and the value reverts. */
  onLiveColorChange?: (color: string) => void
  /** The live Stripe re-check result, reported up instead of rendered here
   *  (owner, 2026-08-23: "sposta i dettagli della transazione stripe a
   *  destra dei bottoni") — the Actions column renders it, next to the
   *  buttons that actually touch Stripe. Called with null to clear a stale
   *  result when a new change starts. */
  onStripeCheck?: (check: StripeCheck | null) => void
}) {
  const [value, setValue] = useState(initial ?? 'auto')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  // ONE color computation, used by the select's own border/text AND reported
  // up for the row tint — they were drifting apart (owner, 2026-08-23: "i
  // dont understand why the rectangle colors do not match the color of the
  // row") because the select had its own hardcoded amber-for-any-override
  // instead of asking what bucket this specific override actually maps to.
  const color = STATE_COLOR[liveState(value, derived)]

  const save = async (next: string) => {
    const prev = value
    setValue(next); setSaving(true); setFailed(false); onStripeCheck?.(null)
    onLiveColorChange?.(STATE_COLOR[liveState(next, derived)])
    try {
      const res = await fetch('/api/admin/trial-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeId, state: next, customerId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(String(j.error || res.status))
      if (j.stripeCheck) {
        onStripeCheck?.(j.stripeCheck.ok ? { hasActiveSubscription: j.stripeCheck.hasActiveSubscription, subscriptionStatus: j.stripeCheck.subscriptionStatus } : { error: j.stripeCheck.error })
      }
    } catch {
      // Put the control back where it was: a dropdown that shows a value the
      // database does not hold is worse than an error.
      setValue(prev); setFailed(true)
      onLiveColorChange?.(STATE_COLOR[liveState(prev, derived)])
    } finally {
      setSaving(false)
    }
  }

  const manual = value !== 'auto'
  // ONE line per row, always: what the charges say moves into the tooltip
  // rather than a second line under the control, which made some rows twice
  // the height of their neighbours.
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
          title={manual ? `Manual override. The charges say: ${derivedLabel}` : `Derived from the charges: ${derivedLabel}`}>
      <select
        value={value}
        disabled={saving}
        onChange={e => save(e.target.value)}
        style={{
          fontSize: 11.5, fontWeight: 700, padding: '3px 5px',
          border: `2px solid ${failed ? '#B00020' : manual ? color : '#E8E2D4'}`,
          background: saving ? '#F3F0E8' : '#FFFDFA',
          color: manual ? color : derivedColor,
          maxWidth: 168,
        }}
      >
        {/* The auto option always shows the derived state PLAIN — "Trialing",
            never "Auto · Trialing" (owner, 2026-08-22, then again 2026-08-23:
            "basta avere 'auto trialing' e 'trialing'" — one word for one
            fact even inside the open list, not just in the closed box). */}
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>
            {o.value === 'auto' ? derivedLabel : o.label}
          </option>
        ))}
      </select>
      {failed && <span style={{ fontSize: 9.5, color: '#B00020' }}>not saved</span>}
    </span>
  )
}
