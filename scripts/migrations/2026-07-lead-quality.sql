-- Lead-quality guardrails (2026-07).
-- Checked-in record of the schema change the quiz form's fake-submission
-- guardrails want. APPLY SEPARATELY (Supabase project jcciwvaqbkxwtufvtiog) —
-- the app code does NOT create this column, and the submit route deliberately
-- does NOT yet write to it (so a missing column can't break inserts).
--
-- After this is applied, the TODO in app/api/submit-quiz-v2/route.ts can be
-- un-commented to persist `suspected_fake` for softly-flagged leads
-- (assessLead() returned fake:false but with one or more reasons).

alter table submissions
  add column if not exists suspected_fake boolean not null default false;

-- Optional: keep the specific heuristic reasons for later analysis / tuning.
alter table submissions
  add column if not exists lead_quality_reasons text;

-- Handy for triaging junk in the admin People view without a full scan.
create index if not exists submissions_suspected_fake_idx
  on submissions (suspected_fake)
  where suspected_fake = true;
