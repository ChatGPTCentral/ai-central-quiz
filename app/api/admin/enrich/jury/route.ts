// Run the identity jury over the people we already hold.
//
// Owner, 2026-09-04. The enrichment pipeline has had several providers for a
// while (Apollo, Databar, Cleanlist, Apify, Google search) but they only ever
// MERGED fields — filled gaps — and nobody ever asked whether the sources
// agreed the LinkedIn profile belongs to that human. This route asks, using
// lib/enrichment/identity-jury.ts, and reports the answer for the whole base.
//
// DEFAULT IS A DRY RUN. Nothing is written unless ?apply=true, and even then
// the only write is a PROMOTION: a row the jury proves becomes auto_verified
// with its evidence sentence. Nothing is ever downgraded here, and owner-set
// states are skipped before anything else happens — the ledger's law of
// 2026-08-22 is unchanged, this route only feeds it.
//
// Free jurors only, on purpose: the paid one (a provider resolving the stored
// URL) costs credits per person, so it gets its own explicit run once the
// owner has seen this triage and chosen where to spend.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySessionCookie, ADMIN_COOKIE_NAME } from '@/lib/admin-auth'
import { deterministicEvidence, isOwnerLocked } from '@/lib/enrichment/verification'
import { nameSlugVote, verdict } from '@/lib/enrichment/identity-jury'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Row = {
  id: string
  name: string | null
  email: string | null
  linkedin_url: string | null
  company_domain: string | null
  company_website: string | null
  verification_state: string | null
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
  })
}

export async function POST(req: NextRequest) {
  const cookieOk = await verifySessionCookie(req.cookies.get(ADMIN_COOKIE_NAME)?.value)
  if (!cookieOk) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const apply = new URL(req.url).searchParams.get('apply') === 'true'
  const c = db()

  const rows: Row[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await c
      .from('submissions')
      .select('id, name, email, linkedin_url, company_domain, company_website, verification_state')
      .not('linkedin_url', 'is', null)
      .order('id')
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) break
    rows.push(...(data as Row[]))
    if (data.length < 1000) break
  }

  const tally = {
    seen: rows.length,
    ownerLocked: 0,
    proven: 0,
    contested: 0,
    corroboratedOnly: 0,
    silent: 0,
    promoted: 0,
  }
  /** The rows a paid juror would actually convert: one agreeing free juror,
   *  one call away from the two the law needs. This is the spend list. */
  const oneVoteShort: string[] = []
  /** Rows where a juror contradicts the record — the owner's queue, ahead of
   *  everything else, because these are the likeliest wrong humans. */
  const contestedIds: string[] = []

  for (const r of rows) {
    if (isOwnerLocked(r.verification_state)) { tally.ownerLocked++; continue }

    const domain = deterministicEvidence(r.email, r.company_domain, r.company_website)
    const v = verdict([nameSlugVote(r.name, r.linkedin_url)], domain)

    if (v.contested) {
      tally.contested++
      if (contestedIds.length < 500) contestedIds.push(r.id)
      continue
    }
    if (v.proven) {
      tally.proven++
      if (apply && r.verification_state !== 'auto_verified') {
        const { error } = await c
          .from('submissions')
          .update({
            verification_state: 'auto_verified',
            verification_evidence: v.evidence,
            verified_at: new Date().toISOString(),
            verified_by: 'auto',
          })
          .eq('id', r.id)
          .not('verification_state', 'in', '("owner_verified","rejected")')
        if (!error) tally.promoted++
      }
      continue
    }
    if (v.agreeing === 1) {
      tally.corroboratedOnly++
      if (oneVoteShort.length < 3000) oneVoteShort.push(r.id)
      continue
    }
    tally.silent++
  }

  return NextResponse.json({
    mode: apply ? 'applied' : 'dry-run',
    tally,
    // Sizing for the paid juror, so the credit decision is made on a number
    // and not on a feeling: each of these is one call away from proof.
    paidJurorWouldClose: oneVoteShort.length,
    contestedSample: contestedIds.slice(0, 25),
  })
}
