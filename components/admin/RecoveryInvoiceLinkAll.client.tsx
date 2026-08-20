'use client'

// Generate invoice links for a whole cohort in one run.
//
// Owner, 2026-08-20: "is a bit cumbersome going through all of them one by
// one, can't you just do it at scale." Same bulk pattern as InvoiceRetryAll
// and ChargeAnnualAll: two-click confirm stating the real count, sequential
// with a Stop button, live per-row progress. The one thing that makes this
// different from those two, and the one thing the confirmation must say in
// plain words: generating an invoice link also makes STRIPE send its own
// invoice email to that person immediately, before any custom sequence email
// exists. This is not a preview action like the invoice route's cousin was —
// it has a real, external, immediate side effect the moment it runs.
//
// SKIPS, not attempts, for anyone the board already knows the answer for:
// someone with a link already (durable state, read from admin_actions) does
// not need a second one — clicking it again would just be refused, exactly
// the confusion that started this. Someone flagged needs_review is not
// this button's to touch; a human looks in Stripe first.

import React, { useRef, useState } from 'react'
import type { OutreachCard } from '@/app/admin/revenue/outreach/OutreachBoard.client'

const GREEN = '#2E7D32'
const RED = '#B00020'
const INK = '#1A1A1A'
const MUTE = '#6B6B6B'

type Outcome = 'pending' | 'working' | 'generated' | 'skipped_existing' | 'skipped_review' | 'no_annual_plan' | 'failed'

interface ResultRow {
  person_key: string
  outcome: Outcome
  url: string
  message: string
}

