'use client'

// The cell, opened.
//
// Click any number in the matrix that comes from the ledger and this slides in
// with the rows behind it: who, when, how much, and why that row is in that
// column. The footer restates the count and the sum so the drawer can be
// checked against the cell that opened it without leaving the page.
//
// The rows come from /api/admin/drill, which filters the SAME classified
// entries the dashboard sums. This is not a second opinion about the number,
// it is the number's own working.

import { useEffect, useState } from 'react'
import { fmtDay } from '@/lib/dates'
import { personResultPath } from '@/lib/result-url'

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const GREEN = '#2E7D32'
const LATTE = '#FEF7E7'

const STRIPE_ACCT = 'acct_1O98fMBLsgHOvWxy'

export type DrillTarget = {
  /** Metric key the API understands. */
  metric: string
  /** What the user clicked, for the drawer's title. */
  label: string
  /** The column, or the whole visible window. */
  columnLabel: string
  gran: string
  buckets: string[]
  /** The cell's own value, so the footer can say "and it matches". */
  cellValue: string
  money: boolean
}

type Row = {
  chargeId: string
  personKey: string
  name: string | null
  customerId: string | null
  submissionId: string | null
  at: string
  chargedAt: string
  usd: number | null
  why: string
}

export default function DrillDown({ target, onClose }: { target: DrillTarget | null; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [meta, setMeta] = useState<{ count: number; total: number; capped: boolean } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!target) { setRows(null); setMeta(null); setErr(null); return }
    let live = true
    setRows(null); setErr(null)
    const qs = new URLSearchParams({ metric: target.metric, gran: target.gran, buckets: target.buckets.join(',') })
    fetch(`/api/admin/drill?${qs.toString()}`, { cache: 'no-store' })
      .then(async r => {
        const d = await r.json().catch(() => null)
        if (!r.ok) throw new Error(d?.error || String(r.status))
        return d
      })
      .then(d => { if (!live) return; setRows(d.rows); setMeta({ count: d.count, total: d.total, capped: d.capped }) })
      .catch(e => { if (live) setErr(e instanceof Error ? e.message : 'failed') })
    return () => { live = false }
  }, [target])

  // Escape closes, like every other drawer the owner uses.
  useEffect(() => {
    if (!target) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target, onClose])

  if (!target) return null

  const usd = (n: number) => `$${n.toFixed(2)}`
  const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, padding: '7px 8px', whiteSpace: 'nowrap', textAlign: 'left' }
  const td: React.CSSProperties = { fontSize: 12, padding: '7px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.35)', zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(760px, 100vw)', height: '100%', background: '#FFFDFA', borderLeft: `2px solid ${INK}`, display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '14px 16px', borderBottom: `2px solid ${INK}`, background: LATTE }}>
          <div className="flex items-start justify-between" style={{ gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: MUTE }}>
                {target.columnLabel}
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: INK, marginTop: 3 }}>
                {target.label} · {target.cellValue}
              </div>
            </div>
            <button type="button" onClick={onClose} title="Close (Esc)"
              style={{ border: `2px solid ${INK}`, background: '#FFFDFA', color: INK, fontSize: 12, fontWeight: 800, padding: '3px 9px', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: MUTE, marginTop: 7 }}>
            The rows this cell was summed from, straight from the ledger. Nothing here is recomputed.
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {err && <div style={{ padding: 16, fontSize: 12, color: '#B00020' }}>Could not load: {err}</div>}
          {!err && rows === null && <div style={{ padding: 16, fontSize: 12, color: MUTE }}>Reading the ledger…</div>}
          {rows !== null && rows.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: MUTE }}>No rows. This cell really is zero.</div>
          )}
          {rows !== null && rows.length > 0 && (
            <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${INK}` }}>
                  <th style={th}>In this column by</th>
                  <th style={th}>Person</th>
                  <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                  <th style={th}>Charged</th>
                  <th style={th}>Why</th>
                  <th style={th}>Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r.chargeId}-${r.at}`} style={{ borderBottom: `1px solid ${HAIR}` }}>
                    <td style={{ ...td, color: MUTE }}>{fmtDay(r.at)}</td>
                    <td style={td}>
                      <span style={{ fontWeight: 700 }}>{r.name || '–'}</span>
                      <span style={{ color: MUTE, marginLeft: 6, fontSize: 11 }}>{r.personKey}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: GREEN, fontWeight: 700 }}>
                      {r.usd == null ? '–' : usd(r.usd)}
                    </td>
                    <td style={{ ...td, color: MUTE }}>
                      {r.chargedAt.slice(0, 10) === r.at.slice(0, 10)
                        ? <span title="Same day as the column date">same day</span>
                        : fmtDay(r.chargedAt)}
                    </td>
                    {/* One line per row, always. The reason text is the longest
                        column here and wrapping it made every row two lines
                        deep, which is exactly what the tables elsewhere were
                        fixed not to do. The drawer scrolls sideways instead. */}
                    <td style={{ ...td, fontSize: 11, color: '#4A4A4A' }} title={r.why}>{r.why}</td>
                    <td style={td}>
                      {r.submissionId && (
                        <a href={personResultPath({ id: r.submissionId, name: r.name || '' })} target="_blank" rel="noopener noreferrer"
                           title="Their result page" style={{ fontSize: 11.5, fontWeight: 700, color: INK, textDecoration: 'underline' }}>🎯</a>
                      )}
                      {r.customerId && (
                        <a href={`https://dashboard.stripe.com/${STRIPE_ACCT}/customers/${r.customerId}`} target="_blank" rel="noopener noreferrer"
                           title="Their Stripe customer" style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: GREEN, textDecoration: 'underline' }}>stripe</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {meta && (
          <div style={{ padding: '10px 16px', borderTop: `2px solid ${INK}`, background: LATTE, fontSize: 11.5, fontWeight: 700, color: INK }}>
            {meta.count} {meta.count === 1 ? 'row' : 'rows'}
            {target.money ? ` · ${usd(meta.total)}` : ''}
            <span style={{ color: MUTE, fontWeight: 400, marginLeft: 8 }}>
              against the cell: {target.cellValue}
            </span>
            {meta.capped && <span style={{ color: '#B26A00', marginLeft: 8 }}>showing the first 500</span>}
          </div>
        )}
      </div>
    </div>
  )
}
