// The trial state vocabulary — split out from lib/revenue-shared.ts so
// client components (the status dropdown, the trials table) can import it
// directly without pulling in that file's supabase-js server client.
//
// ONE source: revenue-shared.ts re-exports these rather than redefining
// them, so a server page and a client row can never disagree about what a
// state is called or colored.

/** The states a trial can be in. Deliberately exhaustive: every trial is in
 *  exactly one of them, so the counts always sum to the trial total. */
export type State = 'converted' | 'lifetime' | 'lapsed' | 'lapsed_covered' | 'not_due' | 'refunded' | 'cancelled'

// 'cancel' spent one round folded into Trialing (owner, first round: "same
// label, so people stop reading them as two facts"). The very next round,
// after the Actions column started rendering in every view, he saw what that
// actually produced: a cancelled row sitting in the same amber, in the same
// table, next to a live Charge button — "dobbiamo evitare che vengano per
// sbaglio billati nuovamente" (we must avoid accidentally billing them
// again). The two asks are not a contradiction once separated: he never
// objected to the WORD "Trialing" being wrong, he objected to seeing two
// words for what looked like neighbours. Putting 'cancelled' back as its own
// bucket, with its own grey and its own section below the main table (see
// TrialsTable.client.tsx), removes the neighbours instead of removing the
// distinction — cancel, dispute and refund all read as "will not auto-bill"
// on sight now, which is the actual thing he asked for both times.
// 'no_payment' was never touched by this and still buckets to 'lapsed': that
// override always recorded the same fact the auto-derived state already
// captures, so it stays one fact, one label, per the project's one-source
// rule.
export const STATE_LABEL: Record<State, string> = {
  converted: 'Converted',
  lifetime: 'Lifetime',
  lapsed: 'Did not convert',
  lapsed_covered: 'Person already pays',
  not_due: 'Trialing',
  refunded: 'Refunded / disputed',
  cancelled: 'Cancelled (your sheet)',
}
// 'lifetime' is light violet, not the old blue-grey: every row that can ever
// carry this state in trial_ledger is a $54.74 bundle (trial + lifetime in
// one charge, the "New" lifetime subscriber per the owner's 2026-08-23
// split) — checked against stripe_charges, 28 charges of $54.74, 28 ledger
// rows with lifetime_bundle=true, zero of anything else. The "Old" lifetime
// subscribers he also named (240 charges of exactly $49.75, sold with no
// trial at all) have no trial and so no row here to colour; see the note on
// TrialsTable.client.tsx.
export const STATE_COLOR: Record<State, string> = { converted: '#2E7D32', lifetime: '#8E6FA8', lapsed: '#B00020', lapsed_covered: '#6B7FA3', not_due: '#B26A00', refunded: '#7A7A7A', cancelled: '#7A7A7A' }

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
  cancel: 'cancelled',
  no_payment: 'lapsed',
}

/** The live bucket for whatever the dropdown currently holds — 'auto' falls
 *  back to the server-derived state, anything else resolves through the
 *  override bucket. Shared by the dropdown (border/text color) and the row
 *  (background tint) so the two can never show different colors for the
 *  same value (owner, 2026-08-23: change by hand must repaint the row). An
 *  override value this map does not recognize falls back to the derived
 *  state rather than a guess — the same thing 'auto' does. */
export function liveState(value: string, derived: State): State {
  if (value === 'auto') return derived
  return OVERRIDE_BUCKET[value] ?? derived
}
