#!/usr/bin/env node
/**
 * One-shot ETL: merge two Fillout CSVs + one Apollo enrichment CSV into the
 * Supabase `submissions` table, deduplicated by lowercased email.
 *
 * Usage:
 *   PG_URL='postgresql://...' node scripts/backfill-legacy.mjs            # write
 *   PG_URL='postgresql://...' node scripts/backfill-legacy.mjs --dry-run  # preview
 *
 * Idempotent — safe to re-run. Merge rule: longest non-empty string wins.
 */

import { readFileSync } from 'fs'
import pg from 'pg'
import { randomUUID } from 'crypto'

const DRY_RUN = process.argv.includes('--dry-run')
const DOWNLOADS = '/Users/alexfiore/Downloads'
const FILES = {
  fillout8: `${DOWNLOADS}/Fillout Personalize Your Experience results (8).csv`,
  fillout9: `${DOWNLOADS}/Fillout Personalize Your Experience results (9).csv`,
  apollo:   `${DOWNLOADS}/Untitled spreadsheet - Sheet1 (4) - Grid view - 2026-05-24.csv`,
}

// ── tiny RFC-4180 CSV parser ───────────────────────────────────────
function parseCSV(text) {
  const rows = []
  let row = [], cell = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else cell += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(cell); cell = '' }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
      else if (ch === '\r') { /* skip */ }
      else cell += ch
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  if (!rows.length) return []
  // strip BOM from first header
  rows[0][0] = rows[0][0].replace(/^﻿/, '')
  const headers = rows[0]
  return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])))
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const normEmail = (v) => (v || '').trim().toLowerCase()
const isValidEmail = (v) => EMAIL_RE.test(normEmail(v))

// ── Field translation maps ────────────────────────────────────────
const JOB_LEVEL_MAP = {
  founder: 'Founder',
  'co-founder': 'Founder', cofounder: 'Founder', owner: 'Founder',
  ceo: 'C-Suite', cfo: 'C-Suite', coo: 'C-Suite', cto: 'C-Suite', cmo: 'C-Suite',
  'c-suite': 'C-Suite', 'c-level': 'C-Suite',
  vp: 'VP/Director', 'vice president': 'VP/Director', director: 'VP/Director', head: 'VP/Director',
  manager: 'Manager',
  'individual contributor': 'Individual contributor', ic: 'Individual contributor',
  consultant: 'Individual contributor', specialist: 'Individual contributor',
  student: 'Student or intern', intern: 'Student or intern',
}
function mapJobLevel(v) {
  if (!v) return undefined
  const s = v.toLowerCase().trim()
  for (const [k, val] of Object.entries(JOB_LEVEL_MAP)) {
    if (s.includes(k)) return val
  }
  return 'Other'
}

// Age value coming in like "46-55", "26-35" etc — pass through as-is, but normalize a few patterns
function mapAgeBracket(v) {
  if (!v) return undefined
  const s = v.trim()
  if (/^\d{2}-\d{2}$/.test(s)) return s
  if (/56\+|56 and over|56-/.test(s)) return '56+'
  if (/under 18|<18/i.test(s)) return 'under-18'
  return s
}

function mapBuyingIntent(v) {
  if (!v) return undefined
  const s = v.toLowerCase().trim()
  if (s.includes('now') || s.includes('immediate') || s.includes('this month')) return 'now'
  if (s.includes('soon') || s.includes('next month') || s.includes('this quarter')) return 'soon'
  if (s.includes('research') || s.includes('exploring') || s.includes('learning')) return 'researching'
  if (s.includes('not')) return 'not_now'
  return s
}

function parseFilloutTs(v) {
  if (!v) return Date.now()
  const d = new Date(v)
  const t = d.getTime()
  return isFinite(t) ? t : Date.now()
}

// ── Build the merged record map ───────────────────────────────────
const merged = new Map()  // email → record

function setLongest(rec, field, value) {
  if (!value) return
  const v = String(value).trim()
  if (!v) return
  const cur = rec[field]
  if (!cur || v.length > String(cur).length) rec[field] = v
}

