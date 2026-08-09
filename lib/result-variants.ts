// What each result-page variant IS, and what it actually did.
//
// The browser used to list ten entries as if they were peers, with a `live`
// flag set by hand and no numbers anywhere. Two of those flags were wrong, four
// of the entries were never pages at all, and the conversion data for every one
// of them was sitting on a different screen. So the page could not answer the
// only question worth asking: which of these sold?
//
// Three honest kinds:
//   live     what a real visitor can actually be served today
//   retired  a real page that ran, lost, and is kept only for reference
//   preview  a toggle for LOOKING at something. Never independently served,
//            so it can never have a conversion number of its own

import { createClient } from '@supabase/supabase-js'

export type VariantStatus = 'live' | 'retired' | 'preview'

export interface VariantResult {
  experiment: string
  exposures: number
  clickers: number
  paid: number
  clickPct: number
  paidPct: number
  /** True when this arm was declared the winner of that experiment. */
  won: boolean
}

export interface VariantMeta {
  key: string
  label: string
  status: VariantStatus
  note: string
  params: Record<string, string>
  /** Experiment arm names this variant was served under, for joining results. */
  armKeys?: string[]
}

export const RESULT_VARIANTS: VariantMeta[] = [
  {
    key: 'control',
    label: 'The live result page',
    status: 'live',
    note: 'Sell-first order. This is what every visitor gets unless a running experiment says otherwise.',
    params: {},
    armKeys: ['control'],
  },
  {
    key: 'adsrescue',
    label: 'Paid traffic + AI 101 rescue',
    status: 'live',
    note: 'The same page, plus an exit popup that only fires for li_ads traffic. Not a separate page, a behaviour.',
    params: { utm_source: 'li_ads' },
  },
  {
    key: 'aspirational',
    label: 'Aspirational hero',
    status: 'retired',
    note: 'Ran as result_aspirational_v1 and lost where it counts. It pulled far MORE clicks (53.3% vs 41.7%) and half the sales (2.17% vs 4.17%). The clearest click-quality trap we have on record.',
    params: { xv: 'aspirational' },
    armKeys: ['aspirational'],
  },
  {
    key: 'videofirst',
    label: 'Video-first order',
    status: 'retired',
    note: 'The order sell-first replaced. Re-tested as result_sellfirst_v2 and lost again on both clicks and sales, so it was stopped 2026-08-09.',
    params: { xv: 'videofirst' },
    armKeys: ['videofirst'],
  },
  {
    key: 'reveal',
    label: 'Unlock reveal wheel',
    status: 'retired',
    note: 'Ran as result_reveal_v1. Behind on clicks AND on money, and its clickers converted at half the rate (12.5% vs 22.7%). Stopped 2026-08-09 for lack of promise.',
    params: { xv: 'reveal' },
    armKeys: ['reveal'],
  },
  {
    key: 'express',
    label: 'One-tap wallets',
    status: 'preview',
    note: 'A checkout flag, not a page. Apple Pay only renders on a device that has it, which is why this exists to look at.',
    params: { express: '1' },
  },
  {
    key: 'aspirational-express',
    label: 'Aspirational + wallets',
    status: 'preview',
    note: 'Two toggles at once. Kept only because the combination renders differently from either alone.',
    params: { xv: 'aspirational', express: '1' },
  },
  { key: 'design-a', label: 'Hero lab A · leverage %', status: 'preview', note: 'Hero mockup from the 2026-08 design review. Never served to anyone.', params: { design: 'a' } },
  { key: 'design-b', label: 'Hero lab B · top % + gap', status: 'preview', note: 'Hero mockup from the 2026-08 design review. Never served to anyone.', params: { design: 'b' } },
  { key: 'design-c', label: 'Hero lab C · 3 stages', status: 'preview', note: 'Hero mockup from the 2026-08 design review. Never served to anyone.', params: { design: 'c' } },
  { key: 'design-d', label: 'Hero lab D · plan ready', status: 'preview', note: 'Hero mockup from the 2026-08 design review. Never served to anyone.', params: { design: 'd' } },
]

/**
 * Every experiment result, keyed by arm name.
 *
 * A variant can appear in several experiments (control has been the control arm
 * four times), so results are a LIST per arm rather than a single row. Merging
 * them into one average would hide that control's paid rate moved from 4.04% to
 * 7.35% across those runs, which is the most interesting thing in the data.
 */
export async function resultsByArm(): Promise<Map<string, VariantResult[]>> {
  const out = new Map<string, VariantResult[]>()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return out
  try {
    const c = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (i: RequestInfo | URL, n?: RequestInit) => fetch(i, { ...n, cache: 'no-store' }) },
    })
    const { data: exps } = await c
      .from('experiments')
      .select('key, page, winner_variant, created_at')
      .eq('page', 'result')
      .order('created_at', { ascending: false })

    for (const e of (exps || []) as { key: string; winner_variant: string | null }[]) {
      const { data: rs } = await c.rpc('experiment_results', { exp_key: e.key })
      for (const r of (rs || []) as { variant_key: string; exposures: number; clickers: number; net_new_paid: number }[]) {
        const exposures = Number(r.exposures) || 0
        // An arm nobody ever saw tells us nothing and would render as 0%,
        // which reads like a failure rather than an absence.
        if (exposures === 0) continue
        const list = out.get(r.variant_key) || []
        list.push({
          experiment: e.key,
          exposures,
          clickers: Number(r.clickers) || 0,
          paid: Number(r.net_new_paid) || 0,
          clickPct: (Number(r.clickers) / exposures) * 100,
          paidPct: (Number(r.net_new_paid) / exposures) * 100,
          won: e.winner_variant === r.variant_key,
        })
        out.set(r.variant_key, list)
      }
    }
  } catch { /* the UI renders variants without numbers rather than failing */ }
  return out
}
