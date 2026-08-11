// Did the product break in the last six hours?
//
// The block above this one asks whether the money adds up. This one asks
// whether people can still use the thing, which is the failure that leaves no
// trace in Stripe: a sale that never starts is invisible to every revenue
// number on the page. On 2026-08-11 checkout had been refusing to load for
// anyone with a typo in their email, for weeks, while the dashboard read
// perfectly healthy.
//
// Silent when the product is fine. Loud, with the element or the message
// already in hand, when it is not.

import type { UxSignal } from '@/lib/ux-watch'

const INK = '#1A1A1A'
const RED = '#B00020'
const AMBER = '#B26A00'
const MUTE = '#7A7A7A'

export default function UxHealth({ signals, ranAt }: { signals: UxSignal[] | null; ranAt: string | null }) {
  if (!signals || !signals.length) return null
  const bad = signals.filter(s => !s.ok)
  if (!bad.length) return null

  const critical = bad.some(s => s.severity === 'critical')
  const colour = critical ? RED : AMBER
  const ago = ranAt ? Math.round((Date.now() - Date.parse(ranAt)) / 60000) : null

  return (
    <div style={{ border: `2px solid ${colour}`, background: critical ? '#FFF4F4' : '#FEF7E7', padding: '12px 14px', margin: '0 0 16px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: colour, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {critical ? 'Something is broken for real people right now' : `${bad.length} product signal${bad.length === 1 ? '' : 's'} worth a look`}
      </div>
      <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px' }}>
        {bad
          .slice()
          .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))
          .map(s => (
            <li key={s.key} style={{ fontSize: 12, color: INK, lineHeight: 1.6 }}>
              <strong>{s.claim}</strong>
              {s.threshold > 0 && <span style={{ color: MUTE }}> ({s.value} in 6h, over {s.threshold})</span>}
              <div style={{ color: '#4A4A4A', fontSize: 11.5 }}>{s.detail}</div>
            </li>
          ))}
      </ul>
      <div style={{ fontSize: 10.5, color: MUTE, marginTop: 8 }}>
        checked {ago === null ? 'at an unknown time' : ago < 2 ? 'just now' : ago < 90 ? `${ago} min ago` : `${Math.round(ago / 60)}h ago`}
        {' · '}every 6 hours{' · '}{signals.length - bad.length} of {signals.length} clear
      </div>
    </div>
  )
}