export default function RecoveryInvoiceLinkAll({ cards }: { cards: OutreachCard[] }) {
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'stopping' | 'done'>('idle')
  const [results, setResults] = useState<ResultRow[]>([])
  const stopRequested = useRef(false)

  // Only trial-source cards carry the customer/charge refs this needs.
  const eligible = cards.filter(c => c.source === 'trial' && c.customer_id && c.charge_id)
  const toSkipExisting = eligible.filter(c => c.invoice_url)
  const toSkipReview = eligible.filter(c => !c.invoice_url && c.needs_review)
  const toCall = eligible.filter(c => !c.invoice_url && !c.needs_review)

  if (eligible.length === 0) return null

  const run = async () => {
    stopRequested.current = false
    setPhase('running')
    setResults(eligible.map(c => ({ person_key: c.person_key, outcome: 'pending', url: c.invoice_url ?? '', message: '' })))
    for (let i = 0; i < eligible.length; i++) {
      if (stopRequested.current) break
      const c = eligible[i]
      if (c.invoice_url) {
        setResults(prev => prev.map((r, idx) => (idx === i ? { ...r, outcome: 'skipped_existing', url: c.invoice_url ?? '' } : r)))
        continue
      }
      if (c.needs_review) {
        setResults(prev => prev.map((r, idx) => (idx === i ? { ...r, outcome: 'skipped_review' } : r)))
        continue
      }
      setResults(prev => prev.map((r, idx) => (idx === i ? { ...r, outcome: 'working' } : r)))
      try {
        const res = await fetch('/api/admin/charge-annual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: c.customer_id, personKey: c.person_key, chargeId: c.charge_id, mode: 'invoice' }),
        })
        const j = await res.json().catch(() => ({}))
        const errText = String(j.error || '')
        const outcome: Outcome =
          res.ok && j.ok && j.invoiceUrl ? 'generated'
          : /no annual plan mapped/i.test(errText) ? 'no_annual_plan'
          : 'failed'
        setResults(prev => prev.map((r, idx) => (idx === i
          ? { ...r, outcome, url: j.invoiceUrl || '', message: outcome === 'failed' || outcome === 'no_annual_plan' ? errText : '' }
          : r)))
      } catch (e) {
        setResults(prev => prev.map((r, idx) => (idx === i ? { ...r, outcome: 'failed', message: e instanceof Error ? e.message : 'network error' } : r)))
      }
      await new Promise(r => setTimeout(r, 200))
    }
    setPhase('done')
  }

  const requestStop = () => { stopRequested.current = true; setPhase('stopping') }

  if (phase === 'idle') {
    return (
      <button
        onClick={() => setPhase('confirm')}
        style={{ fontSize: 11, fontWeight: 800, border: `2px solid ${INK}`, background: '#FFFDFA', padding: '5px 11px', cursor: 'pointer' }}
      >
        Generate all {eligible.length} invoice links
      </button>
    )
  }

  if (phase === 'confirm') {
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 8, border: `2px solid ${RED}`, background: '#FFF4F4', padding: '10px 12px', maxWidth: 480 }}>
        <strong style={{ fontSize: 12.5, color: RED }}>
          This creates {toCall.length} new subscription{toCall.length === 1 ? '' : 's'} now, one per person.
        </strong>
        <span style={{ fontSize: 11.5, color: INK, lineHeight: 1.5 }}>
          The moment each one is created, STRIPE EMAILS THAT PERSON ITS OWN INVOICE NOTICE IMMEDIATELY — before any
          custom sequence email exists. This is not a preview. {toSkipExisting.length > 0 && `${toSkipExisting.length} already have a link and are skipped. `}
          {toSkipReview.length > 0 && `${toSkipReview.length} need manual review and are skipped.`}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => void run()}
            style={{ fontSize: 11, fontWeight: 800, border: `2px solid ${RED}`, background: '#FFFFFF', color: RED, padding: '5px 11px', cursor: 'pointer' }}
          >
            Yes, generate {toCall.length} now
          </button>
          <button
            onClick={() => setPhase('idle')}
            style={{ fontSize: 11, border: `1px solid ${INK}`, background: '#FFFFFF', padding: '5px 11px', cursor: 'pointer' }}
          >
            cancel
          </button>
        </span>
      </span>
    )
  }

  const counts = {
    generated: results.filter(r => r.outcome === 'generated').length,
    skipped: results.filter(r => r.outcome === 'skipped_existing' || r.outcome === 'skipped_review').length,
    failed: results.filter(r => r.outcome === 'failed' || r.outcome === 'no_annual_plan').length,
    left: results.filter(r => r.outcome === 'pending' || r.outcome === 'working').length,
  }
  const outcomeColor: Record<Outcome, string> = {
    pending: MUTE, working: MUTE, generated: GREEN, skipped_existing: MUTE, skipped_review: RED, no_annual_plan: RED, failed: RED,
  }
  const outcomeLabel: Record<Outcome, string> = {
    pending: 'waiting', working: 'generating…', generated: 'done', skipped_existing: 'already had one',
    skipped_review: 'needs review', no_annual_plan: 'no plan mapped', failed: 'failed',
  }

  return (
    <div style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '10px 12px', maxWidth: 560 }}>
      <div className="flex items-center justify-between" style={{ gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: INK }}>
          {phase === 'running' && `Generating… ${results.length - counts.left} of ${results.length}`}
          {phase === 'stopping' && `Stopping after the current one… ${results.length - counts.left} of ${results.length}`}
          {phase === 'done' && `Done — ${counts.generated} generated, ${counts.skipped} skipped, ${counts.failed} failed`}
        </div>
        {phase === 'running' && (
          <button onClick={requestStop} style={{ fontSize: 10, fontWeight: 800, border: `2px solid ${RED}`, background: '#FFFFFF', color: RED, padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ■ Stop
          </button>
        )}
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
        {results.map(r => (
          <div key={r.person_key} style={{ fontSize: 10.5 }}>
            <div className="flex items-center gap-2">
              <span style={{ flex: 1, minWidth: 0, color: MUTE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.person_key}</span>
              <span style={{ color: outcomeColor[r.outcome], fontWeight: 700, whiteSpace: 'nowrap' }}>{outcomeLabel[r.outcome]}{r.message ? `: ${r.message.slice(0, 60)}` : ''}</span>
            </div>
            {r.url && (
              <input readOnly value={r.url} onClick={e => (e.target as HTMLInputElement).select()}
                style={{ fontSize: 9, width: '100%', border: '1px solid #E8E2D4', padding: '2px 4px', color: GREEN, fontFamily: 'monospace', marginTop: 1 }} />
            )}
          </div>
        ))}
      </div>
      {phase === 'done' && (
        <button onClick={() => { setPhase('idle'); setResults([]) }} style={{ marginTop: 8, fontSize: 10.5, border: `1px solid ${INK}`, background: '#FFFFFF', padding: '3px 8px', cursor: 'pointer' }}>
          reset
        </button>
      )}
    </div>
  )
}
