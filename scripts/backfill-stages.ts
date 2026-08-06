// Re-score every historical submission with the CURRENT stage classifier.
//
// RESULT WHEN FIRST RUN (2026-08-06): zero rows changed. Every quiz-era row
// already carried current-classifier output — computed and stored distributions
// matched exactly on all five rungs (101 / 550 / 307 / 173 / 304 over 1,435
// rows). The v3 ladder change had already propagated. Keep the script anyway:
// it is the correct tool the next time the classifier changes, and its real
// value that day was proving a suspicion FALSE rather than fixing anything.
//
// The suspicion was reasonable and wrong: staged_at showed only ~40 rows
// restamped after the v3 change, which looks like history was never re-scored.
// It had been. Timestamps recorded when a row was last written, not which
// classifier version produced it. Do not infer classifier version from
// staged_at — re-run this instead, it is cheap and it answers directly.
//
// It imports assignStage rather than reimplementing the rules in SQL. A SQL
// port would be faster and would drift from the TypeScript the moment either
// changed, which is exactly the class of bug this script exists to detect.
//
// Safety: every row's current stage is snapshotted into stage_history BEFORE
// anything is written, so the old classification is always recoverable. Run
// with no flag for a dry run; pass --apply to commit. Needs a Supabase service
// key in the environment; with only MCP access, use classify-tuples.ts instead.

import { createClient } from '@supabase/supabase-js'
import { fromRow } from '../lib/kv'
import { assignStage } from '../lib/segmentation-v2'

const APPLY = process.argv.includes('--apply')
const BATCH = 500

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function main() {
  const c = sb()

  // Only rows that have ever been classified. Untouched imports stay untouched.
  const all: Record<string, unknown>[] = []
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await c
      .from('submissions')
      .select('*')
      .not('stage', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, from + BATCH - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < BATCH) break
  }

  const changes: { id: string; from: string; to: string; score: number; reason: string }[] = []
  const moves = new Map<string, number>()
  let unchanged = 0

  for (const row of all) {
    const before = String(row.stage)
    let after: ReturnType<typeof assignStage>
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      after = assignStage(fromRow(row as any))
    } catch (err) {
      console.error('classifier threw for', row.id, err)
      continue
    }
    if (after.stage === before) { unchanged++; continue }
    changes.push({ id: String(row.id), from: before, to: after.stage, score: after.score, reason: after.reason })
    const k = `${before} → ${after.stage}`
    moves.set(k, (moves.get(k) ?? 0) + 1)
  }

  const rung = (s: string) => Number(s.match(/^S(\d)/)?.[1] ?? -1)
  const down = changes.filter(x => rung(x.to) < rung(x.from)).length
  const up = changes.filter(x => rung(x.to) > rung(x.from)).length

  console.log(`\nscanned ${all.length} classified rows`)
  console.log(`unchanged ${unchanged} · changed ${changes.length} (down ${down}, up ${up})\n`)
  console.log('transitions:')
  for (const [k, n] of Array.from(moves.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(34)} ${n}`)

  const dist = new Map<string, number>()
  for (const row of all) {
    const ch = changes.find(x => x.id === String(row.id))
    const final = ch ? ch.to : String(row.stage)
    dist.set(final, (dist.get(final) ?? 0) + 1)
  }
  console.log('\nresulting distribution:')
  for (const k of Array.from(dist.keys()).sort()) {
    const n = dist.get(k)!
    console.log(`  ${k.padEnd(18)} ${String(n).padStart(5)}  ${(100 * n / all.length).toFixed(1)}%`)
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.')
    return
  }

  // Snapshot BEFORE writing, so the pre-backfill classification survives.
  const snapshots = changes.map(ch => {
    const row = all.find(r => String(r.id) === ch.id)!
    return {
      submission_id: ch.id,
      stage: ch.from,
      stage_score: row.stage_score ?? null,
      persona: row.persona ?? null,
      snapshot_at: new Date().toISOString(),
    }
  })
  for (let i = 0; i < snapshots.length; i += 200) {
    const { error } = await c.from('stage_history').insert(snapshots.slice(i, i + 200))
    if (error) throw new Error(`snapshot failed, nothing updated: ${error.message}`)
  }
  console.log(`\nsnapshotted ${snapshots.length} prior classifications into stage_history`)

  let written = 0
  for (const ch of changes) {
    const { error } = await c.from('submissions').update({
      stage: ch.to,
      stage_score: ch.score,
      stage_reason: ch.reason,
      staged_at: new Date().toISOString(),
    }).eq('id', ch.id)
    if (error) { console.error('update failed for', ch.id, error.message); continue }
    written++
  }
  console.log(`updated ${written}/${changes.length} rows`)
}

main().catch(e => { console.error(e); process.exit(1) })
