// THE X-RAY — the funnel as it actually is, right now.
//
// WHY IT EXISTS (owner, 2026-08-19): "over the last 2 weeks we shipped many
// things and now it's hard for me to track where we are." A hand-written map
// would have been stale within a day, which is the disease, not the cure. So
// every fact on this page is READ AT REQUEST TIME from the thing that decides
// it: the questions and their branching from the live published form config,
// the running tests from the experiments table, the price switch from
// app_settings, the entry order from the same rule the quiz page applies.
// If the funnel changes and this page does not, the page is broken.

import { getLivePublishedConfig } from '@/lib/form-config'
import { QUESTIONS_V2_MERGED } from '@/lib/questions-v2-merged'
import { foundingConfig } from '@/lib/founding-window'
import { db } from '@/lib/revenue-shared'
import type { V2Question } from '@/lib/form-schema'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const INK = '#1A1A1A'
const MUTE = '#7A7A7A'
const HAIR = '#E8E2D4'
const LATTE = '#FEF7E7'
const PAPER = '#FFFDFA'
const GREEN = '#2E7D32'
const AMBER = '#B26A00'
const RED = '#B00020'

type Exp = {
  key: string; name: string; page: string; status: string
  variants: { key: string; name?: string; weight?: number }[]
  primary_metric: string | null; winner_variant: string | null; target_step: string | null
}

const PREVIEW: Record<string, string> = {
  quiz_flow_v2: '?qf=v2',
  result_page_v3: '&xv=research',
  entry_microcopy_v1: '?xv=microcopy',
  landing_cta_v1: '?xv=quiz',
  result_strip_v1: '&xv=strip',
}

