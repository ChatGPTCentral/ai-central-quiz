// Trial recovery — the retry queue, on its own screen.
//
// Owner's spec, 2026-08-16: "section 5 deserves a section of its own called
// trial recovery." One row per person, only true retry candidates, ordered
// by the audit trail: never-attempted first (oldest debt first), then the
// longest since last try. Same loader and state machinery as /admin/revenue
// and /admin/revenue/trials — one dataset, three views.

import RecoveryQueue, { type RecoveryRow } from '@/components/admin/RecoveryQueue.client'
import { loadRevenueData, buildStateMachinery, retryVerdict, lastChargeAttempts, loadGraduatedSet } from '@/lib/revenue-shared'

export const dynamic = 'force-dynamic'
export const revalidate = 60

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'

const navChip: React.CSSProperties = {
  padding: '6px 12px', fontSize: 11.5, fontWeight: 700,
  border: '2px solid #1A1A1A', background: '#FFFDFA', color: '#1A1A1A', textDecoration: 'none',
}

export default async function TrialRecoveryPage() {
  let d: Awaited<ReturnType<typeof loadRevenueData>> | null = null
  let err: string | null = null
  let graduated = new Set<string>()
  try {
    // GRADUATED people are owned by a human email sequence now, not this
    // auto-billing queue — owner, 2026-08-20: "removing them from the billing
    // retry ledger and instead moving them into this other ledger." See
    // /admin/revenue/outreach for where they went. Same shared fetch the
    // trials table uses, so the two screens can never disagree about who
    // graduated.
    ;[d, graduated] = await Promise.all([loadRevenueData(), loadGraduatedSet()])
  } catch (e) { err = e instanceof Error ? e.message : String(e) }
  if (err || !d) {
    return <div style={{ padding: 26 }}><h1 style={{ fontWeight: 800, fontSize: 24 }}>Trial recovery</h1><p style={{ color: '#B00020' }}>{err}</p></div>
  }

  const { effState } = buildStateMachinery(d)

  // Last attempt per person from the audit trail — the shared map (filtered
  // to charge_annual_* actions; admin_actions now carries other kinds too).
  const lastAttemptByPerson = lastChargeAttempts(d.adminActions)
  let recoveredCount = 0
  let invoicedCount = 0
  for (const a of d.adminActions) {
    if (a.action === 'charge_annual_created') recoveredCount++
    if (a.action === 'charge_annual_invoiced') invoicedCount++
  }

  // One row per PERSON: a two-trial person is one debt (×2 badge), and the
  // already-pays guard blocks a second charge anyway. Eligibility is the ONE
  // shared rule (retryVerdict) — the same verdict the trials table renders,
  // so the two screens always agree row by row.
  const queueByPerson = new Map<string, RecoveryRow>()
  for (const r of d.ledger) {
    if (retryVerdict(r, effState(r), graduated) !== 'eligible') continue
    if (!r.customer_id) continue // the verdict already guarantees this; narrows the type
    const pk = r.person_key.toLowerCase()
    const ex = queueByPerson.get(pk)
    if (!ex) {
      const la = lastAttemptByPerson.get(pk)
      queueByPerson.set(pk, {
        personKey: r.person_key, name: r.name, chargeId: r.charge_id, customerId: r.customer_id,
        trialCents: r.trial_cents, trialAt: r.trial_at, trialCount: 1,
        lastAt: la?.at ?? null, lastOutcome: la?.outcome ?? null,
      })
    } else {
      ex.trialCount++
      if (r.trial_at > ex.trialAt) {
        ex.trialAt = r.trial_at; ex.chargeId = r.charge_id; ex.trialCents = r.trial_cents; ex.customerId = r.customer_id
      }
    }
  }
  const rows = Array.from(queueByPerson.values()).sort((a, b) => {
    if (!a.lastAt && !b.lastAt) return a.trialAt.localeCompare(b.trialAt)
    if (!a.lastAt) return -1
    if (!b.lastAt) return 1
    return a.lastAt.localeCompare(b.lastAt)
  })

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 1240 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Trial recovery</h1>
      <p style={{ fontSize: 12.5, color: MUTE, marginTop: 6, maxWidth: 840, lineHeight: 1.6 }}>
        Only true retry candidates: lapsed by the charges, no money from the person anywhere in Stripe, no judgment from
        you or the sheet, a customer to bill, non-India, outside the no-card era. Fresh people float to the top, oldest
        trial first; attempted people sink and resurface by how long ago the last try was. Every click reorders the
        queue. A charge failure always offers the emailed invoice — declined and 3DS-challenged cards can pay a hosted
        invoice with a fresh card, which a merchant-initiated charge never can. The profile link opens Stripe SEARCH on
        their email, because one person can hold several customer accounts.
      </p>
      <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 10 }}>
        <a href="/admin/revenue" style={navChip}>← Revenue</a>
        <a href="/admin/revenue/unpaid" style={navChip}>Unpaid &amp; overdue →</a>
        <a href="/admin/revenue/outreach" style={navChip}>Revenue recovery (human sequences) →</a>
        <a href="/admin/revenue/trials" style={navChip}>Every trial &amp; status →</a>
      </div>

      <RecoveryQueue rows={rows} recovered={recoveredCount} invoiced={invoicedCount} />
    </div>
  )
}
