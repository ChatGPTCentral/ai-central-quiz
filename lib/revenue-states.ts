// The trial state vocabulary — split out from lib/revenue-shared.ts so
// client components (the status dropdown, the trials table) can import it
// directly without pulling in that file's supabase-js server client.
//
// ONE source: revenue-shared.ts re-exports these rather than redefining
// them, so a server page and a client row can never disagree about what a
// state is called or colored.

/** The states a trial can be in. Deliberately exhaustive: every trial is in
 *  exactly one of them, so the counts always sum to the trial total. */
export type State = 'converted' | 'lifetime' | 'lapsed' | 'lapsed_covered' | 'not_due' | 'refunded' | 'manual'

export const STATE_LABEL: Record<State, string> = {
  converted: 'Converted',
  lifetime: 'Lifetime',
  lapsed: 'Did not convert',
  lapsed_covered: 'Person already pays',
  not_due: 'Trialing',
  refunded: 'Refunded / disputed',
  manual: 'Set aside by hand',
}
export const STATE_COLOR: Record<State, string> = { converted: '#2E7D32', lifetime: '#7E9BB5', lapsed: '#B00020', lapsed_covered: '#6B7FA3', not_due: '#B26A00', refunded: '#7A7A7A', manual: '#8A7A5C' }

/** THE MANUAL OVERRIDE WINS EVERYWHERE. The dropdown's state is a human
 *  judgment; a row with ANY override can never be lapsed, so it can never be
 *  in the retry queue and never chargeable. */
export const OVERRIDE_BUCKET: Record<string, State> = {
  yearly_subscriber: 'converted',
  recovered: 'converted',
  lifetime: 'lifetime',
  refunded: 'refunded',
  dispute: 'refunded',
  deleted: 'refunded',
  cancel: 'manual',
  no_payment: 'manual',
}

/** The live bucket for whatever the dropdown currently holds — 'auto' falls
 *  back to the server-derived state, anything else resolves through the
 *  override bucket. Shared by the dropdown (border/text color) and the row
 *  (background tint) so the two can never show different colors for the
 *  same value (owner, 2026-08-23: change by hand must repaint the row). */
export function liveState(value: string, derived: State): State {
  if (value === 'auto') return derived
  return OVERRIDE_BUCKET[value] ?? 'manual'
}
