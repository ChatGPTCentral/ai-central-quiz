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

**THE BAR (owner, 2026-08-18): 10+ trials a day. Below that is failure.**
The `daily_benchmark` watcher check meters yesterday against it on the
matrix's own clocks, red until cleared. Two standing consequences: a
concluded experiment's surface never idles (the next queued play ships the
same day), and every retrain cycle must ship or conclude something aimed at
the bar. The measured decomposition: on-page CVR at the research ceiling
(~6.3%) needs ~160 landings/day for 10 trials; landings are the owner's
lever, CVR is Claude's.

**NOT** this metric: people who paid without ever taking the quiz, or who took
it only after paying. Renewals are not trials. Every trial therefore falls in
exactly one of three buckets, and the dashboard shows all three:

| Bucket | Meaning | Clock |
|---|---|---|
| Net-new | no charge ever, took quiz, then paid | quiz date |
| Quiz, existing customer | had paid before, took quiz, then paid again | quiz date |
| Not from the quiz | never took it, or took it after paying | charge date |

## The charge rules (owner, 2026-08-11, standing until he changes them)

These are not derivations, they are the definitions. Do not "improve" them.

1. **ANY $4.99 charge IS a paid trial.** No exceptions, no deduplication.
   Since 2026-08-18, $14.95 is also a trial price: the FOUNDING WINDOW
   (owner's Option B) gives quiz completers 12 hours at $4.99, enforced
   server-side by lib/founding-window.ts in BOTH checkout paths, then the
   $14.95 list price genuinely charges. The deadline is real or it does not
   render, that is the whole point. Flag lives in app_settings
   'founding_window' (flips live, no deploy). Emails hold the $4.99 rate
   through their own static links, deliberately. TWO LAWS from the launch:
   a list price must be one a real person could rationally pay (a
   fictitious anchor is banned, $29.99 was refused), and any new price must
   be scanned against charge history first ($7.99 was a legacy monthly
   price; adding it swallowed 248 old charges into the ledger for four
   minutes before the no-op check caught it).
2. **A person may buy more than one paid trial.** All of them count.
3. **A person may hold more than one yearly subscription.**
4. **Other Revenue may contain no paid trial and no $59.75 subscription.** It
   is the residual of legacy monthly and annual subscriptions, nothing else.
5. **Trials are counted GROSS, everywhere.** Someone who bought two trials
   shows as two, never as one person.
6. **Money is displayed NET, everywhere — and NET means WHAT THE BANK KEPT**
   (owner, 2026-08-17, stated three times, the third: "net is 77K not 83").
   Every money figure on the matrix and the revenue screens is the charge's
   kept money in day-rate USD: refunds, lost disputes, open-dispute
   withholdings, and Stripe's processing and dispute fees ALL subtracted,
   per charge, inside `keptUsdCents()` (lib/trial-entries.ts) — the ONE
   formula the classifier, the revenue loader, and the era table share. It
   matches the Stripe home screen's "Net volume" within rounding, which is
   the point: a number the owner cannot find on a Stripe screen is a number
   he cannot verify. "Net of refunds but before fees" ($83k-style) renders
   NOWHERE. COUNTS stay gross (rule 5); money can go BELOW zero per charge
   (a lost dispute costs its fee plus the $15 penalty; a refunded charge's
   fee stays kept by Stripe) — the classifier emits those as negative
   "-cost" entries so kinds-sum stays penny-equal to kept money.
   Settlement is two-currency: cards settle USD; the
   2024→Jul-2025 PayPal/invoice era (1,147 charges) settled into a EUR
   balance at market × 0.98, so `settled_cents` and `fee_cents` are cents
   of `settled_currency`, and euro-era money converts at each charge's own
   day rate via `bt_exchange_rate` (a today's-rate conversion misses by
   thousands). All of it refreshed hourly from Stripe's Refund and Dispute
   endpoints plus the expanded balance transaction (never from fields on
   the charge object; the 2026 API dropped them).

Rule 5 kills the old 32-day "duplicate subscription" rule, which was hiding
39 real trials and pushing their money into Other Revenue. Trials revenue is
trials × $4.99, NOT people × $4.99.

A renewal is still claimed by exactly one trial: trials and post-trial
renewals are numbered in time order and paired 1:1. Before that, a person
with two trials had both claim the same $59.75, double-counting $353.24.

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
- **A funnel step rate is "of the people who did A, how many then did B" —
  same person, timestamps in order.** Never a ratio of two independent
  head-counts: that method showed 111% steps and 20 landings against 20
  results, and flattered landing→start by up to 30 points, because people
  entering the quiz from email links were credited to a landing page they
  never saw (caught by the owner, 2026-08-12). Rates are never clamped to
  100: a wrong ratio must look wrong.

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
- **`next` holds AT MOST 5 cards, ranked 1-5 in `sort`.** Everything else is
  `backlog`. This is the rule, not a preference: on 2026-08-11 `next` held 28
  cards and `backlog` held zero, which made `next` a wish list. A status that
  contains everything ranks nothing, and the board stops being a decision.
  Adding a sixth card to `next` means demoting one, deliberately, and saying
  which. If a card cannot beat any of the five, it is backlog.
- **`in_progress` holds at most 3.** More than that and none of them are.
  Phases: `A` loops/measurement · `B` owned loop (nurture) · `C` conversion ·
  `D` paid loop · `OPS` · `FUTURE`.

## What we know about buyers (measured 2026-08-11, n=74 vs 1,480)

From `buyer_behaviour_lift` and `buyer_placement_quality`, both built on
`funnel_events` + `trial_ledger`. NOT from PostHog, which sees a handful of
buyers because identity there stays anonymous until someone is identified.

- **Buyers engage MORE, not less.** Median 12 events against 8, 4.4 active
  events against 1.6, and 3.3 minutes on site against 0.7. A PostHog reading
  of "4.2 events vs 28.2" said the opposite; it was n=4 and wrong. Do not
  repeat it.
- **It happens in one visit.** ~1.2 sessions either way. Nobody goes away and
  comes back to decide, so there is no considered-purchase window to nurture.
- **They spend those minutes on the OFFER.** Every checkout event lifts hard
  (checkout_click 93.2% vs 35.2%). Every diversion lifts for non-buyers: wheel
  spin 2.7 vs 3.8, free win 1.4 vs 2.1, share 5.4 vs 6.2, exit rescue 4.1 vs
  5.6. The page is not too long, it is too divided.
- **The buttons that sell are nearly invisible.** v2_offer_stack_badges
  converts 69% of its clickers, v2_study_plan 9%, but study_plan is seen by
  1,129 people and badges by so few its impression was not even instrumented
  until 2026-08-11.

## Conventions

- **CARDINAL RULE (owner, 2026-08-13): numbers quoted to the owner are the
  MATRIX's numbers.** The dashboard's own cells, on the dashboard's clocks and
  definitions, or another screen he can open. Diagnostic SQL is for finding
  causes, and before its result is quoted it must be reconciled to the cell it
  explains; a number on a different clock or definition gets that said in the
  same sentence ("35 by charge date; the matrix's column says 31 because four
  restate to their quiz week"). He verifies against the screen, so a number he
  cannot find on a screen is a number he cannot trust.

- Copy style: no em dashes, use commas.
- NEVER show the question count before the quiz starts (owner, 2026-08-18,
  from prior testing: when people know the length they do not start).
  In-quiz progress counters are fine; the entry surfaces are not.
## How we test (audited 2026-08-19, after 15 experiments)

The record: 3 winners adopted, 4 controls defended, 6 died with no verdict,
biggest arm we ever ran was 537 people. Every adopted winner was a LARGE
structural change (sell-first +14.4pts, question-first +8.6pts, embedded
checkout); everything smaller returned noise. That is not bad luck, it is
arithmetic — at this traffic the honest minimum detectable effects are:

| Surface | Detectable in ~2 weeks | Needs 7+ weeks |
|---|---|---|
| Result page clicks (44%) | 10 points | 5 points |
| Trials per finisher (6%) | 4 points | 2 points |
| Landing start rate (67%) | 10 points | 5 points |
| Quiz completion (73%) | 10 points | 5 points |

The rules that follow, and they are rules:

1. **Only test what could plausibly move the step by 10+ points.** Anything
   smaller cannot be resolved before the page changes underneath it. Ship it
   on judgment instead, or leave it alone.
2. **A test must be visible in /admin/compare before it runs** (owner,
   2026-08-19: "what kind of A/B test is a test where no one sees the
   difference?"). The side-by-side diffs both arms live; if it cannot name
   what changed, the change is too small. entry_microcopy_v1 was ended for
   exactly this: one line of small print, ~9 weeks to resolve 3 points.
3. **Declare the sample and the stop date when the test starts.** If the
   surface cannot deliver that sample inside 3 weeks, do not start it.
4. **Decide on the step the change touches, with trials as a guardrail.**
   Clicks alone lied once (sell-first won on clicks, was behind on paid);
   trials alone are unmeasurable inside a test window. Both, always.
5. **Everything else ships to everyone and is watched on /admin/cohorts.**
   Ship-and-watch is faster than a test nobody can power, and the cohort
   meter names a regression within a hundred landers.
6. **No ghosts.** The bandit cron ends anything paused for 7 days.
- Develop on `claude/great-volta-PaEPx`; ship = ff-merge to `main`
  (Vercel auto-deploys). Verify on prod after every ship.
- New client events must be allowlisted in `app/api/events/route.ts`.
- Placements on the live result page are `v2_`-prefixed; the landing FOMO is
  `landing_fomo`.
- Apollo credit spend always needs an explicit owner confirmation with the
  exact count first. Beehiiv sends stay draft/gated until the owner publishes.
- The send-to-non-quiz-takers campaign (the ~94k) is the owner's to trigger,
  on his timing (his instruction, 2026-08-13). Do not pitch it or ask about
  it again; when he is ready he will say so.
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
