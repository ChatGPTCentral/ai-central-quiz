// Revenue recovery — the human sequence board.
//
// Owner, 2026-08-20: "we gotta a) build sequences, b) keep track of that in a
// board, and basically 'send people to revenue recovery' aka removing them
// from the billing retry ledger and instead moving them into this other
// ledger."
//
// THREE THINGS ON THIS PAGE, matching the three things asked for:
//   1. COHORTS — revenue_recovery_members, grouped. Each cohort is a batch
//      pulled out of automatic billing for a stated reason.
//   2. SEQUENCE PROGRESS — revenue_recovery_board (a view joining that table
//      to recovery_outreach, which already carries a STAGE column — built
//      earlier today for exactly this, before the sequence idea had a name).
//   3. THE GRADUATION FACT ITSELF — a person here is invisible to
//      invoice_retry_queue and recovery_queue by construction, so the two
//      systems can never both touch the same person at once.
//
// This page reads, it does not send. No email goes out from here.

import { createClient } from '@supabase/supabase-js'
import OutreachBoard from './OutreachBoard.client'

export const dynamic = 'force-dynamic'
export const revalidate = 60

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const GREEN = '#2E7D32'
const AMBER = '#B26A00'
const RED = '#B00020'

const navChip: React.CSSProperties = {
  padding: '6px 12px', fontSize: 11.5, fontWeight: 700,
  border: '2px solid #1A1A1A', background: '#FFFDFA', color: '#1A1A1A', textDecoration: 'none',
}

interface BoardRow {
  person_key: string
  source: string
  reason: string
  cohort: string
  sequence_key: string | null
  moved_at: string
  customer_id: string | null
  charge_id: string | null
  trial_cents: number | null
  stage_reached: number | null
  last_sent_at: string | null
  emails_sent: number
  paid_since_graduating: boolean
}

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

const day = (s: string | null) => (s ? s.slice(0, 10) : '—')

export default async function RevenueRecoveryOutreachPage() {
  let rows: BoardRow[] = []
  let err: string | null = null
  try {
    const { data, error } = await sb().from('revenue_recovery_board').select('*').limit(2000)
    if (error) throw new Error(error.message)
    rows = (data ?? []) as BoardRow[]
  } catch (e) {
    err = e instanceof Error ? e.message : String(e)
  }

  if (err) {
    return (
      <div style={{ padding: 26 }}>
        <h1 style={{ fontWeight: 800, fontSize: 24 }}>Revenue recovery</h1>
        <p style={{ color: RED, marginTop: 10 }}>{err}</p>
      </div>
    )
  }

  const byCohort = new Map<string, BoardRow[]>()
  for (const r of rows) {
    const list = byCohort.get(r.cohort) ?? []
    list.push(r)
    byCohort.set(r.cohort, list)
  }

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 1240 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>Revenue recovery</h1>
      <p style={{ fontSize: 12.5, color: MUTE, marginTop: 6, maxWidth: 880, lineHeight: 1.6 }}>
        People pulled OUT of automatic billing and into a human-run email sequence. Once someone is here, they are
        invisible to Retry All on both the invoice and trial queues — the two systems never touch the same person at
        once. This page reads state, it never sends anything.
      </p>

      <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 12 }}>
        <a href="/admin/revenue" style={navChip}>← Revenue</a>
        <a href="/admin/revenue/unpaid" style={navChip}>Unpaid &amp; overdue →</a>
        <a href="/admin/revenue/recovery" style={navChip}>Trial recovery (automatic) →</a>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: MUTE, marginTop: 20 }}>Nobody graduated yet.</p>
      ) : (
        Array.from(byCohort.entries()).map(([cohort, list]) => {
          const sent = list.filter(r => r.emails_sent > 0).length
          const paid = list.filter(r => r.paid_since_graduating).length
          return (
            <section key={cohort} style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: INK }}>
                {cohort} <span style={{ color: MUTE, fontWeight: 600 }}>({list.length})</span>
              </h2>
              <p style={{ fontSize: 11.5, color: MUTE, marginTop: 4 }}>
                {sent} sent at least one email · {list.length - sent} never sent yet
                {paid > 0 && <span style={{ color: GREEN, fontWeight: 700 }}> · {paid} paid since graduating</span>}
              </p>
              <div style={{ marginTop: 10 }}>
                <OutreachBoard cards={list} />
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
