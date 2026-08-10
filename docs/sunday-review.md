# The Sunday review

Every Sunday, before planning anything new: read what happened, then decide
what to change. In that order. The point of the ritual is that the week's
decisions come from the week's data rather than from whatever felt urgent on
Friday.

Trigger it by saying **"sunday review"**. Supersedes
`docs/weekly-optimization-routine.md`, which was written on 11 July and keys
net-new on `staged_at` — a column enrichment re-stamps, and which we replaced
on 09 August.

---

## Before anything: the definitions that took a full day to get right

Get these wrong and every number below is wrong in a way that still looks
plausible. All four were live bugs.

| Use | Never use | Why |
|---|---|---|
| `quiz_completed_at` | `created_at`, `staged_at`, `ts` | `created_at` means "first seen in the CRM by ANY route" and the quiz only sets it on INSERT, so an existing subscriber keeps their old date. `staged_at` has four writers. `quiz_completed_at` is write-once, enforced by a database trigger. |
| net-new = `stripe_first_charge_at > quiz_completed_at` | any charge | Someone who paid before their quiz is an existing customer. Four were inflating the north star. |
| `sheet_trials` for the trial→yearly rate | our Stripe-derived RPC | The sheet is reconciled against invoices: 54.3% of 694. The RPC says 37% across a mixed multi-year base. A twelve-trial sample once said 66.7%; it was noise. |
| `source='quiz_v2'` | `population='quiz_current'` alone | Both agree now, but only because the generated column was fixed. Prefer the explicit one. |

**Exclude the last two months from any conversion rate.** A trial bills its
annual a month later, so recent cohorts always look weak. July 2026 reads 27%
purely because those trials are not due yet. Treating that as a trend is the
easiest mistake on this whole page.

---

## 1. What happened (read only, no opinions yet)

**The funnel, week over week.** Landing views → quiz starts → completions →
checkout clicks → net-new paid, from `funnel_events` and `submissions`, bucketed
on `quiz_completed_at`. Name the single biggest step loss in absolute people,
not in percent — a 30% loss on 20 people is not the problem.

**The money.** From `sheet_trials`: trials, trial→yearly on mature months, and
revenue. Compare against the dashboard so the two cannot silently drift.

**PostHog, which is the half we could not see before 09 August.**
- Buyers cohort `469666` · Quiz drop-offs `469667` · Paid traffic `469668`
- The replay scanner's daily writeups: what people actually did before leaving
- `$dead_click` and `$rageclick` by page and element — the Next button was 84
  dead clicks across 31 of 35 people and nobody knew
- `$exception` by message — this caught a Clarity bug of ours within two queries
- `posthog_snapshots` holds the buyer-cohort answers from the daily sync

**Experiments.** For each running row, `experiment_results(<key>)`: exposures,
click rate, and **net-new paid**. Judge on paid. Click rate has now been wrong
twice — the aspirational hero pulled 53.3% of clicks against 41.7% and sold
half as much.

---

## 2. What it means

Three questions, in this order:

1. **Did last week's change do what we predicted?** If we shipped something with
   a stated prediction, settle it. A prediction nobody checks is a wish.
2. **Where is the biggest absolute loss now?** It moves. It has been the email
   step, the landing page, and the checkout in successive weeks.
3. **Is anything broken that we would not otherwise notice?** Exceptions, dead
   clicks, failed renewals, a metric that stopped moving. Most of the real finds
   this month arrived this way rather than from looking where we expected.

---

## 3. What to change

**One change per surface per week.** Two changes to the quiz in one week and
neither is readable. This is why the Q2 reword shipped alone.

Prefer, in order:

1. **A deterministic fix.** A dead button, a broken tag, a wrong label. No
   experiment needed and no traffic spent — just fix it.
2. **A copy change with a stated prediction**, shipped and measured before/after
   on a single step. At ~60 starts a day, proving a 2-point move on one step
   needs about 1,400 per arm, i.e. seven weeks. Do not A/B what you can ship and
   watch.
3. **An A/B, but only where the metric is high-volume.** `view_to_start` has
   ~1,300 events a fortnight and reads in two weeks. Purchases do not. Every
   experiment that died inconclusive was pointed at a rare event.

**Write the prediction down before shipping**, with a kill number. "If interest
is spread evenly across job levels, the theory is wrong and it comes out" is
worth more than any dashboard.

---

## 4. Standing agenda

Carry these until they are closed or killed.

- **The 96 past-due customers**, $5,331/yr. They did not cancel, their card
  failed, and as far as we can tell nobody has chased them. Cheapest money we
  have.
- **Non-US converts at 2.2% against the US 7.8%.** Not declines — 83 failed
  $4.99 attempts in three months and 45 are US. Canada is 0-for-55 with zero
  failures. They look at the offer and leave.
- **~640 people a fortnight see the landing page and never answer question 1.**
  Still the biggest single number in the funnel.
- **22% of takers tie at the score ceiling**, and that group buys at 2.11%
  against 5.80%. The label is wrong, not just blunt.

---

## Rules that exist because we broke them

- **Read the dashboard before writing SQL.** Twice in one day an ad-hoc query
  disagreed with the screen and the query was wrong. If they disagree, suspect
  the query first.
- **Do not average across experiments.** Control's paid rate went 4.04% → 6.25%
  → 7.35% across four runs. An average erases the only interesting fact in it.
- **Duplicated plumbing diverges.** Two Supabase clients, two renewal-rate
  calculations, two PostHog readers — each cost something on the same day.
- **A silent sensor is not a passing test.** `checkout_form_error` reported zero
  for months because it can only see our own errors, never a Stripe in-form
  decline. Zero from an instrument that cannot detect the thing is not evidence.
