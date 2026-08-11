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
 *  lifetime bought alongside it; $3.99 was an earlier era's trial price. */
export const TRIAL_PRICES = new Set([399, 499, 5474])
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
  email?: string | null; customer_email?: string | null; customer_id?: string | null; description?: string | null
}

export const CHARGE_SELECT = 'id, amount_cents, charged_at, refunded, email, customer_email, customer_id, description'

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

    if (!t.trial_refunded) {
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
      const usd = t.trial_cents / 100
      if (t.attribution === 'quiz_net_new') {
        entries.push({ ...who, at: anchor, chargedAt: t.trial_at, kind: 'net', usd, why: 'trial, quiz earned it from a new customer' })
      } else if (t.attribution === 'quiz_existing') {
        entries.push({ ...who, at: anchor, chargedAt: t.trial_at, kind: 'quizExisting', usd, why: 'trial, quiz earned it from an existing customer' })
      } else {
        entries.push({ ...who, at: t.trial_at, chargedAt: t.trial_at, kind: 'notQuiz', usd, why: 'trial, no quiz before the charge' })
      }
    }

    if (t.converted_at && t.converted_cents) {
      if (t.converted_charge_id) accounted.add(t.converted_charge_id)
      if (t.lifetime_bundle) {
        // A lifetime is NOT an annual. Owner's rule, stated twice: the $4.99
        // half of a $54.74 bundle belongs with the trials, the $49.75 half is
        // Other Revenue. Won trials means $59.75 renewals, full stop.
        entries.push({ ...who, at: t.trial_at, chargedAt: t.trial_at, kind: 'other', usd: 49.75, why: 'the $49.75 lifetime half of a $54.74 bundle' })
      } else if (anchor < mirrorStart) {
        preWindowAnnuals++
      } else {
        entries.push({
          ...who,
          at: anchor,
          chargedAt: t.converted_at,
          chargeId: t.converted_charge_id || t.charge_id,
          kind: quizEarned ? 'annualQuiz' : 'annualNotQuiz',
          usd: t.converted_cents / 100,
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
        usd: (ch.amount_cents === 5474 ? 499 : ch.amount_cents) / 100,
        chargeId: ch.id, personKey: who, name: ch.description ?? null,
        customerId: ch.customer_id ?? null, submissionId: null,
        why: 'a paid trial the ledger did not pick up, counted here because a trial is never Other Revenue',
      })
      if (ch.amount_cents === 5474) {
        entries.push({
          at: ch.charged_at, chargedAt: ch.charged_at, kind: 'other', usd: 49.75,
          chargeId: `${ch.id}-lt`, personKey: who, name: ch.description ?? null,
          customerId: ch.customer_id ?? null, submissionId: null,
          why: 'the $49.75 lifetime half of a $54.74 bundle',
        })
      }
      continue
    }
    if (ch.amount_cents === ANNUAL_CENTS) {
      entries.push({
        at: ch.charged_at, chargedAt: ch.charged_at, kind: 'annualNotQuiz', usd: ch.amount_cents / 100,
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
      usd: ch.amount_cents / 100,
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

  return { entries, trialPoints, lifetimeSplits, preWindowAnnuals, quizExistingEmails, netNewEmails }
}
