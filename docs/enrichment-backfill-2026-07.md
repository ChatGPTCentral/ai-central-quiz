# Enrichment backfill — Jul 11, 2026

One-off fill-only-empty backfill of launch-cohort enrichment gaps
(source=quiz_v2, staged_at >= Jul 5), run via Apollo bulk person match keyed
on email, outside the app (no code path touched). Owner-approved spend.

## Method

- 101 gap rows (missing linkedin_url OR seniority OR company_industry),
  processed as a 10-row pilot + 4 parallel slices.
- Every UPDATE used `col = COALESCE(NULLIF(col,''), <new>)` — existing values
  were never overwritten (verified on rows with partial data).
- Normalization mirrored the app's rules: Apollo seniority mapped to the
  7-value enum (founder/owner→Founder, c_suite→C-Suite,
  partner/vp/head/director→VP/Director, manager→Manager,
  senior/entry→Individual contributor, intern→Student or intern, else
  omitted); employee counts bracketed to the 12 CompanySizeBracket values
  (`lib/enrichment/standardize.ts:123-152`); industries Title-Cased.
- `enrichment_status` set to 'enriched' only where it was empty and the
  match supplied ≥2 fields. Provenance jsonb left untouched (this backfill
  is not part of the in-app waterfall).

## Results

- Matched & updated: **19 of 101** (pilot 2 + slices 3/3/5/6). Expectedly
  low — these rows are gaps precisely because the in-app waterfall already
  failed on them (mostly personal gmail/yahoo/hotmail addresses).
- Apollo lead credits consumed: **19** (of 101 approved; unmatched cost 0).
- Launch-cohort gap movement (cohort grew 199→201 during the run):
  linkedin_url missing 66→53 · seniority missing 71→59 ·
  company_industry missing 78 (from ~85) · photo_url missing 72.
- Known caveat: one email-keyed match returned a different person name than
  the CRM row (tkjrooney@yahoo.com → Apollo "Thomas Rooney" vs CRM "Todd
  Donahoe"). Name was NOT overwritten (fill-only-empty), but treat that
  row's filled company/title fields as lower-confidence.

## Remaining gaps

The ~80 unmatched rows are mostly personal-email signups invisible to B2B
enrichment. Realistic next lever: capture LinkedIn URL or company domain in
the quiz itself (optional step), or accept the gap — these skew consumer
anyway.
