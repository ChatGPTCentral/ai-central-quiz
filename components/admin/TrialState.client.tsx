'use client'

// The state cell on /admin/revenue: a dropdown that saves on change.
//
// "Auto" is the derived state from trial_ledger, which is always right about
// the money. Picking anything else records a manual override — what the owner
// knows that the charges cannot say (on hold, disputed, recovered by hand).
// The label keeps showing the derived state underneath when an override is
// active, so a manual answer never hides the arithmetic.

import { useState } from 'react'

const OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Auto (from charges)' },
  { value: 'yearly_subscriber', label: 'Yearly subscriber' },
  { value: 'recovered', label: 'Yearly / recovered' },
  { value: 'lifetime', label: 'Lifetime subscriber' },
  { value: 'no_payment', label: 'No payment' },
  { value: 'hold', label: 'Hold' },
  { value: 'dispute', label: 'Dispute' },
  { value: 'cancel', label: 'Cancel' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'deleted', label: 'Deleted' },
]

export default function TrialState({
  chargeId, derived, derivedLabel, derivedColor, initial,
}: {
  chargeId: string
  derived: string
  derivedLabel: string
  derivedColor: string
  /** The stored override, or null when the row is on Auto. */
  initial: string | null
}) {
  const [value, setValue] = useState(initial ?? 'auto')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const save = async (next: string) => {
    const prev = value
    setValue(next); setSaving(true); setFailed(false)
    try {
      const res = await fetch('/api/admin/trial-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeId, state: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      // Put the control back where it was: a dropdown that shows a value the
      // database does not hold is worse than an error.
      setValue(prev); setFailed(true)
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
          border: `2px solid ${failed ? '#B00020' : manual ? '#B26A00' : '#E8E2D4'}`,
          background: saving ? '#F3F0E8' : '#FFFDFA',
          color: manual ? '#B26A00' : derivedColor,
          maxWidth: 168,
        }}
      >
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>
            {o.value === 'auto' ? `Auto · ${derivedLabel}` : o.label}
          </option>
        ))}
      </select>
      {manual && <span style={{ fontSize: 9.5, color: '#B26A00', fontWeight: 700 }} aria-hidden>manual</span>}
      {failed && <span style={{ fontSize: 9.5, color: '#B00020' }}>not saved</span>}
    </span>
  )
}