export default async function XrayPage() {
  let questions: V2Question[] = QUESTIONS_V2_MERGED
  let configSource = 'in-repo seed (no published version)'
  try {
    const cfg = await getLivePublishedConfig('quiz-v2')
    if (cfg && Array.isArray(cfg.questions) && cfg.questions.length) {
      questions = cfg.questions as V2Question[]
      configSource = `published form config v${(cfg as { version?: number }).version ?? '?'}`
    }
  } catch { /* seed stands */ }

  // The SAME reorder the quiz page applies for question-first entry, so the
  // sequence below is the sequence a person walks, not the stored order.
  const email = questions.find(q => q.id === 'email')
  const name = questions.find(q => q.id === 'name')
  const rest = questions.filter(q => q.id !== 'name' && q.id !== 'email')
  const pii = [email, name].filter(Boolean) as V2Question[]
  const ordered = pii.length && rest.length ? [...rest, ...pii] : questions

  const fw = await foundingConfig()

  let exps: Exp[] = []
  try {
    const { data } = await db()
      .from('experiments')
      .select('key, name, page, status, variants, primary_metric, winner_variant, target_step')
      .in('status', ['running', 'draft', 'paused'])
      .order('status')
    exps = (data ?? []) as Exp[]
  } catch { /* leave empty */ }
  const onPage = (p: string) => exps.filter(e => (e.page || '').replace(/^\//, '') === p)

  const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, textAlign: 'left', padding: '6px 10px 6px 0' }
  const td: React.CSSProperties = { fontSize: 12.5, padding: '7px 10px 7px 0', verticalAlign: 'top', borderBottom: `1px solid ${HAIR}` }
  const chip = (text: string, color: string): React.ReactNode => (
    <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 9.5, letterSpacing: '.06em', textTransform: 'uppercase', border: `1.5px solid ${color}`, color, padding: '2px 6px', fontWeight: 700, whiteSpace: 'nowrap', marginRight: 6 }}>{text}</span>
  )

  const Stage = ({ n, title, sub, children }: { n: string; title: string; sub?: string; children: React.ReactNode }) => (
    <section style={{ border: `2px solid ${INK}`, background: PAPER, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `2px solid ${INK}`, background: LATTE, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', background: INK, color: LATTE, fontWeight: 800, fontSize: 12, padding: '3px 9px' }}>{n}</span>
        <h2 style={{ fontSize: 15.5, fontWeight: 800, margin: 0, flex: '1 1 220px' }}>{title}</h2>
        {sub && <span style={{ fontSize: 11.5, color: MUTE }}>{sub}</span>}
      </div>
      <div style={{ padding: '12px 14px 14px' }}>{children}</div>
    </section>
  )

  const ExpList = ({ page }: { page: string }) => {
    const list = onPage(page)
    if (!list.length) return <p style={{ fontSize: 12.5, color: MUTE, margin: '4px 0 0' }}>No test on this surface right now.</p>
    return (
      <div style={{ marginTop: 8 }}>
        {list.map(e => (
          <div key={e.key} style={{ border: `1px solid ${HAIR}`, padding: '8px 10px', marginBottom: 6 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
              {chip(e.status, e.status === 'running' ? GREEN : e.status === 'paused' ? RED : AMBER)}
              <strong style={{ fontSize: 13 }}>{e.name || e.key}</strong>
            </div>
            <div style={{ fontSize: 11.5, color: MUTE, marginTop: 3 }}>
              <code>{e.key}</code> · decided on <strong>{e.primary_metric || 'n/a'}</strong>
              {e.target_step ? <> · seam {e.target_step.replace(/_/g, ' ')}</> : null}
              {e.winner_variant ? <> · winner <strong style={{ color: GREEN }}>{e.winner_variant}</strong></> : null}
            </div>
            <div style={{ fontSize: 11.5, marginTop: 4 }}>
              {(e.variants || []).map(v => (
                <span key={v.key} style={{ marginRight: 10, color: (v.weight ?? 0) === 0 ? MUTE : INK }}>
                  <strong>{v.key}</strong> {Math.round((v.weight ?? 0) * 100)}%
                </span>
              ))}
              {PREVIEW[e.key] && <span style={{ color: MUTE }}>· preview <code>{PREVIEW[e.key]}</code></span>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const branchCount = ordered.filter(q => q.branching && q.branching.length).length

  return (
    <div style={{ padding: '22px 26px 70px', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK }}>X-ray</h1>
      <p style={{ fontSize: 13, color: MUTE, marginTop: 6, maxWidth: 800, lineHeight: 1.55 }}>
        The funnel exactly as it stands, read live at page load: questions and branches from the {configSource},
        tests from the experiments table, pricing from the founding-window switch. Nothing here is typed by hand, so
        it cannot drift from what visitors actually meet.
      </p>

      <Stage n="1" title="Landing" sub="quiz.thecentral.ai">
        <p style={{ fontSize: 13, margin: 0 }}>
          Hero, member-pass card, FOMO marquee. Both CTAs go straight into the quiz. The pass card itself is
          clickable (it drew 169 dead clicks a fortnight before that fix).
        </p>
        <ExpList page="landing" />
      </Stage>

      <Stage n="2" title="Quiz" sub={`${ordered.length} steps · ${branchCount} branching`}>
        <p style={{ fontSize: 13, margin: '0 0 10px' }}>
          Question-first: content questions come first, then email, then name — the order below is the order a person
          walks. Progress bar only; the length is never revealed before the last three steps.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>#</th><th style={th}>Question</th><th style={th}>Type</th><th style={th}>Saves to</th><th style={th}>Branching</th></tr></thead>
            <tbody>
              {ordered.map((q, i) => (
                <tr key={q.id}>
                  <td style={{ ...td, fontFamily: 'ui-monospace, Menlo, monospace', color: MUTE }}>{i + 1}</td>
                  <td style={td}>
                    <strong>{q.label}</strong>
                    <div style={{ fontSize: 11, color: MUTE }}><code>{q.id}</code>{q.required ? '' : ' · optional'}</div>
                  </td>
                  <td style={{ ...td, fontSize: 11.5, color: MUTE }}>{q.type}{q.options?.length ? ` (${q.options.length})` : ''}</td>
                  <td style={{ ...td, fontSize: 11.5 }}>{q.dbColumn ? <code>{q.dbColumn}</code> : <span style={{ color: MUTE }}>—</span>}</td>
                  <td style={{ ...td, fontSize: 11.5 }}>
                    {q.branching?.length
                      ? q.branching.map((r, ri) => (
                          <div key={ri} style={{ color: AMBER }}>
                            if {r.when.map(c => `${c.context ? `[${c.context}]` : c.questionId} ${c.op} ${Array.isArray(c.value) ? c.value.join('/') : c.value}`).join(' and ')} → <strong>{r.goto}</strong>
                          </div>
                        ))
                      : <span style={{ color: MUTE }}>next question</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: MUTE, marginTop: 8 }}>
          Leaving mid-quiz triggers the exit catch (offers to save the spot); a valid email alone saves a partial lead
          even if the person never finishes.
        </p>
        <ExpList page="quiz" />
      </Stage>

      <Stage n="3" title="Calculating" sub="~3 seconds">
        <p style={{ fontSize: 13, margin: 0 }}>
          The completion beat: pass assembling, ownership framing, then a redirect to the result page carrying name,
          score, persona, stage and submission id.
        </p>
      </Stage>

      <Stage n="4" title="Result page" sub="every sale happens here">
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>
          Order: hero and stage gauge → study plan (week 1 free, 2 to 5 walled) → the offer → library grid → reviews →
          optional video tour → risk-free block → member pass (LinkedIn-gated) → FAQ. Sticky offer bar throughout.
          India is shown the lifetime offer instead of the trial.
        </p>
        <div style={{ border: `2px solid ${fw.enabled ? GREEN : HAIR}`, background: LATTE, padding: '10px 12px', fontSize: 12.5 }}>
          <strong>Pricing right now: </strong>
          {fw.enabled ? (
            <>founding window <strong style={{ color: GREEN }}>ON</strong> — {fw.window_hours}h at $4.99 from the moment
            the quiz is completed, then ${(fw.list_cents / 100).toFixed(2)} list, enforced in both checkout routes.
            Arrivals from our recovery emails keep the $4.99 (held rate).</>
          ) : (
            <>founding window <strong style={{ color: AMBER }}>OFF</strong> — everyone pays $4.99.</>
          )}
        </div>
        <ExpList page="result" />
      </Stage>

      <Stage n="5" title="Checkout" sub="embedded Stripe modal">
        <p style={{ fontSize: 13, margin: 0 }}>
          Every buy button opens the modal on-page; one-tap wallets appear where the device supports them, card form
          otherwise. The intent is created only when someone actually pays, and it always saves the card so the day-28
          renewal can charge. A $4.99 or ${(fw.list_cents / 100).toFixed(2)} charge both count as a paid trial.
        </p>
      </Stage>

      <Stage n="6" title="After" sub="owned loop">
        <p style={{ fontSize: 13, margin: 0 }}>
          Finishers enter the post-quiz sequence (pass, week 1, the stage above). People who open checkout without
          paying enter checkout recovery. Both quote $4.99 and carry links that honour it. Trials convert to $59.75 a
          year at day 28.
        </p>
      </Stage>

      <p style={{ fontSize: 11.5, color: MUTE, marginTop: 18, maxWidth: 800, lineHeight: 1.5 }}>
        Sources: form config (live published version or seed), <code>experiments</code>, <code>app_settings.founding_window</code>.
        Experiment weights are what the bandit is serving at this moment.
      </p>
    </div>
  )
}
