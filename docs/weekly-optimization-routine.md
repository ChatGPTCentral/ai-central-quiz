# Weekly conversion-optimization routine (Claude scheduled task)

The bandit cron reallocates traffic automatically every day. This routine is
the *creative* half of the self-improving loop: once a week, Claude reviews
the funnel + experiment results and drafts NEW challenger variants for you
to approve. Nothing it drafts can reach visitors until you click Approve /
Start in `/admin/experiments`.

## How to schedule it (one-time, ~1 minute)

In the Claude apps, create a **scheduled task / routine** (weekly, e.g.
Monday 9:00) pointing at this repository, with the prompt below. Any session
it creates has the same Supabase + GitHub access as a normal session.

## The prompt to schedule

```
Weekly conversion review for the AI Central quiz funnel (repo: ai-central-quiz,
Supabase project jcciwvaqbkxwtufvtiog). Do the following, read-mostly:

1. FUNNEL: from funnel_events + submissions, compute this week's step
   conversion (quiz_view → quiz_start → completed → result_view →
   checkout_click → net-new paid, where net-new = stripe_first_charge_at >
   staged_at) and week-over-week deltas. Identify the single biggest leak.

2. EXPERIMENTS: for each experiment row, pull experiment_results(<key>) and
   summarize per-variant exposures, click rate, net-new conversions, and the
   current weights. Note any experiment ready to call (P(best) >= 95% — 
   compute with lib/bandit.ts computeStats if needed) and any auto-pause or
   guardrail events in experiment_weight_history this week.

3. DRAFT CHALLENGERS: based on the leak and the results, draft 1-3 new
   experiment ideas as NEW rows in the experiments table with status='draft',
   each with a clear hypothesis, targeting (stage/persona/utm when the data
   suggests it), a control variant (empty overrides), and challenger variants
   using ONLY slots whitelisted in lib/experiment-slots.ts. Set every
   challenger variant approved=false, weight=0. NEVER modify running
   experiments, weights, or statuses.

4. REPORT: email a concise summary (funnel table, experiment table, what you
   drafted and why, and the one recommended next action) via the Resend API
   (RESEND_API_KEY env, to ADMIN_NOTIFY_EMAIL) or, if unavailable, commit the
   report to docs/reports/ on a branch and open a draft PR.

Constraints: read-only on all tables except INSERTs of draft experiment rows
and the report artifact. No deploys, no pushes to main, no status changes.
```

## Safety model

- The bandit (daily Vercel cron) can only shift `weight` among variants a
  human already approved; control is pinned to ≥10% traffic.
- This weekly routine can only INSERT drafts (`approved:false, weight:0`).
- You remain the only actor who can Start experiments or Approve variants,
  in `/admin/experiments`.
