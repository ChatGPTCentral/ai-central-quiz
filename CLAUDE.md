# AI Central Quiz — working agreements for Claude

## THE north-star metric (maximize this above everything)

The one success metric for the whole project is **new trials attributable to
the quiz** (owner's definition, restated 2026-08-10):

- **Numerator** = people who completed the quiz and then bought a **$4.99
  trial after taking it**. Two kinds count, and both are the quiz working:
  - **net-new** — never had any Stripe charge before the quiz. The quiz
    convinced a free reader to pay.
  - **existing customer** — had paid us before, took the quiz, then bought
    another trial. The quiz convinced an existing reader to pay again.
- **Denominator** = everyone who completed the quiz.

Each trial bills **$59.75/year one month later**, so maximizing this maximizes
paid customers and their LTV.

**NOT** this metric: people who paid without ever taking the quiz, or who took
it only after paying. Renewals are not trials. Every trial therefore falls in
exactly one of three buckets, and the dashboard shows all three:

| Bucket | Meaning | Clock |
|---|---|---|
| Net-new | no charge ever, took quiz, then paid | quiz date |
| Quiz, existing customer | had paid before, took quiz, then paid again | quiz date |
| Not from the quiz | never took it, or took it after paying | charge date |

**Attribution is decided at CHARGE level, never from a person's aggregate.**
A real $4.99 (or the $4.99 inside a $54.74 lifetime bundle) must land after
their quiz. "They have a later charge" is not enough — a monthly renewal
would fake it. `stripe_charges` is the mirror of record, synced daily 06:20
UTC, refunds excluded; the owner's trials spreadsheet is the reconciliation
source of truth.

## One source per fact, and only one

Owner's rule, 2026-08-11: **there is a single source of truth for each kind of
data, and every screen slices from it.** Consistency between pages is not the
goal, it is the symptom; the goal is that no fact is computed twice.

| Domain | The one source | Everything downstream |
|---|---|---|
| Money, trials, conversions | `stripe_charges` → `trial_ledger` | `/admin/revenue`, the dashboard's trial and money rows, the simulator's cashflow, `trial_to_annual_rate()`, the ads page LTV |
| Who a person is, quiz answers, stage, UTM, country | `submissions` | CRM tables, segmentation, the dashboard's demographics |
| On-page behaviour | `funnel_events` (+ PostHog) | landing views, quiz starts, checkout clicks, placements |
| Pricing periods | `payment_eras` | era labels and colours everywhere |
| The owner's spreadsheet | `sheet_trials` | RECONCILIATION ONLY, never an input to a number |

Rules that follow from it:
- A screen may JOIN sources, never RE-DERIVE a fact another source owns. The
  dashboard used to recompute "is this person net-new" from
  `stripe_first_charge_at > quiz_completed_at` while the ledger already
  answered it. They matched at 71 each the day it was found, and matching by
  coincidence of two code paths is the state right before a silent drift.
- If two screens disagree, do not patch the screen. Find which one is
  re-deriving and delete that derivation.
- Adding a rule (a new price, a bundle, a refund case) means editing the
  ledger, once. If a fix needs touching two files to keep numbers equal, the
  architecture is wrong, not the numbers.

## The roadmap board is the source of truth

The project roadmap lives in the Supabase table `roadmap_tasks` (project
`jcciwvaqbkxwtufvtiog`), rendered as a kanban at `/admin/roadmap`.
Treat it the way a programmer treats the team board:

- **"Status the project"** (or any "where are we" ask): read the board first
  (`select * from roadmap_tasks order by status, sort`) and report from it,
  column by column. Fresh data beats memory.
- **Starting work**: move the card to `in_progress` (create it if missing).
- **Shipping work**: in the same turn as the ship, set `status='done'`,
  let `shipped_at` stamp, and attach the commit to `links`
  (`[{"label":"commit <hash>","url":"https://github.com/chatgptcentral/ai-central-quiz/commit/<hash>"}]`)
  plus a one-line `notes` if context helps.
- **New agreed work** becomes a card immediately; owner gates go to
  `waiting_owner` with `assignee='owner'`; declined-for-now ideas go to
  `parked`. Never let the board drift from reality.
- Statuses: `backlog | next | in_progress | waiting_owner | done | parked`.
  Phases: `A` loops/measurement · `B` owned loop (nurture) · `C` conversion ·
  `D` paid loop · `OPS` · `FUTURE`.

## Conventions

- Copy style: no em dashes, use commas.
- Develop on `claude/great-volta-PaEPx`; ship = ff-merge to `main`
  (Vercel auto-deploys). Verify on prod after every ship.
- New client events must be allowlisted in `app/api/events/route.ts`.
- Placements on the live result page are `v2_`-prefixed; the landing FOMO is
  `landing_fomo`.
- Apollo credit spend always needs an explicit owner confirmation with the
  exact count first. Beehiiv sends stay draft/gated until the owner publishes.
- A person's live result page: `/result?name=…&score=…&persona=…&stage=…&id=<submission uuid>`
  (helper: `personResultPath` in `lib/result-url.ts`); it re-fetches by `id`,
  so the link works anytime, from the notification email, the person record,
  or the People table 🎯.
- Clarity UX aggregates snapshot daily (Vercel cron 06:30 UTC →
  `/api/cron/clarity-snapshot`) into `clarity_daily` (raw jsonb per
  metric × dims × day: rage/dead clicks, quick-backs, scroll depth, script
  errors, by URL/Device/Source/Country). Read UX health from that table
  (`lib/clarity.ts` has parsers); the export API itself only serves the
  trailing 1-3 days at 10 calls/day, and each snapshot spends 4. Recordings
  and heatmaps have no API, they stay in the Clarity dashboard.