function ensureRecord(email) {
  if (!merged.has(email)) {
    merged.set(email, {
      id: randomUUID(),
      email,
      ts: Date.now(),
      _tsSet: false,
      legacy_responses: {},
      enrichment_raw: {},
    })
  }
  return merged.get(email)
}

// Fillout: extract first/last name from email-like header `What is your email?` plus role/age/etc.
function ingestFillout(rows, sourceTag) {
  // sourceTag is 'fillout8' (older — CSV 8) or 'fillout9' (newer — CSV 9).
  // We emit different DB source values so they can be filtered separately downstream.
  const sourceValue = sourceTag === 'fillout9' ? 'fillout_v2' : 'fillout_v1'
  let imported = 0, skipped = 0
  for (const r of rows) {
    const email = normEmail(r['email'] || r['What is your email?'])
    if (!isValidEmail(email)) { skipped++; continue }
    const rec = ensureRecord(email)
    const ts = parseFilloutTs(r['Submission started'])
    // Keep the OLDEST ts so dashboards show original capture date
    if (!rec._tsSet || ts < rec.ts) { rec.ts = ts; rec._tsSet = true }
    // If the older CSV's row exists, source = v1 wins; otherwise v2.
    // We let longest-string win; v2 > v1 lex but we want v1 to stick once set,
    // so set v2 only if no source yet.
    if (!rec.source) rec.source = sourceValue
    else if (sourceValue === 'fillout_v1' && rec.source === 'fillout_v2') rec.source = 'fillout_v1'

    const jobLevel = mapJobLevel(r['What is your current role?'])
    if (jobLevel) setLongest(rec, 'job_level', jobLevel)

    const industry = r['What industry do you work in?']
    if (industry) setLongest(rec, 'company_industry', industry)

    const age = mapAgeBracket(r['How old are you?'])
    if (age) setLongest(rec, 'age_bracket', age)

    const intent = mapBuyingIntent(r['Are you currently planning to buy AI tools?'])
    if (intent) setLongest(rec, 'buying_intent', intent)

    const goal = r['What tutorials would be most helpful for you?']
    if (goal) setLongest(rec, 'main_goal', goal)

    const formats = r['Which formats do you prefer? (Pick up to 3)']
    if (formats) setLongest(rec, 'learning_style', formats)

    if (r['utm_source']) setLongest(rec, 'utm_source', r['utm_source'])
    if (r['ref']) setLongest(rec, 'utm_ref', r['ref'])

    // Dump full payload under the CSV's source tag
    rec.legacy_responses[sourceTag] = r
    imported++
  }
  return { imported, skipped }
}

