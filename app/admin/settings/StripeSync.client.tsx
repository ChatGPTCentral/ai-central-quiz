'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ImportResult {
  totalEmails?: number
  processed?: number
  skipped?: number
  inserted?: number
  updated?: number
  dryRun?: boolean
  totalLtv?: number
  multiCustomerEmails?: number
  hasMore?: boolean
  aggregateMs?: number
  upsertMs?: number
  errors?: { email: string; error: string }[]
  error?: string
}

export default function StripeSync() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<ImportResult | null>(null)

  async function run(dryRun: boolean) {
    if (!dryRun) {
      if (!confirm('Re-import every Stripe customer and upsert into the CRM?\n\nStripe wins on conflict — existing rows that match by email get their name + country + stripe_* fields overwritten. Quiz data (archetype, AI level, etc.) stays untouched.\n\nResumable — already-imported emails are skipped automatically.')) return
    }
    setBusy(true); setLast(null)

    // Loop until hasMore=false (or dryRun, which doesn't chunk)
    let cumulative = { inserted: 0, updated: 0, processed: 0, errors: [] as { email: string; error: string }[] }
    let pass = 0
    try {
      while (true) {
        pass++
        const res = await fetch('/api/admin/stripe/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun }),
        })
        const data: ImportResult = await res.json()
        if (!res.ok) { setLast(data); return }
        if (dryRun) { setLast(data); return }
        cumulative.inserted += data.inserted ?? 0
        cumulative.updated  += data.updated  ?? 0
        cumulative.processed += data.processed ?? 0
        if (data.errors?.length) cumulative.errors.push(...data.errors)
        setLast({ ...data, ...cumulative })
        if (!data.hasMore || pass >= 12) break       // safety cap on the loop
      }
      router.refresh()
    } catch (e) {
      setLast({ error: String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden mt-6">
      <header className="px-5 py-4 border-b border-[#E8E4DF] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-black text-[#333333]">Stripe sync</h2>
          <p className="text-[11px] text-[#9C9C9C] mt-0.5">
            Walk every Stripe customer, dedupe by email, sum LTV across all <code className="bg-[#F5F5F5] px-1 rounded">cus_XXX</code> in the group, then upsert into the CRM. Stripe wins on conflict.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => run(true)}
            disabled={busy}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-white border border-[#E8E4DF] text-[#333333] hover:bg-[#FEF7E7] disabled:opacity-40"
            title="Read-only preview — no DB writes"
          >
            👁 Dry run
          </button>
          <button
            onClick={() => run(false)}
            disabled={busy}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-[#62A758] text-white hover:opacity-90 disabled:opacity-40"
            title="Import and upsert all customers"
          >
            {busy ? 'Importing…' : '↻ Import from Stripe'}
          </button>
        </div>
      </header>

      {last && (
        <div className="px-5 py-4">
          {last.error ? (
            <p className="text-[12px] text-[#BE3B3B] bg-[#FEE3E3] border border-[#BE3B3B]/30 rounded p-2">
              ✕ {last.error}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              <Stat label="Total in Stripe" value={(last.totalEmails ?? 0).toLocaleString()} />
              <Stat label="Processed" value={(last.processed ?? 0).toLocaleString()} accent="#046BB1" />
              {last.dryRun ? (
                <>
                  <Stat label="Total LTV" value={`$${(last.totalLtv ?? 0).toLocaleString()}`} accent="#62A758" />
                  <Stat label="Multi-customer emails" value={(last.multiCustomerEmails ?? 0).toLocaleString()} />
                </>
              ) : (
                <>
                  <Stat label="Inserted" value={(last.inserted ?? 0).toLocaleString()} accent="#62A758" />
                  <Stat label="Updated" value={(last.updated ?? 0).toLocaleString()} accent="#046BB1" />
                </>
              )}
              {last.skipped !== undefined && last.skipped > 0 && (
                <Stat label="Skipped (already done)" value={last.skipped.toLocaleString()} />
              )}
              {last.hasMore && <Stat label="Has more" value="⚠ yes — resumed" accent="#E48715" />}
            </div>
          )}
          {last.errors && last.errors.length > 0 && (
            <details className="mt-3">
              <summary className="text-[11px] text-[#BE3B3B] cursor-pointer">{last.errors.length} per-row error{last.errors.length === 1 ? '' : 's'}</summary>
              <ul className="text-[11px] mt-1 text-[#9C9C9C] max-h-40 overflow-auto">
                {last.errors.slice(0, 50).map((e, i) => (
                  <li key={i} className="font-mono">{e.email} — {e.error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-[#E8E4DF] px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider font-bold text-[#9C9C9C]">{label}</div>
      <div className="text-base font-black tabular-nums" style={{ color: accent || '#333333' }}>{value}</div>
    </div>
  )
}
