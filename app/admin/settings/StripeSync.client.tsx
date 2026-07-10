'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ImportResult {
  mode?: 'incremental' | 'full' | 'tag_backfill'
  sinceMs?: number
  sinceIso?: string
  affectedEmails?: number
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
  // tag_backfill fields
  payers?: number
  tagged?: number
  notSubscribed?: number
  failed?: { email: string; error: string }[]
  errors?: { email: string; error: string }[]
  error?: string
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function StripeSync() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<ImportResult | null>(null)
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null)

  // Pull the last-sync timestamp on mount so we can show "Last synced X ago"
  useEffect(() => {
    fetch('/api/admin/stripe/import').then(r => r.json()).then((d: { lastSyncMs: number | null }) => {
      setLastSyncMs(d.lastSyncMs ?? null)
    }).catch(() => { /* silent */ })
  }, [])

  async function run(mode: 'incremental' | 'full', dryRun: boolean) {
    if (!dryRun && mode === 'full') {
      if (!confirm('Full re-import: walk every Stripe customer and upsert into the CRM.\n\nUse this when you suspect drift between Stripe and the CRM, or after a long quiet period. Otherwise prefer "Sync since last update" - - it\'s minutes vs hours.\n\nResumable: already-imported emails are skipped automatically.')) return
    }
    setBusy(true); setLast(null)

    const cumulative = { inserted: 0, updated: 0, processed: 0, errors: [] as { email: string; error: string }[] }
    let pass = 0
    try {
      while (true) {
        pass++
        const res = await fetch('/api/admin/stripe/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, dryRun }),
        })
        const data: ImportResult = await res.json()
        if (!res.ok) { setLast(data); return }
        if (dryRun) { setLast(data); return }
        cumulative.inserted += data.inserted ?? 0
        cumulative.updated  += data.updated  ?? 0
        cumulative.processed += data.processed ?? 0
        if (data.errors?.length) cumulative.errors.push(...data.errors)
        setLast({ ...data, ...cumulative })
        if (!data.hasMore || pass >= 12) break
      }
      // Refresh the last-sync chip
      fetch('/api/admin/stripe/import').then(r => r.json()).then((d: { lastSyncMs: number | null }) => {
        setLastSyncMs(d.lastSyncMs ?? null)
      }).catch(() => {})
      router.refresh()
    } catch (e) {
      setLast({ error: String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function runTagBackfill() {
    setBusy(true); setLast(null)
    try {
      const res = await fetch('/api/admin/stripe/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'tag_backfill' }),
      })
      setLast(await res.json())
    } catch (e) {
      setLast({ error: String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden mt-6">
      <header className="px-5 py-4 border-b border-[#E8E4DF] flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-base font-black text-[#333333]">Stripe sync</h2>
            {lastSyncMs ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: '#62A758' + '15', color: '#2D6A26', border: '1px solid #62A758' + '40' }}
                title={new Date(lastSyncMs).toLocaleString()}
              >
                ✓ Last synced {timeAgo(lastSyncMs)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#E48715]/15 text-[#8A4F0B] border border-[#E48715]/40">
                ⚠ Never synced
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#9C9C9C] mt-1">
            Default: sync only the emails with new Stripe activity since the last run (~30s). Stripe wins on conflict
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => run('incremental', true)}
            disabled={busy || !lastSyncMs}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-white border border-[#E8E4DF] text-[#333333] hover:bg-[#FEF7E7] disabled:opacity-40"
            title={lastSyncMs ? 'Read-only preview of changes since last sync' : 'Run a Full re-import first'}
          >
            👁 Preview
          </button>
          <button
            onClick={() => run('incremental', false)}
            disabled={busy || !lastSyncMs}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-[#62A758] text-white hover:opacity-90 disabled:opacity-40"
            title={lastSyncMs ? 'Sync only emails with new activity since last run' : 'Run a Full re-import first'}
          >
            {busy ? 'Syncing…' : '↻ Sync since last update'}
          </button>
          <div className="w-px h-6 bg-[#E8E4DF]" />
          <button
            onClick={() => run('full', false)}
            disabled={busy}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-white border border-[#E8E4DF] text-[#9C9C9C] hover:bg-[#FEF7E7] hover:text-[#333333] disabled:opacity-40"
            title="Walk every Stripe customer. Slow but exhaustive - - use for drift recovery"
          >
            ⟳ Full re-import
          </button>
          <button
            onClick={runTagBackfill}
            disabled={busy}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-white border border-[#E8E4DF] text-[#9C9C9C] hover:bg-[#FEF7E7] hover:text-[#333333] disabled:opacity-40"
            title="Re-apply the Beehiiv customer_active/purchased tags to every CRM payer (LTV > 0). One-off catch-up - - ongoing syncs tag automatically"
          >
            🏷 Tag payers in Beehiiv
          </button>
        </div>
      </header>

      {last && (
        <div className="px-5 py-4">
          {last.error ? (
            <p className="text-[12px] text-[#BE3B3B] bg-[#FEE3E3] border border-[#BE3B3B]/30 rounded p-2">
              ✕ {last.error}
            </p>
          ) : last.mode === 'tag_backfill' ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
                <Stat label="CRM payers (LTV > 0)" value={(last.payers ?? 0).toLocaleString()} />
                <Stat label="Tagged in Beehiiv" value={(last.tagged ?? 0).toLocaleString()} accent="#62A758" />
                <Stat label="Not on the newsletter" value={(last.notSubscribed ?? 0).toLocaleString()} />
                {(last.failed?.length ?? 0) > 0 && <Stat label="Failed" value={String(last.failed!.length)} accent="#BE3B3B" />}
              </div>
              {(last.failed?.length ?? 0) > 0 && (
                <details className="mt-3">
                  <summary className="text-[11px] text-[#BE3B3B] cursor-pointer">{last.failed!.length} failure{last.failed!.length === 1 ? '' : 's'}</summary>
                  <ul className="text-[11px] mt-1 text-[#9C9C9C] max-h-40 overflow-auto">
                    {last.failed!.slice(0, 50).map((e, i) => (
                      <li key={i} className="font-mono">{e.email} - - {e.error}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="text-[11px] text-[#9C9C9C] mt-3 italic">
                customer_active + purchased applied. Email automations that exclude these tags will never pitch paying customers.
              </p>
            </>
          ) : (
            <>
              {/* Mode badge + cutoff hint */}
              {last.mode && (
                <div className="flex items-center gap-2 mb-3 text-[11px]">
                  <span
                    className="inline-block px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px]"
                    style={{
                      backgroundColor: last.mode === 'incremental' ? '#62A75815' : '#3B4C9915',
                      color: last.mode === 'incremental' ? '#2D6A26' : '#2A3672',
                      border: `1px solid ${last.mode === 'incremental' ? '#62A75840' : '#3B4C9940'}`,
                    }}
                  >
                    {last.mode === 'incremental' ? '⚡ Incremental' : '⟳ Full'}
                  </span>
                  {last.dryRun && <span className="text-[#9C9C9C]">(dry run)</span>}
                  {last.sinceIso && (
                    <span className="text-[#9C9C9C]">
                      since {new Date(last.sinceIso).toLocaleString()}
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
                {last.mode === 'incremental' ? (
                  <>
                    <Stat label="Emails with new activity" value={(last.affectedEmails ?? 0).toLocaleString()} accent="#E48715" />
                    <Stat label="Processed" value={(last.processed ?? 0).toLocaleString()} accent="#046BB1" />
                  </>
                ) : (
                  <>
                    <Stat label="Total in Stripe" value={(last.totalEmails ?? 0).toLocaleString()} />
                    <Stat label="Processed" value={(last.processed ?? 0).toLocaleString()} accent="#046BB1" />
                  </>
                )}
                {last.dryRun ? (
                  <>
                    <Stat label="Total LTV" value={`$${(last.totalLtv ?? 0).toLocaleString()}`} accent="#62A758" />
                    {last.multiCustomerEmails !== undefined && (
                      <Stat label="Multi-customer emails" value={last.multiCustomerEmails.toLocaleString()} />
                    )}
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
                {last.hasMore && <Stat label="Has more" value="⚠ yes - - resumed" accent="#E48715" />}
              </div>

              {last.affectedEmails === 0 && last.mode === 'incremental' && (
                <p className="text-[11px] text-[#62A758] mt-3 italic">
                  ✓ Nothing new in Stripe since last sync. Everything is up to date
                </p>
              )}
            </>
          )}
          {last.errors && last.errors.length > 0 && (
            <details className="mt-3">
              <summary className="text-[11px] text-[#BE3B3B] cursor-pointer">{last.errors.length} per-row error{last.errors.length === 1 ? '' : 's'}</summary>
              <ul className="text-[11px] mt-1 text-[#9C9C9C] max-h-40 overflow-auto">
                {last.errors.slice(0, 50).map((e, i) => (
                  <li key={i} className="font-mono">{e.email} - - {e.error}</li>
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