function ingestApollo(rows) {
  let imported = 0, skipped = 0
  for (const r of rows) {
    const email = normEmail(r['email'])
    if (!isValidEmail(email)) { skipped++; continue }
    const rec = ensureRecord(email)

    const fullName = `${r['First Name'] || ''} ${r['Last Name'] || ''}`.trim()
    if (fullName) setLongest(rec, 'name', fullName)
    if (r['Title']) setLongest(rec, 'job_title', r['Title'])
    if (r['Person Linkedin Url']) setLongest(rec, 'linkedin_url', r['Person Linkedin Url'])
    if (r['City']) setLongest(rec, 'city', r['City'])
    if (r['State']) setLongest(rec, 'region', r['State'])
    if (r['Country']) setLongest(rec, 'country', r['Country'])
    if (r['Company Name']) setLongest(rec, 'company_name', r['Company Name'])
    if (r['Website']) setLongest(rec, 'company_domain', r['Website'])
    if (r['Industry']) setLongest(rec, 'company_industry', r['Industry'])
    if (r['# Employees']) setLongest(rec, 'company_size', r['# Employees'])
    if (r['Annual Revenue']) setLongest(rec, 'company_revenue', r['Annual Revenue'])
    if (r['Total Funding']) setLongest(rec, 'company_funding', r['Total Funding'])
    if (r['Company Founded Year']) {
      const yr = parseInt(r['Company Founded Year'], 10)
      if (isFinite(yr) && yr > 1800 && yr < 2100) rec.company_founded_year = yr
    }
    // Build a NormalizedPerson-style enrichment block
    const enr = rec.enrichment || { sources: {}, providersTried: ['apollo'] }
    const setEnr = (field, val, raw = false) => {
      if (!val) return
      const v = String(val).trim()
      if (!v) return
      if (!enr[field] || v.length > String(enr[field]).length) {
        enr[field] = v
        if (!raw) enr.sources[field] = 'apollo'
      }
    }
    setEnr('fullName', fullName)
    setEnr('linkedinUrl', r['Person Linkedin Url'])
    setEnr('jobTitle', r['Title'])
    setEnr('companyName', r['Company Name'])
    setEnr('companyDomain', r['Website'])
    setEnr('companyLinkedinUrl', r['Company Linkedin Url'])
    setEnr('industry', r['Industry'])
    setEnr('companySize', r['# Employees'])
    setEnr('country', r['Country'])
    setEnr('region', r['State'])
    setEnr('city', r['City'])
    rec.enrichment = enr
    rec.enrichment_raw.apollo_legacy = r
    rec.enrichment_status = enr.linkedinUrl ? 'complete' : (Object.keys(enr).length > 2 ? 'partial' : 'failed')

    // Only stamp `apollo_legacy` source if no fillout source already set
    if (!rec.source) rec.source = 'apollo_legacy'
    // Don't let apollo_legacy overwrite a fillout source from a sibling CSV

    imported++
  }
  return { imported, skipped }
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`)
  const f8 = parseCSV(readFileSync(FILES.fillout8, 'utf8'))
  const f9 = parseCSV(readFileSync(FILES.fillout9, 'utf8'))
  const ap = parseCSV(readFileSync(FILES.apollo, 'utf8'))
  console.log(`Read: fillout8=${f8.length}, fillout9=${f9.length}, apollo=${ap.length}`)

  const r1 = ingestFillout(f8, 'fillout8')
  const r2 = ingestFillout(f9, 'fillout9')
  const r3 = ingestApollo(ap)
  console.log(`Fillout8: imported=${r1.imported}, skipped(no-email)=${r1.skipped}`)
  console.log(`Fillout9: imported=${r2.imported}, skipped(no-email)=${r2.skipped}`)
  console.log(`Apollo:   imported=${r3.imported}, skipped(no-email)=${r3.skipped}`)
  console.log(`Unique emails after merge: ${merged.size}`)

  // Sample preview
  const sampleEmail = [...merged.keys()][0]
  console.log('\nSample merged record:')
  const sample = { ...merged.get(sampleEmail) }
  delete sample._tsSet
  console.log(JSON.stringify(sample, null, 2).substring(0, 1200) + '...')

  if (DRY_RUN) {
    console.log('\nDRY-RUN: no writes. Re-run without --dry-run to upsert.')
    return
  }

  const c = new pg.Client({ connectionString: process.env.PG_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()

  // Use ON CONFLICT(email) DO UPDATE — but our unique index is on lower(email).
  // Postgres needs an exact match on the conflict target's expression. Easiest: use INSERT ... ON CONFLICT
  // on the lower(email) index by specifying the index name.
  const SQL = `
    insert into public.submissions
      (id, email, name, ts, archetype, source,
       job_title, job_level, linkedin_url, company_name, company_domain, company_industry,
       company_size, company_revenue, company_funding, company_founded_year,
       city, region, country, age_bracket, buying_intent, main_goal, learning_style,
       utm_source, utm_ref, legacy_responses, enrichment, enrichment_raw, enrichment_status)
    values
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
    on conflict (lower(email)) do update set
      name              = greatest_str(public.submissions.name,              excluded.name),
      job_title         = greatest_str(public.submissions.job_title,         excluded.job_title),
      job_level         = greatest_str(public.submissions.job_level,         excluded.job_level),
      linkedin_url      = greatest_str(public.submissions.linkedin_url,      excluded.linkedin_url),
      company_name      = greatest_str(public.submissions.company_name,      excluded.company_name),
      company_domain    = greatest_str(public.submissions.company_domain,    excluded.company_domain),
      company_industry  = greatest_str(public.submissions.company_industry,  excluded.company_industry),
      company_size      = greatest_str(public.submissions.company_size,      excluded.company_size),
      company_revenue   = greatest_str(public.submissions.company_revenue,   excluded.company_revenue),
      company_funding   = greatest_str(public.submissions.company_funding,   excluded.company_funding),
      company_founded_year = coalesce(public.submissions.company_founded_year, excluded.company_founded_year),
      city              = greatest_str(public.submissions.city,              excluded.city),
      region            = greatest_str(public.submissions.region,            excluded.region),
      country           = greatest_str(public.submissions.country,           excluded.country),
      age_bracket       = greatest_str(public.submissions.age_bracket,       excluded.age_bracket),
      buying_intent     = greatest_str(public.submissions.buying_intent,     excluded.buying_intent),
      main_goal         = greatest_str(public.submissions.main_goal,         excluded.main_goal),
      learning_style    = greatest_str(public.submissions.learning_style,    excluded.learning_style),
      utm_source        = greatest_str(public.submissions.utm_source,        excluded.utm_source),
      utm_ref           = greatest_str(public.submissions.utm_ref,           excluded.utm_ref),
      legacy_responses  = coalesce(public.submissions.legacy_responses, '{}'::jsonb) || coalesce(excluded.legacy_responses, '{}'::jsonb),
      enrichment        = coalesce(public.submissions.enrichment, '{}'::jsonb) || coalesce(excluded.enrichment, '{}'::jsonb),
      enrichment_raw    = coalesce(public.submissions.enrichment_raw, '{}'::jsonb) || coalesce(excluded.enrichment_raw, '{}'::jsonb),
      enrichment_status = coalesce(public.submissions.enrichment_status, excluded.enrichment_status),
      source            = coalesce(public.submissions.source, excluded.source),
      ts                = least(public.submissions.ts, excluded.ts)
  `

  // Create a small SQL helper to pick the longest non-null string (handles longest-wins).
  await c.query(`
    create or replace function greatest_str(a text, b text) returns text language sql immutable as $$
      select case
        when a is null then b
        when b is null then a
        when length(b) > length(a) then b
        else a
      end
    $$;
  `)

  let inserted = 0, updated = 0
  for (const rec of merged.values()) {
    const r = await c.query(SQL, [
      rec.id,
      rec.email,
      rec.name || null,
      rec.ts,
      rec.archetype || 'practical_learner',  // default for legacy rows that never picked an archetype
      rec.source || 'fillout_legacy',
      rec.job_title || null,
      rec.job_level || null,
      rec.linkedin_url || null,
      rec.company_name || null,
      rec.company_domain || null,
      rec.company_industry || null,
      rec.company_size || null,
      rec.company_revenue || null,
      rec.company_funding || null,
      rec.company_founded_year || null,
      rec.city || null,
      rec.region || null,
      rec.country || null,
      rec.age_bracket || null,
      rec.buying_intent || null,
      rec.main_goal || null,
      rec.learning_style || null,
      rec.utm_source || null,
      rec.utm_ref || null,
      Object.keys(rec.legacy_responses).length ? JSON.stringify(rec.legacy_responses) : null,
      rec.enrichment ? JSON.stringify(rec.enrichment) : null,
      Object.keys(rec.enrichment_raw).length ? JSON.stringify(rec.enrichment_raw) : null,
      rec.enrichment_status || null,
    ])
    if (r.rowCount === 1) inserted++
    // ON CONFLICT DO UPDATE doesn't distinguish update vs insert in rowCount; we'd need RETURNING xmax to tell.
    // Skip the distinction — total upserts is all we report.
  }

  await c.end()
  console.log(`\nUpserted ${inserted} rows.`)
}

main().catch(err => { console.error(err); process.exit(1) })
