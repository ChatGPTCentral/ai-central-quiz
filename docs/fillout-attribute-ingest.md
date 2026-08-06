# Spec: Fillout attribute ingest

Attach self-reported **role, industry and age** from the Fillout export onto the
CRM, as a distinct and trusted class of data.

Status: spec, not built. Owner approved 2026-08-06.

---

## Why, in one paragraph

Three data sources each hold a third of one question. The quiz knows what
someone **does** with AI and never asks who they are. Fillout knows **who they
are** and never asks what they paid. Stripe knows whether they **paid** and
nothing else. The join is the only place "which kinds of people buy?" can be
asked, and when asked it separates buyers better than anything else we have:

| dimension | spread | best | worst |
|---|---|---|---|
| **Industry (self-reported)** | **3.5x** | Finance/Fintech 21.7% | Government 6.2% |
| **Role (self-reported)** | **2.6x** | Founder 20.2% | Consultant/Freelancer 7.8% |
| Quiz stage | 2.3x, non-monotonic | S4 5.70% | S5 2.49% |

Who someone **is** predicts buying better than what the quiz measures about
them. That is the payoff, and it is bigger than CRM tidiness.

**It is explicitly not about volume.** 894 distinct Fillout emails, 827 of them
(93%) already in the CRM. A merge adds **67 people**.

---

## The one rule this spec exists to protect

> "Once we put a record in the database we must be sure that person is who we
> say it is."

`submissions` already has `job_level` (3,990 rows), `seniority` (1,262),
`company_industry` (1,566), `age_bracket` (562) and `age_ai_estimate` (910).
**Every one of those is enrichment output** — the same enrichment the owner's own
labelling found wrong about two thirds of the time, and `age_ai_estimate` is
literally a model's guess.

Self-reported answers are the opposite: the person typed them about themselves.
That is the highest-confidence identity data in the building.

**Therefore: never write Fillout answers into the existing columns.** Doing so
would mix the most reliable data we own with the least reliable, into fields
whose name gives no clue which is which, and destroy the distinction
permanently. New columns, clearly marked.

---

## Schema

```sql
alter table submissions
  add column if not exists self_role       text,   -- "Founder", "Manager", ...
  add column if not exists self_industry   text,   -- "Finance or Fintech", ...
  add column if not exists self_age_band   text,   -- "36-45", "65+", ...
  add column if not exists self_company_size text,
  add column if not exists self_responsibilities text,  -- CSV, multi-select
  add column if not exists self_buying_intent    text,
  add column if not exists self_source     text,   -- 'fillout_2026_08' etc
  add column if not exists self_answered_at timestamptz;
```

`self_` prefix, no exceptions. A reader should never have to look up whether a
column was typed by a human or produced by a model.

`self_source` carries provenance so a bad import can be identified and reversed
by one predicate.

### Indexes

```sql
create index if not exists submissions_self_role_idx     on submissions (self_role)     where self_role is not null;
create index if not exists submissions_self_industry_idx on submissions (self_industry) where self_industry is not null;
```

---

## Matching

- Key: `lower(trim(email))`. Both sides.
- Expected: **827 matched, 67 unmatched** on the current export.
- The CSV has 1,154 rows for 894 distinct emails, so **~260 are repeat
  submissions**. Take the row with the latest `Last updated`; if that is blank,
  the latest `Date`.
- **Never overwrite a non-null `self_*` value with a null.** A later partial
  submission must not erase an earlier complete one — merge field by field,
  preferring the newest non-empty value per field.

### The 67 unmatched

Insert as new rows with `population = 'fillout_only'`, which requires extending
the generated `population` expression. They are real people who filled in a real
form, and they must never appear in a funnel denominator, because they never
entered the funnel.

If extending the generated column is awkward, the acceptable alternative is to
**not import them at all** and record that decision here. 67 records are not
worth weakening the population guarantee.

---

## Partial submissions

773 of 1,154 rows are `finished`, 381 are `in_progress`. **Take both.**

The form collapses partway through — role 85%, industry 73%, age 63%, then
everything after drops to 4-5%. The fields we care about are answered early, and
a partial answer is a real answer. Record `Status` alongside so any analysis can
scope to finished-only if it needs to.

---

## Ordering, and a caveat that must survive

Run in this order, because step 3 is the point:

1. Add columns.
2. Ingest and report: matched, unmatched, conflicts resolved, per-field fill rate.
3. **Re-run the buy-rate-by-role/industry table and compare to the numbers above.**

**The numbers in this spec are biased and must not be shipped as findings.** 773
of the 827 matched records came from the Stripe import, so the sample skews
heavily toward people who already bought. That inflates every rate, and could
distort the *ranking* too, not just the level.

The honest test is the same table computed on `population = 'quiz_current'`
only. Today that is 11 people, which is nothing. So:

> **Ask role and industry in the quiz itself.** Two questions, both answered
> early in a form where people demonstrably answer early questions. That is the
> only way this becomes a clean, growing, unbiased signal instead of a one-off
> read on a self-selected sample.

Until then, treat the ICP below as a hypothesis worth testing, not a fact.

---

## What this unblocks

**The ads ICP.** The live ad set is `Cold-ICP(Sen×Fn+AI)` converting at 0.63%.
This data proposes a different one, grounded in 827 of our own people:

- **Target:** Founders, C-level, VP/Head-of, in Finance/Fintech, Healthcare or
  Agency/Consulting, aged 36-45 or 65+
- **Exclude:** Consultants/Freelancers (7.8% and the single largest group at
  256), and under-25s (0.0% of 37)

Publish it through `/api/admin/shared-context` so the ads session reads it
rather than being told.

**And it may dissolve the stage question.** If role predicts buying better than
the ladder does, stop trying to force the ladder monotonic and segment on role.

---

## Out of scope

- Enrichment. This is self-reported data only, which is why it is trustworthy.
- Overwriting or reconciling the existing enrichment columns. They stay exactly
  as they are, wrong-ness and all, until the enrichment overhaul deals with them.
- Proxying a stage from socio-demographics. That is a separate, later piece and
  needs its own `stage_source` marker before anything is written.
