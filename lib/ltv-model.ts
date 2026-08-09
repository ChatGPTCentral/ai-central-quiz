// The LTV model. ONE definition, read by the simulator and by the ads page.
//
// WHY IT LIVES HERE AND NOT IN A COMPONENT. The ads page prices paid traffic
// against what a customer is worth. The simulator projects cashflow from the
// same thing. If each screen carried its own arithmetic they would drift, and
// today already proved how that goes: the simulator said trial-to-annual was
// 25% while the ads page said 37%, because two files computed the same
// business fact two different ways.
//
// THE FORMULA, owner's spec:
//   LTV = trial + (year-1 renewal % x annual) + (year-2 renewal % x annual)
//
// Year 2 is deliberately a SEPARATE rate rather than year-1 squared. A second
// renewal is a different decision from the first: the person has had a full
// year of the product, so survivorship and habit both apply. Compounding one
// rate would be a modelling assumption dressed up as arithmetic.
//
// The percentages are ASSUMPTIONS, not measurements, and the UI must say so.
// We have 12 mature trials, and no year-2 data at all because the product has
// not been on this price for two years.

export const LTV_SETTINGS_KEY = 'ltv_model'

export interface LtvModel {
  /** The $4.99 trial. */
  trialUsd: number
  /** The annual that bills a month later, and again a year after that. */
  annualUsd: number
  /** Share of trials that convert to the first annual charge. */
  year1Pct: number
  /** Share of trials still paying at the SECOND annual charge. */
  year2Pct: number
}

/** Owner's starting assumptions: 50% into year 1, 25% into year 2. */
export const LTV_DEFAULTS: LtvModel = {
  trialUsd: 4.99,
  annualUsd: 59.75,
  year1Pct: 0.5,
  year2Pct: 0.25,
}

/** LTV = trial + y1 x annual + y2 x annual. */
export function ltvFrom(m: LtvModel): number {
  return m.trialUsd + m.year1Pct * m.annualUsd + m.year2Pct * m.annualUsd
}

/** Revenue in a given year from ONE trial bought today, for cashflow curves. */
export function ltvByYear(m: LtvModel): { year: number; revenue: number; cumulative: number }[] {
  const perYear = [m.trialUsd, m.year1Pct * m.annualUsd, m.year2Pct * m.annualUsd]
  let running = 0
  return perYear.map((revenue, i) => {
    running += revenue
    return { year: i, revenue, cumulative: running }
  })
}

/**
 * Coerce whatever is in app_settings into a usable model.
 *
 * Deliberately total: a missing row, a half-written row or a value someone
 * typed as a percentage instead of a fraction must never produce NaN on a page
 * that prices advertising. Anything unparseable falls back to the default for
 * that field alone rather than discarding the whole saved model.
 */
export function parseLtvModel(raw: unknown): LtvModel {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown, fallback: number): number => {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
    return Number.isFinite(n) ? n : fallback
  }
  // Accept 50 or 0.5 for a percentage. People type both, and silently reading
  // "50" as 5000% would make a channel look infinitely profitable.
  const pct = (v: unknown, fallback: number): number => {
    const n = num(v, fallback)
    const asFraction = n > 1 ? n / 100 : n
    return Math.min(1, Math.max(0, asFraction))
  }
  return {
    trialUsd: Math.max(0, num(o.trialUsd, LTV_DEFAULTS.trialUsd)),
    annualUsd: Math.max(0, num(o.annualUsd, LTV_DEFAULTS.annualUsd)),
    year1Pct: pct(o.year1Pct, LTV_DEFAULTS.year1Pct),
    year2Pct: pct(o.year2Pct, LTV_DEFAULTS.year2Pct),
  }
}
