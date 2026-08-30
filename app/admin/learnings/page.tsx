// The Theory of Conversions — the owner's "diario dei learning" (2026-08-30):
// "ogni volta proviamo cose nuove, nuovi esperimenti, ma io ho bisogno che qui
// costruiamo una memoria scientifica della conversione come se fossimo in un
// laboratorio di r&d pharmaceuticals... per scoprire la verità".
//
// cohort_learnings already tracked on-page A/B experiments (title, hypothesis,
// status, before/after cohort evidence) — but only that, and only visible as
// one collapsed section inside /admin/cohorts. Nothing recorded a pure DATA
// finding with no variant to ship ("decision-makers convert 2x better"), and
// nothing was a destination you could actually go read, like a lab notebook.
//
// Added `kind` to the same table (2026-08-30 migration) instead of a second
// table: 'experiment' keeps its cohort-evidence treatment on /admin/cohorts
// (this page does not recompute that Bayesian math, one source for it);
// 'analysis' and 'infra_fix' are new, for findings and for corrections to what
// a number itself meant. This page is the one place all three live together,
// oldest verdict first within each state so the story reads front-to-back.

import { db } from '@/lib/revenue-shared'

export const dynamic = 'force-dynamic'
export const revalidate = 60

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const LATTE = '#FEF7E7'
const GREEN = '#2E7D32'
const RED = '#B00020'
const AMBER = '#B26A00'

type Row = {
  id: number
  title: string
  hypothesis: string | null
  kind: 'experiment' | 'analysis' | 'infra_fix'
  status: 'open' | 'confirmed' | 'refuted' | 'abandoned'
  step: string | null
  applied_at_cohort: number | null
  notes: string | null
  links: { label: string; url: string }[] | null
  created_at: string
  decided_at: string | null
}

const STEP_LABEL: Record<string, string> = {
  landed_to_started: 'landing → start',
  started_to_completed: 'start → finish',
  completed_to_clicked: 'finish → checkout',
  clicked_to_trial: 'checkout → trial',
  landed_to_trial: 'landing → trial',
}

const KIND_LABEL: Record<Row['kind'], string> = {
  experiment: 'EXPERIMENT',
  analysis: 'ANALYSIS',
  infra_fix: 'DATA FIX',
}
const KIND_NOTE: Record<Row['kind'], string> = {
  experiment: 'an on-page test with a variant, judged on cohort evidence — see /admin/cohorts for the live math',
  analysis: 'a pattern found in the data, with nothing (yet) shipped to act on it',
  infra_fix: 'a correction to how a number itself was computed — changes what earlier numbers meant',
}

const STATUS_COLOR: Record<Row['status'], string> = { open: AMBER, confirmed: GREEN, refuted: RED, abandoned: MUTE }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default async function LearningsPage() {
  let rows: Row[] = []
  let err: string | null = null
  try {
    const { data, error } = await db()
      .from('cohort_learnings')
      .select('id, title, hypothesis, kind, status, step, applied_at_cohort, notes, links, created_at, decided_at')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    rows = (data ?? []) as Row[]
  } catch (e) { err = e instanceof Error ? e.message : String(e) }

  if (err) {
    return <div style={{ padding: 26 }}><h1 style={{ fontWeight: 800, fontSize: 24 }}>Learnings</h1><p style={{ color: RED }}>{err}</p></div>
  }

  const counts = {
    confirmed: rows.filter(r => r.status === 'confirmed').length,
    refuted: rows.filter(r => r.status === 'refuted').length,
    open: rows.filter(r => r.status === 'open').length,
    abandoned: rows.filter(r => r.status === 'abandoned').length,
  }

  return (
    <div style={{ padding: '22px 26px 60px', maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>The Theory of Conversions</h1>
      <p style={{ fontSize: 12.5, color: MUTE, marginTop: 6, maxWidth: 780, lineHeight: 1.6 }}>
        Every experiment, every data finding, and every correction to how a number is computed, in one place, so the
        next idea builds on what is already known rather than repeating a test we already ran. A row here is either a
        law — <strong style={{ color: GREEN }}>confirmed</strong> or <strong style={{ color: RED }}>refuted</strong> — or
        still <strong style={{ color: AMBER }}>open</strong>, and says so plainly.
      </p>
      <div className="flex flex-wrap" style={{ gap: 16, marginTop: 14, fontSize: 12.5 }}>
        <span><strong style={{ color: GREEN }}>{counts.confirmed}</strong> confirmed</span>
        <span><strong style={{ color: RED }}>{counts.refuted}</strong> refuted</span>
        <span><strong style={{ color: AMBER }}>{counts.open}</strong> open</span>
        {counts.abandoned > 0 && <span><strong style={{ color: MUTE }}>{counts.abandoned}</strong> abandoned</span>}
        <a href="/admin/cohorts" style={{ color: '#046BB1', fontWeight: 700 }}>the live cohort math for running experiments →</a>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: MUTE, marginTop: 20 }}>Nothing recorded yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {rows.map(r => {
            const vColor = STATUS_COLOR[r.status]
            return (
              <div key={r.id} style={{ border: `2px solid ${INK}`, background: '#FFFDFA', padding: '12px 14px' }}>
                <div className="flex flex-wrap items-baseline" style={{ gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: vColor, border: `2px solid ${vColor}`, padding: '1px 6px' }}>
                    {r.status.toUpperCase()}
                  </span>
                  <span title={KIND_NOTE[r.kind]} style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: MUTE, background: LATTE, border: `1px solid ${HAIR}`, padding: '2px 6px' }}>
                    {KIND_LABEL[r.kind]}
                  </span>
                  <strong style={{ fontSize: 14, color: INK }}>{r.title}</strong>
                  <span style={{ fontSize: 11, color: MUTE, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                    {fmtDate(r.created_at)}
                    {r.step && ` · ${STEP_LABEL[r.step] ?? r.step}`}
                    {r.applied_at_cohort != null && ` · from cohort ${r.applied_at_cohort}`}
                  </span>
                </div>
                {r.hypothesis && (
                  <p style={{ fontSize: 12, color: '#4A4A4A', marginTop: 6, lineHeight: 1.55, maxWidth: 880 }}>{r.hypothesis}</p>
                )}
                {r.notes && <p style={{ fontSize: 11, color: MUTE, marginTop: 6, lineHeight: 1.5 }}>{r.notes}</p>}
                {r.links && r.links.length > 0 && (
                  <div className="flex flex-wrap" style={{ gap: 12, marginTop: 6 }}>
                    {r.links.map(l => (
                      <a key={l.url} href={l.url} style={{ fontSize: 11, color: '#046BB1', fontWeight: 700 }}>{l.label} ↗</a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
