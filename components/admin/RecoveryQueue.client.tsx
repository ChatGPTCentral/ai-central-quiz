'use client'

// Section 5 · Revenue recovery — the retry list as a WORKED QUEUE.
//
// The owner's spec (2026-08-16): "keep track of when we last tried to charge
// some people so that it builds a sort of queue." The audit table already
// timestamps every attempt and its outcome; this section reads it back so the
// list self-organizes: never-attempted people first (oldest debt first),
// then the longest-since-last-try. Working the queue top to bottom never
// hammers the same person twice while an untouched one waits.

import React from 'react'
import ChargeAnnual from './ChargeAnnual.client'

export interface RecoveryRow {
  personKey: string
  name: string | null
  chargeId: string
  customerId: string
  trialCents: number
  trialAt: string
  trialCount: number
  lastAt: string | null
  lastOutcome: string | null
}

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const GREEN = '#2E7D32'
const AMBER = '#B26A00'

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '9px 13px' }}>
      <div className="font-mono uppercase" style={{ fontSize: 9, letterSpacing: '.12em', color: MUTE, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: INK, marginTop: 2 }}>{value}</div>
    </div>
  )
}

export default function RecoveryQueue({ rows, recovered, invoiced }: { rows: RecoveryRow[]; recovered: number; invoiced: number }) {
  const never = rows.filter(r => !r.lastAt).length
  return (
    <div>
      <div className="flex flex-wrap" style={{ gap: 8, marginTop: 12 }}>
        <Stat label="In the queue" value={String(rows.length)} />
        <Stat label="Never attempted" value={String(never)} />
        <Stat label="Awaiting retry" value={String(rows.length - never)} />
        <Stat label="Subscriptions won" value={String(recovered)} />
        <Stat label="Invoices out" value={String(invoiced)} />
      </div>

      <div style={{ overflowX: 'auto', marginTop: 12, border: `2px solid ${INK}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${INK}`, background: '#FEF7E7' }}>
              {['#', 'Person', 'Trial', 'Tries', 'Last attempt', 'Action'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.chargeId} style={{ borderBottom: `1px solid ${HAIR}` }}>
                <td style={{ padding: '8px 10px', color: MUTE, fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ fontWeight: 700 }}>{r.name || '–'}</span>
                  <span style={{ color: MUTE, marginLeft: 6, fontSize: 11 }}>{r.personKey}</span>
                  {r.trialCount > 1 && (
                    <span title="This person holds more than one open trial. One subscription settles the person; the already-pays guard blocks any second charge automatically." style={{ marginLeft: 6, fontSize: 10, color: AMBER, fontWeight: 700 }}>
                      ×{r.trialCount} trials
                    </span>
                  )}
                </td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: MUTE }}>
                  {fmtDay(r.trialAt)} · ${(r.trialCents / 100).toFixed(2)}
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.lastAt ? '1+' : '0'}</td>
                <td style={{ padding: '8px 10px', maxWidth: 300 }}>
                  {r.lastAt ? (
                    <span style={{ fontSize: 11 }}>
                      <span style={{ color: INK, fontWeight: 700 }}>{fmtDay(r.lastAt)}</span>
                      <span title={r.lastOutcome || ''} style={{ color: r.lastOutcome?.startsWith('created') || r.lastOutcome?.startsWith('invoiced') ? GREEN : MUTE, marginLeft: 6 }}>
                        {(r.lastOutcome || '').slice(0, 60)}
                      </span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>fresh — never tried</span>
                  )}
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <ChargeAnnual customerId={r.customerId} personKey={r.personKey} chargeId={r.chargeId} trialCents={r.trialCents} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 16, color: MUTE, fontSize: 12 }}>Queue empty — every chargeable person has been worked or resolved.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
