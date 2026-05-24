import type { NormalizedPerson, MergedEnrichment, EnrichmentSource, LookupContext } from './types'
import { apolloProvider } from './apollo'
import { wizaProvider } from './wiza'
import { apifyProfileProvider } from './apify-profile'
import { mergeEnrichment, isEnrichmentComplete } from './merge'
import { setCached } from './cache'

export interface RowEnrichmentInput {
  email: string
  name?: string
  linkedinUrl?: string
  companyName?: string
}

export interface RowEnrichmentResult {
  merged: MergedEnrichment
  raw: Record<string, NormalizedPerson['raw']>
  status: 'complete' | 'partial' | 'failed'
  providersTried: EnrichmentSource[]
  strategy: 'all_three' | 'name_first' | 'email_only'
}

async function safeLookup(provider: typeof apolloProvider, ctx: LookupContext) {
  try { return await provider.lookup(ctx) } catch (err) {
    console.error(`${provider.name} threw:`, err)
    return null
  }
}

/**
 * Row-level enrichment "sudoku".
 *
 * Strategy depends on what signals we already have:
 *
 * 1. **name + email + linkedinUrl** → run Apify, Wiza, Apollo **in parallel** and merge.
 *    Max coverage; we already know who they are, just need to fill the row.
 *
 * 2. **name + email** → Apify (name+email) first; if no LinkedIn URL → Wiza; then Apollo.
 *
 * 3. **email only** → Wiza first; if no LinkedIn URL → Apollo;
 *    if Apollo surfaced a name, retry Apify with that name; then merge what we have.
 *
 * Goal: replace the placeholder avatar with the real face + fill every field.
 */
export async function runRowEnrichment(input: RowEnrichmentInput): Promise<RowEnrichmentResult> {
  const email = input.email.trim().toLowerCase()
  const ctx: LookupContext = {
    email,
    name: input.name?.trim() || undefined,
    linkedinUrl: input.linkedinUrl?.trim() || undefined,
    companyName: input.companyName?.trim() || undefined,
  }

  const results: NormalizedPerson[] = []
  const raw: Record<string, NormalizedPerson['raw']> = {}
  const tried: EnrichmentSource[] = []
  let strategy: RowEnrichmentResult['strategy']

  function record(r: NormalizedPerson | null) {
    if (r) {
      results.push(r)
      raw[r.source] = r.raw
    }
  }

  if (ctx.linkedinUrl && ctx.name && email) {
    // ── STRATEGY 1: max coverage — call all three in parallel ──────
    strategy = 'all_three'
    tried.push('apify_profile', 'wiza', 'apollo')
    const [ap, wz, ap2] = await Promise.all([
      safeLookup(apifyProfileProvider, ctx),
      safeLookup(wizaProvider, ctx),
      safeLookup(apolloProvider, ctx),
    ])
    record(ap); record(wz); record(ap2)
  } else if (ctx.name && email) {
    // ── STRATEGY 2: name+email — Apify first, then Wiza, then Apollo ──
    strategy = 'name_first'
    tried.push('apify_profile')
    let r = await safeLookup(apifyProfileProvider, ctx)
    record(r)
    if (!r?.linkedinUrl) {
      tried.push('wiza')
      r = await safeLookup(wizaProvider, ctx)
      record(r)
    }
    if (!hasLinkedin(results)) {
      tried.push('apollo')
      record(await safeLookup(apolloProvider, ctx))
    }
  } else {
    // ── STRATEGY 3: email only — Wiza → Apollo → (re-try Apify with newly-found name) ──
    strategy = 'email_only'
    tried.push('wiza')
    record(await safeLookup(wizaProvider, ctx))
    if (!hasLinkedin(results)) {
      tried.push('apollo')
      record(await safeLookup(apolloProvider, ctx))
    }
    if (!hasLinkedin(results)) {
      const partial = mergeEnrichment(results, [...tried])
      const learnedName = partial.fullName || [partial.firstName, partial.lastName].filter(Boolean).join(' ').trim()
      if (learnedName) {
        tried.push('apify_profile')
        record(await safeLookup(apifyProfileProvider, { ...ctx, name: learnedName, partial }))
      }
    }
  }

  const merged = mergeEnrichment(results, tried)
  const status: RowEnrichmentResult['status'] = isEnrichmentComplete(merged)
    ? 'complete'
    : (results.length > 0 ? 'partial' : 'failed')

  // Cache the merged result so future email-only lookups for this user are free.
  setCached(email, { data: merged, raw, status, providersTried: tried }).catch(() => {})

  return { merged, raw, status, providersTried: tried, strategy }
}

function hasLinkedin(results: NormalizedPerson[]): boolean {
  return results.some(r => !!r.linkedinUrl)
}
