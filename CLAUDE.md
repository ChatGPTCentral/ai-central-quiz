# AI Central Quiz — working agreements for Claude

## THE north-star metric (maximize this above everything)

The one success metric for the whole project is the **quiz → paid-trial
conversion rate**:

- **Numerator** = people who (a) had **no Stripe payment ever** before the
  quiz (i.e. genuinely free subscribers, not part of the 3-year existing
  client backlog), AND (b) completed the quiz through the result, AND
  (c) bought the **$4.99 trial AFTER** the moment they took the quiz.
- **Denominator** = everyone who completed the quiz.

This is the rate at which the quiz converts **free readers into paid trials**.
Each such trial bills **$59.75/year one month later** when the trial ends, so
maximizing this maximizes new paid customers and their LTV. That is the point
of the quiz: turn free readers into paid ones via the $4.99 trial.

NOT this metric: existing customers who happen to take the quiz; renewals;
trials people entered BEFORE the quiz existed (the $4.99 offer was promoted
before Jul 5). "First Stripe charge after `created_at`" is only a rough proxy
— the true signal is "was free before the quiz, then bought the trial after,"
and the owner keeps a manual spreadsheet of $4.99 trials sold as the source of
truth to reconcile against.

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
