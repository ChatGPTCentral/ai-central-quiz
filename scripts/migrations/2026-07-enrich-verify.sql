-- Unified enrich-verify + self-reinforcing tuning.
-- Applied to project jcciwvaqbkxwtufvtiog on 2026-07-21.

-- Ground-truth store: every contact the owner verifies is banked here and reused
-- by the resolver as same-domain few-shot (see lib/enrichment/google-resolver.ts
-- verifiedExamples, wired in app/api/admin/enrich/verify/enrich/route.ts).
create table if not exists verified_identities (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid,
  email text,
  email_domain text,
  name text,
  linkedin_url text,
  company_name text,
  job_title text,
  country text,
  won text,                 -- which side the owner picked: apollo | verified | both | manual
  verified_at timestamptz not null default now()
);
create index if not exists verified_identities_domain_idx on verified_identities (email_domain);
create index if not exists verified_identities_submission_idx on verified_identities (submission_id);

-- Single-row resolver config, re-tuned weekly from the label set by
-- app/api/cron/enrich-retune (accept threshold + measured accuracy).
create table if not exists resolver_config (
  id int primary key default 1,
  accept_threshold numeric not null default 0.55,
  accuracy jsonb not null default '{}'::jsonb,
  sample_size int not null default 0,
  updated_at timestamptz not null default now(),
  constraint resolver_config_singleton check (id = 1)
);
insert into resolver_config (id) values (1) on conflict (id) do nothing;
