// Do the numbers on this page still add up?
//
// Silent when everything passes, which is almost always, because a banner that
// is always there stops being read. It appears the moment an invariant breaks,
// says which claim failed and what the check actually saw, so the first
// question ("since when?") is answerable from the row itself.
//
// This exists because on 2026-08-11 two revenue bugs survived for weeks with
// nothing watching: the only thing between them and the dashboard was the
// owner opening a cell and noticing.

import type { CheckResult } from '@/lib/ledger-invariants'

const INK = '#1A1A1A'
const RED = '#B00020'
const MUTE = '#7A7A7A'

export default function LedgerHealth({ checks, ranAt }: { checks: CheckResult[] | null; ranAt: string | null }) {
  if (!checks || !checks.length) return null
  const failed = checks.filter(c => !c.ok)
  if (!failed.length) return null

  const ago = ranAt ? Math.round((Date.now() - Date.parse(ranAt)) / 60000) : null

  return (
    <div style={{ border: `2px solid ${RED}`, background: '#FFF4F4', padding: '12px 14px', margin: '0 0 16px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: RED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {failed.length === 1 ? 'A ledger check is failing' : `${failed.length} ledger checks are failing`}
      </div>
      <div style={{ fontSize: 11.5, color: '#4A4A4A', marginTop: 6, lineHeight: 1.6 }}>
        The numbers below may be wrong. Do not act on them until this clears.
      </div>
      <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px' }}>
        {failed.map(f => (
          <li key={f.key} style={{ fontSize: 12, color: INK, lineHeight: 1.6 }}>
            <strong>{f.claim}</strong>
            <span style={{ color: MUTE }}> — {f.detail}</span>
          </li>
        ))}
      </ul>
      <div style={{ fontSize: 10.5, color: MUTE, marginTop: 8 }}>
        checked {ago === null ? 'at an unknown time' : ago < 2 ? 'just now' : ago < 90 ? `${ago} min ago` : `${Math.round(ago / 60)}h ago`}
        {' · '}{checks.length - failed.length} of {checks.length} passing
      </div>
    </div>
  )
}
