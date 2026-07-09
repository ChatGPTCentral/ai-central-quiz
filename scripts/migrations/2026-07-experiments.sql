-- Canonical copy of the Supabase migration applied 2026-07 (via MCP):
-- first-party funnel events + homegrown experimentation engine.
-- Tables are written only via the service-role key (server routes).

create table if not exists funnel_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  event text not null,
  anon_id uuid,
  session_id text,
  submission_id uuid,
  email text,
  path text,
  experiment_key text,
  variant_key text,
  props jsonb not null default '{}'::jsonb,
  utm_source text,
  utm_ref text,
  ip_hash text,
  user_agent text
);
create index if not exists fe_exp_idx on funnel_events (experiment_key, variant_key, event, ts);
create index if not exists fe_anon_idx on funnel_events (anon_id, ts);
create index if not exists fe_event_ts_idx on funnel_events (event, ts);
create index if not exists fe_sub_idx on funnel_events (submission_id) where submission_id is not null;

create table if not exists experiment_assignments (
  experiment_key text not null,
  anon_id uuid not null,
  variant_key text not null,
  first_exposure_at timestamptz not null default now(),
  last_exposure_at timestamptz not null default now(),
  exposures int not null default 1,
  submission_id uuid,
  email text,
  primary key (experiment_key, anon_id)
);
create index if not exists ea_variant_idx on experiment_assignments (experiment_key, variant_key);
create index if not exists ea_sub_idx on experiment_assignments (submission_id) where submission_id is not null;

create table if not exists experiments (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  hypothesis text,
  page text not null default 'result',
  status text not null default 'draft'
    check (status in ('draft','running','paused','killed','ended')),
  targeting jsonb not null default '{}'::jsonb,
  variants jsonb not null default '[]'::jsonb,
  primary_metric text not null default 'checkout_click'
    check (primary_metric in ('checkout_click','net_new_paid')),
  salt text not null default encode(gen_random_bytes(8),'hex'),
  bandit_enabled boolean not null default false,
  min_exposures_per_variant int not null default 200,
  started_at timestamptz,
  ended_at timestamptz,
  winner_variant text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_email text
);

create table if not exists experiment_weight_history (
  id bigint generated always as identity primary key,
  experiment_key text not null,
  weights jsonb not null,
  results_snapshot jsonb,
  trigger text not null,
  ran_at timestamptz not null default now()
);

-- Per-variant results: exposures (unique people), unique checkout clickers,
-- net-new-paid conversions (dashboard rule + charge-after-experiment guard).
create or replace function experiment_results(exp_key text)
returns table (variant_key text, exposures bigint, clickers bigint, net_new_paid bigint)
language sql stable as $$
  with exp as (select started_at from experiments where key = exp_key),
  assign as (
    select a.variant_key, a.anon_id, a.submission_id, a.email
    from experiment_assignments a where a.experiment_key = exp_key
  ),
  clicks as (
    select f.variant_key, count(distinct f.anon_id) as clickers
    from funnel_events f
    where f.experiment_key = exp_key and f.event = 'checkout_click'
    group by f.variant_key
  ),
  conv as (
    select a.variant_key, count(distinct a.anon_id) as net_new_paid
    from assign a
    join submissions s
      on (a.submission_id is not null and s.id = a.submission_id)
      or (a.submission_id is null and a.email is not null and lower(s.email) = lower(a.email))
    cross join exp
    where s.stripe_first_charge_at is not null
      and s.staged_at is not null
      and s.stripe_first_charge_at::timestamptz > greatest(s.staged_at, coalesce(exp.started_at, s.staged_at))
    group by a.variant_key
  ),
  expo as (select variant_key, count(*) as exposures from assign group by variant_key)
  select e.variant_key, e.exposures,
         coalesce(c.clickers, 0), coalesce(v.net_new_paid, 0)
  from expo e
  left join clicks c using (variant_key)
  left join conv v using (variant_key)
$$;

-- Exposure upsert used by /api/events.
create or replace function upsert_experiment_assignment(
  p_experiment_key text,
  p_anon_id uuid,
  p_variant_key text,
  p_submission_id uuid default null,
  p_email text default null
) returns void language sql as $$
  insert into experiment_assignments
    (experiment_key, anon_id, variant_key, submission_id, email)
  values
    (p_experiment_key, p_anon_id, p_variant_key, p_submission_id, p_email)
  on conflict (experiment_key, anon_id) do update set
    last_exposure_at = now(),
    exposures = experiment_assignments.exposures + 1,
    submission_id = coalesce(excluded.submission_id, experiment_assignments.submission_id),
    email = coalesce(excluded.email, experiment_assignments.email)
$$;
