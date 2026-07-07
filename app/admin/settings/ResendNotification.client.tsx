'use client'

import { useState } from 'react'

interface ResendResult {
  ok?: boolean
  rowId?: string
  enriched?: boolean
  status?: string
  fieldsUpdated?: string[]
  emailed?: boolean
  error?: string
}

/**
 * Re-enrich the most recent lead (or a specific email) and re-send its
 * new-lead notification to the admin inbox. Handy for confirming the
 * enriched email format, and for firing a notification you missed.
 */
export default function ResendNotification() {
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [reEnrich, setReEnrich] = useState(true)
  const [last, setLast] = useState<ResendResult | null>(null)

  async function run() {
    setBusy(true)
    setLast(null)
    try {
      const res = await fetch('/api/admin/notify/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() || undefined, reEnrich }),
      })
      const data: ResendResult = await res.json()
      setLast(data)
    } catch (err) {
      setLast({ error: String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-[#E8E4DF] bg-white p-6">
      <h2 className="text-lg font-black text-[#333333] mb-1">Lead notification</h2>
      <p className="text-sm text-[#9C9C9C] mb-4">
        Re-enrich a lead and re-send its notification email to the admin inbox. Leave the field blank
        to use the most recent submission.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="latest submission (or type an email)"
          className="flex-1 min-w-[240px] rounded-lg border border-[#E8E4DF] px-3 py-2 text-sm text-[#333333] outline-none focus:border-[#E48715]"
        />
        <label className="flex items-center gap-2 text-sm text-[#555]">
          <input type="checkbox" checked={reEnrich} onChange={e => setReEnrich(e.target.checked)} />
          Re-run enrichment
        </label>
        <button
          onClick={run}
          disabled={busy}
          className="rounded-lg bg-[#333333] px-5 py-2 text-sm font-bold text-[#FFFDFA] disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Resend last notification'}
        </button>
      </div>

      {last && (
        <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${last.error ? 'bg-[#FDECEA] text-[#B3261E]' : 'bg-[#E8F5E9] text-[#2E7D32]'}`}>
          {last.error ? (
            <>Error: {last.error}</>
          ) : (
            <>
              {last.emailed ? 'Email sent.' : 'Email not sent.'}{' '}
              {last.enriched ? `Enrichment ${last.status || 'ran'} (${last.fieldsUpdated?.length ?? 0} fields).` : 'No enrichment run.'}
              {last.rowId ? <span className="text-[#9C9C9C]"> · {last.rowId}</span> : null}
            </>
          )}
        </div>
      )}
    </section>
  )
}
