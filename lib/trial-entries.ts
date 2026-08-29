// THE classification pass. One function, two callers.
//
// The dashboard sums these entries into cells; /api/admin/drill returns the
// entries themselves so a cell can be opened and read row by row. Both call
// classifyLedger(), so "what the number is" and "what the number is made of"
// cannot drift: the drill-down is not a second query that happens to agree, it
// is the same array, filtered.
//
// That property is the point. Two days of "are these numbers right" were spent
// diagnosing sums that nobody could open (owner, 2026-08-11), and a total you
// cannot expand is a total you have to take on faith.

export type Gran = 'day' | 'week' | 'month'

/** Bucket an ISO timestamp for a granularity → a sortable key.
 *  day → YYYY-MM-DD · week → Monday YYYY-MM-DD · month → YYYY-MM */
export function bucketKey(iso: string, gran: Gran): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  if (gran === 'month') return d.toISOString().slice(0, 7)
  if (gran === 'week') { const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10) }
  return d.toISOString().slice(0, 10)
}

/** The day AFTER a bucket's last day, as YYYY-MM-DD — its exclusive end. */
export function bucketEnd(bucket: string, gran: Gran): string {
  if (gran === 'month') {
    const [y, m] = bucket.split('-').map(Number)
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  }
  const d = new Date(`${bucket}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (gran === 'week' ? 7 : 1))
  return d.toISOString().slice(0, 10)
}

// 'net'           quiz earned the trial from someone who had never paid. Quiz clock.
// 'quizExisting'  quiz earned the trial from an existing customer. Quiz clock.
// 'notQuiz'       never took the quiz, or took it after paying. Charge clock.
// 'annualQuiz'    a renewal whose trial the quiz earned. On ITS TRIAL'S clock.
// 'annualNotQuiz' a renewal behind a trial the quiz never touched.
// 'other'         every remaining dollar: legacy subscriptions, old annual
//                 prices, lifetime halves, duplicate subscriptions. Charge clock.
export type RevKind = 'net' | 'quizExisting' | 'notQuiz' | 'annualQuiz' | 'annualNotQuiz' | 'other'

/** The prices that ARE a paid trial. $54.74 is the $4.99 trial with the $49.75
 *  lifetime bought alongside it; $3.99 was an earlier era's trial price;
 *  $14.95 is the founding-window LIST price (2026-08-18) charged after a
 *  person's personal $4.99 window expires. */
export const TRIAL_PRICES = new Set([399, 499, 1495, 5474])
/** The subscription price. Never Other Revenue. */
export const ANNUAL_CENTS = 5975

export type LedgerRow = {
  charge_id: string; person_key: string; trial_at: string; trial_cents: number; trial_refunded: boolean
  lifetime_bundle: boolean; attribution: string; quiz_completed_at: string | null
  converted_at: string | null; converted_cents: number | null; converted_charge_id: string | null
  due: boolean; converted: boolean
  name?: string | null; customer_id?: string | null; country?: string | null; utm_source?: string | null
  submission_id?: string | null
}

export type ChargeRow = {
  id: string; amount_cents: number; charged_at: string; refunded: boolean
  amount_refunded_cents?: number | null; dispute_lost_cents?: number | null
  dispute_open_cents?: number | null; dispute_fee_cents?: number | null; fee_cents?: number | null
  settled_cents?: number | null; settled_currency?: string | null; bt_exchange_rate?: number | null
  email?: string | null; customer_email?: string | null; customer_id?: string | null; description?: string | null
}

export const CHARGE_SELECT = 'id, amount_cents, charged_at, refunded, amount_refunded_cents, dispute_lost_cents, dispute_open_cents, dispute_fee_cents, fee_cents, settled_cents, settled_currency, bt_exchange_rate, email, customer_email, customer_id, description'

/** Charge-weighted average USD→EUR settlement rate across the euro era: the
 *  fallback for the rare euro-settled charge with no conversion of its own
 *  (one native-€250 charge). */
export function eurAvgRate(
  charges: Pick<ChargeRow, 'settled_currency' | 'bt_exchange_rate' | 'settled_cents' | 'amount_cents'>[],
): number {
  let settled = 0
  let amount = 0
  for (const ch of charges) {
    if (ch.settled_currency === 'eur' && ch.bt_exchange_rate) {
      settled += ch.settled_cents ?? 0
      amount += ch.amount_cents
    }
  }
  return amount > 0 ? settled / amount : 1
}

/** THE money a charge actually kept, in day-rate USD cents. This is the
 *  owner's NET (2026-08-17, stated three times, the third: "net is 77K not
 *  83"): what remains after refunds, lost disputes, open-dispute
 *  withholdings, and Stripe's processing and dispute fees, with euro-settled
 *  charges (the 2024→Jul-2025 PayPal/invoice era) valued at the dollar rate
 *  of their own day (bt_exchange_rate carries Stripe's 2% conversion fee, so
 *  market ≈ rate / 0.98). Per charge this is exactly what the Stripe home
 *  screen's "Net volume" sums, so every display built from it can be
 *  verified against a screen the owner already has. NEGATIVE IS REAL: a
 *  fully refunded charge kept minus-its-fee (Stripe held the fee), and a
 *  lost dispute costs the fee plus the $15 penalty on top of the
 *  clawed-back money — Stripe's Net volume counts those below zero and so
 *  does every display built from this.
 *
 *  ONE FORMULA, imported everywhere money is summed (classifier pool,
 *  revenue loader, era table). If a new deduction ever appears, it is added
 *  HERE, once. Before the first fee-aware sync the fee and settlement
 *  columns are zero/null and this degrades to refunds + lost disputes. */
export function keptUsdCents(
  ch: Pick<ChargeRow, 'amount_cents' | 'settled_cents' | 'settled_currency' | 'bt_exchange_rate' | 'fee_cents' | 'dispute_fee_cents' | 'amount_refunded_cents' | 'dispute_lost_cents' | 'dispute_open_cents'>,
  avgRate: number,
): number {
  const outFace = (ch.amount_refunded_cents ?? 0) + (ch.dispute_lost_cents ?? 0) + (ch.dispute_open_cents ?? 0)
  const fees = (ch.fee_cents ?? 0) + (ch.dispute_fee_cents ?? 0)
  if (ch.settled_currency === 'eur') {
    // Everything in euros first (fees are euro cents on these rows; refunds
    // convert at the charge's own rate), then to USD at that day's market.
    const eurNet = (ch.settled_cents ?? ch.amount_cents) - fees - Math.round(outFace * (ch.bt_exchange_rate || 1))
    return Math.round(eurNet / ((ch.bt_exchange_rate || avgRate) / 0.98))
  }
  return ch.amount_cents - fees - outFace
}

/** One classified dollar amount, carrying WHO it came from and WHY it is
 *  here, so the same object can be summed into a cell or listed in a drawer. */
export type Entry = {
  /** The clock this entry sits on: quiz date for quiz-earned rows, charge date
   *  otherwise. This is the field that decides the column. */
  at: string
  kind: RevKind
  usd: number
  chargeId: string
  personKey: string
  name: string | null
  customerId: string | null
  submissionId: string | null
  /** When the money actually moved, which for a quiz-earned row is NOT `at`. */
  chargedAt: string
  /** Plain-language reason this entry exists, shown in the drawer. */
  why: string
}

/** One trial, with everything the count rows need and the identity the drawer
 *  needs. `at` is the same clock the money uses, so a rate and its money can
 *  never describe different weeks. */
export type TrialPoint = {
  at: string
  chargedAt: string
  due: boolean
  converted: boolean
  attribution: string
  chargeId: string
  personKey: string
  name: string | null
  customerId: string | null
  submissionId: string | null
  quizAt: string | null
  trialCents: number
  convertedCents: number | null
  convertedAt: string | null
  lifetimeBundle: boolean
}

export const LEDGER_SELECT =
  'charge_id, person_key, submission_id, name, customer_id, country, utm_source, trial_at, trial_cents, trial_refunded, lifetime_bundle, attribution, quiz_completed_at, converted_at, converted_cents, converted_charge_id, due, converted'

/** Read the whole ledger plus the raw charge list. One loader, so the drill
 *  endpoint and the dashboard read the same rows over the same window. */
export async function loadLedgerAndCharges(
  c: { from: (t: string) => any },
  mirrorStartIso = '2026-06-29',
): Promise<{ ledger: LedgerRow[]; charges: ChargeRow[] }> {
  const ledger: LedgerRow[] = []
  for (let o = 0; o < 20_000; o += 1000) {
    const { data, error } = await c.from('trial_ledger').select(LEDGER_SELECT).order('trial_at').range(o, o + 999)
    if (error || !data) break
    ledger.push(...(data as LedgerRow[]))
    if (data.length < 1000) break
  }

  // Every charge, so "other revenue" is an EXACT residual: the account total
  // minus the charges the ledger already accounts for.
  const charges: ChargeRow[] = []
  for (let o = 0; o < 20_000; o += 1000) {
    const { data, error } = await c
      .from('stripe_charges')
      .select(CHARGE_SELECT)
      .gte('charged_at', `${mirrorStartIso}T00:00:00Z`)
      .order('charged_at')
      .range(o, o + 999)
    if (error || !data) break
    charges.push(...(data as ChargeRow[]))
    if (data.length < 1000) break
  }

  return { ledger, charges }
}

/** True when the quiz can claim the trial: a new customer it convinced, or an
 *  existing one it convinced again. Both are the north star. */
export function isQuizEarned(attribution: string): boolean {
  return attribution === 'quiz_net_new' || attribution === 'quiz_existing'
}

/**
 * Turn ledger rows plus the raw charge list into the classified entries every
 * money number on the dashboard is built from.
 *
 * `mirrorStartIso` is where the charge mirror begins. A renewal whose TRIAL
 * predates it would otherwise be dropped onto an off-screen cohort, so those
 * are counted separately and disclosed rather than shown under a week that
 * could not have produced them.
 */
export function classifyLedger(
  ledger: LedgerRow[],
  charges: ChargeRow[],
  mirrorStartIso: string,
): {
  entries: Entry[]
  trialPoints: TrialPoint[]
  lifetimeSplits: number
  preWindowAnnuals: number
  quizExistingEmails: Set<string>
  netNewEmails: Set<string>
} {
  const entries: Entry[] = []
  const trialPoints: TrialPoint[] = []
  const quizExistingEmails = new Set<string>()
  const netNewEmails = new Set<string>()
  let lifetimeSplits = 0
  let preWindowAnnuals = 0
  const accounted = new Set<string>()
  const mirrorStart = `${mirrorStartIso}T00:00:00Z`
  // The real amount behind each charge id: bundle emission is gated on the
  // CHARGE being $54.74, never on ledger stamps (see below).
  const chargeCents = new Map<string, number>()
  for (const ch of charges) chargeCents.set(ch.id, ch.amount_cents)

  // NET = KEPT (owner's rule, 2026-08-17, final form: "net is 77K not 83").
  // Every entry a charge emits is reduced down to what the charge actually
  // banked — refunds, lost disputes, open-dispute withholdings, Stripe's
  // fees, and the euro era's day-rate conversion, via the ONE keptUsdCents
  // formula — consumed in emission order, so every sum built from entries
  // (matrix rows, revenue columns, drill drawers, per-trial totals) is the
  // same net the owner's Stripe home screen shows, by construction.
  // Classification still MATCHES on face amounts (a partially refunded
  // $4.99 is still a trial); only the money it contributes is netted.
  const avgRate = eurAvgRate(charges)
  const deductionLeft = new Map<string, number>()
  const dInit = new Map<string, number>()
  // Face cents each charge actually emitted through netCents, so the sweep
  // at the end can reconcile every charge to its true kept money.
  const emittedGross = new Map<string, number>()
  for (const ch of charges) {
    const d = ch.amount_cents - keptUsdCents(ch, avgRate)
    dInit.set(ch.id, d)
    if (d > 0) deductionLeft.set(ch.id, d)
  }
  const netCents = (chargeId: string, grossCents: number): number => {
    emittedGross.set(chargeId, (emittedGross.get(chargeId) ?? 0) + grossCents)
    const left = deductionLeft.get(chargeId)
    if (!left) return grossCents
    const take = Math.min(left, grossCents)
    deductionLeft.set(chargeId, left - take)
    return grossCents - take
  }

  for (const t of ledger) {
    if (t.lifetime_bundle) lifetimeSplits++
    // A quiz-earned trial restates to the week the person took the quiz; the
    // cohort owns the sale. Everything else sits where it was charged.
    const quizEarned = isQuizEarned(t.attribution)
    const anchor = quizEarned && t.quiz_completed_at ? t.quiz_completed_at : t.trial_at
    const who = {
      chargeId: t.charge_id,
      personKey: t.person_key,
      name: t.name ?? null,
      customerId: t.customer_id ?? null,
      submissionId: t.submission_id ?? null,
    }

    // GROSS, ALWAYS (owner's rule 5 and 1, restated 2026-08-29 after the
    // dashboard's ALL TRIALS cell moved 100 -> 98 the moment two July trials
    // synced in as refunded: "il numero che voglio vedere in all trials deve
    // essere il gross"). A refunded trial IS STILL a trial the quiz produced;
    // the refund is a fact about the MONEY, not about whether the sale
    // happened. So this pushes unconditionally now, refunded or not — the
    // count is never gated on trial_refunded again, anywhere.
    //
    // This does not touch rule 6 (money stays NET): netCents() below still
    // nets a refunded trial down through the SAME deductionLeft pool the
    // "-cost" sweep at the bottom of this function draws from, so a fully
    // refunded $4.99 now emits as $0.00 here and the sweep's residual entry
    // (Stripe's kept fee, negative, same kind) absorbs the rest — the kind's
    // TOTAL money is exactly what it was before this change, only the COUNT
    // gained the person. Verified by hand against Bianco/Mitchell, the two
    // July refunds that surfaced this: quizExisting and notQuiz kept their
    // pre-fix totals to the cent, both now show 1 more gross trial.
    accounted.add(t.charge_id)
    trialPoints.push({
      ...who,
      at: anchor,
      chargedAt: t.trial_at,
      due: t.due,
      converted: t.converted,
      attribution: t.attribution,
      quizAt: t.quiz_completed_at,
      trialCents: t.trial_cents,
      convertedCents: t.converted_cents,
      convertedAt: t.converted_at,
      lifetimeBundle: t.lifetime_bundle,
    })
    // Both sets come from the ledger's own person key, so "who is net-new"
    // and "who is an existing-customer buyer" have exactly one definition.
    if (t.person_key?.includes('@')) {
      if (t.attribution === 'quiz_net_new') netNewEmails.add(t.person_key)
      else if (t.attribution === 'quiz_existing') quizExistingEmails.add(t.person_key)
    }
    const usd = netCents(t.charge_id, t.trial_cents) / 100
    const refundNote = t.trial_refunded ? ', later refunded' : ''
    if (t.attribution === 'quiz_net_new') {
      entries.push({ ...who, at: anchor, chargedAt: t.trial_at, kind: 'net', usd, why: `trial, quiz earned it from a new customer${refundNote}` })
    } else if (t.attribution === 'quiz_existing') {
      entries.push({ ...who, at: anchor, chargedAt: t.trial_at, kind: 'quizExisting', usd, why: `trial, quiz earned it from an existing customer${refundNote}` })
    } else {
      entries.push({ ...who, at: t.trial_at, chargedAt: t.trial_at, kind: 'notQuiz', usd, why: `trial, no quiz before the charge${refundNote}` })
    }

    // The $49.75 half of a $54.74 bundle exists the moment the CHARGE does,
    // whether or not the view ever stamped a conversion. This used to live
    // inside the converted_at gate below, and 27 unstamped bundles were
    // dropping their halves ($1,343.25) with no rescue possible: the trial
    // row had already claimed the charge, so the residual never saw it.
    // Caught by the on-page identity line the day it shipped (owner,
    // 2026-08-16). A lifetime is NOT an annual — owner's rule, stated twice:
    // the $4.99 half belongs with the trials, the $49.75 half is Other
    // Revenue. Gate on the charge amount, never on stamps or flags — and, as
    // of the gross-count fix above, never on refund status either, for the
    // same reason and with the same sweep-neutrality guarantee.
    if (chargeCents.get(t.charge_id) === 5474) {
      entries.push({ ...who, at: t.trial_at, chargedAt: t.trial_at, chargeId: `${t.charge_id}-lt`, kind: 'other', usd: netCents(t.charge_id, 4975) / 100, why: 'the $49.75 lifetime half of a $54.74 bundle' })
    }

    // A conversion entry needs a real, SEPARATE converted charge: a bundle
    // whose "conversion" is its own purchase already emitted its half above,
    // and a flag on a row must never replace the actual money (one
    // bundle-flagged row with a genuine $59.75 renewal was emitting $49.75
    // in its place — a quiet $10 identity leak).
    if (t.converted_at && t.converted_cents && t.converted_charge_id && t.converted_charge_id !== t.charge_id) {
      accounted.add(t.converted_charge_id)
      if (anchor < mirrorStart) {
        preWindowAnnuals++
      } else {
        entries.push({
          ...who,
          at: anchor,
          chargedAt: t.converted_at,
          chargeId: t.converted_charge_id,
          kind: quizEarned ? 'annualQuiz' : 'annualNotQuiz',
          usd: netCents(t.converted_charge_id, t.converted_cents) / 100,
          why: quizEarned
            ? 'renewal of a trial the quiz earned, credited to that trial'
            : 'renewal of a trial the quiz never touched',
        })
      }
    }
  }

  // The residual, and WHAT EACH PIECE OF IT IS.
  //
  // This used to say "a charge no trial in the ledger accounts for" on every
  // row, which is true and useless: it reads as "we do not know what this is"
  // whether the charge is a legacy subscription or somebody's second $4.99
  // from twenty minutes after their first. The owner opened this cell on
  // 2026-08-11 and could not tell a real misfiling from a known one, so now
  // each row says which it is.
  const peopleWithTrials = new Set(ledger.filter(t => !t.trial_refunded).map(t => t.person_key))
  for (const ch of charges) {
    if (ch.refunded) continue
    if (accounted.has(ch.id)) continue
    const who = ch.customer_email || ch.email || ch.customer_id || ''

    // RULE 4 (owner, 2026-08-11): Other Revenue may contain no paid trial and
    // no $59.75 subscription. It is the residual of legacy monthly and annual
    // subscriptions, nothing else.
    //
    // The ledger currently leaves none of either behind, so neither branch
    // below fires today. They exist so that the rule holds by construction
    // rather than by luck: if a future charge slips past the ledger it lands
    // in the right row and says out loud that it arrived by the back door,
    // instead of quietly padding Other Revenue the way the old duplicate
    // trials did.
    if (TRIAL_PRICES.has(ch.amount_cents)) {
      entries.push({
        at: ch.charged_at, chargedAt: ch.charged_at, kind: 'notQuiz',
        usd: netCents(ch.id, ch.amount_cents === 5474 ? 499 : ch.amount_cents) / 100,
        chargeId: ch.id, personKey: who, name: ch.description ?? null,
        customerId: ch.customer_id ?? null, submissionId: null,
        why: 'a paid trial the ledger did not pick up, counted here because a trial is never Other Revenue',
      })
      if (ch.amount_cents === 5474) {
        entries.push({
          at: ch.charged_at, chargedAt: ch.charged_at, kind: 'other', usd: netCents(ch.id, 4975) / 100,
          chargeId: `${ch.id}-lt`, personKey: who, name: ch.description ?? null,
          customerId: ch.customer_id ?? null, submissionId: null,
          why: 'the $49.75 lifetime half of a $54.74 bundle',
        })
      }
      continue
    }
    if (ch.amount_cents === ANNUAL_CENTS) {
      entries.push({
        at: ch.charged_at, chargedAt: ch.charged_at, kind: 'annualNotQuiz', usd: netCents(ch.id, ch.amount_cents) / 100,
        chargeId: ch.id, personKey: who, name: ch.description ?? null,
        customerId: ch.customer_id ?? null, submissionId: null,
        why: 'a $59.75 subscription with no trial claiming it, counted here because a renewal is never Other Revenue',
      })
      continue
    }

    entries.push({
      at: ch.charged_at,
      chargedAt: ch.charged_at,
      kind: 'other',
      usd: netCents(ch.id, ch.amount_cents) / 100,
      chargeId: ch.id,
      personKey: who,
      name: ch.description ?? null,
      customerId: ch.customer_id ?? null,
      submissionId: null,
      why: peopleWithTrials.has(who)
        ? 'a legacy subscription price from someone who also has a trial with us'
        : 'a legacy monthly or annual subscription, from before the trial offer',
    })
  }

  // THE NEGATIVE TAIL. netCents floors every emission at zero, but some
  // charges kept LESS than nothing: Stripe holds the processing fee on a
  // fully refunded charge, and a lost dispute costs the fee plus the $15
  // penalty on top of the clawed-back money. Stripe's Net volume counts
  // those below zero, so the matrix must too — whatever each charge's own
  // emissions could not absorb lands here as a negative entry, and the
  // kinds-sum equals the kept-money total to the penny, by construction.
  // Each residual lands in the KIND ITS CHARGE BELONGS TO, never dumped
  // into Other Revenue. The first version put every cost in 'other', which
  // filled the owner's Other Revenue drill with "Subscription creation"
  // rows that were really the dispute costs of CONVERTED trials (caught by
  // the owner, 2026-08-18) — and rule 4 says Other may hold no trial and no
  // subscription, their costs included.
  const trialKindByCharge = new Map<string, RevKind>()
  const renewalKindByCharge = new Map<string, RevKind>()
  for (const t of ledger) {
    trialKindByCharge.set(t.charge_id,
      t.attribution === 'quiz_net_new' ? 'net' : t.attribution === 'quiz_existing' ? 'quizExisting' : 'notQuiz')
    if (t.converted_charge_id && t.converted_charge_id !== t.charge_id) {
      renewalKindByCharge.set(t.converted_charge_id, isQuizEarned(t.attribution) ? 'annualQuiz' : 'annualNotQuiz')
    }
  }
  const residualKind = (ch: ChargeRow): RevKind => {
    const asRenewal = renewalKindByCharge.get(ch.id)
    if (asRenewal) return asRenewal
    const asTrial = trialKindByCharge.get(ch.id)
    if (asTrial) return asTrial
    if (TRIAL_PRICES.has(ch.amount_cents)) return 'notQuiz'
    if (ch.amount_cents === ANNUAL_CENTS) return 'annualNotQuiz'
    return 'other'
  }
  const swept = new Set<string>()
  for (const ch of charges) {
    if (swept.has(ch.id)) continue
    swept.add(ch.id)
    const d = dInit.get(ch.id) ?? 0
    const left = deductionLeft.get(ch.id) ?? 0
    const consumed = d - left
    const emitted = (emittedGross.get(ch.id) ?? 0) - consumed
    const residual = (ch.amount_cents - d) - emitted
    if (residual === 0) continue
    // A refunded-flagged charge with NO deduction detail (missing refund
    // data) must not sneak its face value back in as "kept": skip positive
    // residues on never-emitted refunded charges, the pre-detail behavior.
    if (residual > 0 && ch.refunded && (emittedGross.get(ch.id) ?? 0) === 0) continue
    const disputed = (ch.dispute_lost_cents ?? 0) > 0 || (ch.dispute_fee_cents ?? 0) !== 0
    entries.push({
      at: ch.charged_at, chargedAt: ch.charged_at, kind: residualKind(ch), usd: residual / 100,
      chargeId: `${ch.id}-cost`,
      personKey: (ch.customer_email || ch.email || ch.customer_id || 'unknown').toLowerCase(),
      name: ch.description ?? null, customerId: ch.customer_id ?? null, submissionId: null,
      why: disputed
        ? 'what a lost or open dispute costs beyond the clawed-back charge: Stripe’s fee stays kept and the $15 dispute penalty comes on top'
        : 'Stripe kept its processing fee when this charge was refunded',
    })
  }

  return { entries, trialPoints, lifetimeSplits, preWindowAnnuals, quizExistingEmails, netNewEmails }
}
