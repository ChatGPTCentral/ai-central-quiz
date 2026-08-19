// THE GENE POOL, watchable. Which alleles are winning, which individuals are
// alive, what was born and what died, and what the whole thing has earned
// against the baseline it started from.

import { db, allelePosterior, type AlleleRow } from '@/lib/evolution'
import { ApproveControls, RetireControl, AlleleToggle, MasterControls } from '@/components/admin/EvolveControls.client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const INK = '#1A1A1A', MUTE = '#75705F', HAIR = '#DED7C7', PAPER = '#FFFDFA'
const LATTE = '#FEF7E7', GREEN = '#2E7D32', RED = '#A31621', AMBER = '#C96F0A'

type Fit = { id: string; genome: Record<string, string>; generation: number; weight: number; retired_at: string | null; note: string | null; approved_at: string | null; approved_by: string | null; rejected_at: string | null; exposures: number; clickers: number; trials: number }
type LogRow = { at: string; generation: number; action: string; detail: Record<string, unknown> }

export default async function EvolvePage() {
  const c = db()
  const [{ data: aData }, { data: fData }, { data: lData }, { data: cfgRow }] = await Promise.all([
    c.from('allele_fitness').select('*').order('slot'),
    c.from('individual_fitness').select('*').order('generation'),
    c.from('evolution_log').select('at, generation, action, detail').order('at', { ascending: false }).limit(12),
    c.from('app_settings').select('value').eq('key', 'evolution').maybeSingle(),
  ])
  const cfg = (cfgRow?.value ?? { enabled: true, auto_approve: false }) as { enabled?: boolean; auto_approve?: boolean }
  const alleles = (aData ?? []) as AlleleRow[]
  const pop = (fData ?? []) as Fit[]
  const log = (lData ?? []) as LogRow[]
  const post = allelePosterior(alleles)

  const live = pop.filter(p => !p.retired_at && p.approved_at)
  const pending = pop.filter(p => !p.retired_at && !p.approved_at)
  const totalExp = pop.reduce((a, p) => a + Number(p.exposures || 0), 0)
  const totalTrials = pop.reduce((a, p) => a + Number(p.trials || 0), 0)
  const poolRate = totalExp ? totalTrials / totalExp : 0
  const base = pop.find(p => p.id === 'baseline')
  const baseRate = base && base.exposures ? base.trials / base.exposures : 0

  const slots = Array.from(new Set(alleles.map(a => a.slot)))
  const th: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: MUTE, textAlign: 'left', padding: '6px 10px 6px 0' }
  const td: React.CSSProperties = { fontSize: 12.5, padding: '7px 10px 7px 0', borderBottom: `1px solid ${HAIR}`, verticalAlign: 'top' }

  return (
    <div style={{ padding: '20px 24px 50px', maxWidth: 1150 }}>
      <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.03em', margin: 0, color: INK }}>Evolution</h1>
      <p style={{ fontSize: 13, color: MUTE, margin: '6px 0 16px', maxWidth: 860, lineHeight: 1.55 }}>
        The result page is a population. Each individual is one allele per slot; traffic is allocated by sampling from
        each allele&rsquo;s posterior, so a page made of promising genes earns traffic before it has trials of its own.
        That pooling is the whole trick: an allele is scored across every individual carrying it, so it collects roughly
        half the surface&rsquo;s traffic rather than a fraction of it. Fitness is <strong style={{ color: INK }}>trials</strong>;
        clicks are shown but never promote a gene on their own.
      </p>

      <MasterControls enabled={cfg.enabled !== false} autoApprove={cfg.auto_approve === true} />

      {pending.length > 0 && (
        <div style={{ border: `3px solid ${AMBER}`, background: '#FFF9EE', padding: '12px 14px', marginBottom: 18 }}>
          <strong style={{ fontSize: 14 }}>Waiting for you: {pending.length} new page{pending.length > 1 ? 's' : ''}</strong>
          <div style={{ fontSize: 12, color: MUTE, margin: '4px 0 10px' }}>
            Bred from the winning genes. They are serving <strong>no traffic at all</strong> until you approve them.
            Look before you decide.
          </div>
          {pending.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '7px 0', borderTop: `1px solid ${HAIR}` }}>
              <strong style={{ fontSize: 12.5, minWidth: 90 }}>{p.id}</strong>
              <span style={{ fontSize: 11.5, color: MUTE, flex: '1 1 260px' }}>
                {Object.entries(p.genome || {}).map(([k, v]) => `${k}=${v}`).join('  ')}
              </span>
              <a href={`/result?name=Moshe%20Epstein&score=77&persona=maker&stage=S3_practitioner&id=03a3224c-d974-4ff9-971b-65481171f384&g=${p.id}#offer`}
                 target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#3B5C8F' }}>see it ↗</a>
              <ApproveControls id={p.id} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { l: 'Pool exposures', v: totalExp.toLocaleString() },
          { l: 'Pool trials', v: String(totalTrials) },
          { l: 'Pool rate', v: `${(poolRate * 100).toFixed(1)}%` },
          { l: 'Baseline rate', v: baseRate ? `${(baseRate * 100).toFixed(1)}%` : '—' },
          { l: 'Live individuals', v: String(live.length) },
          { l: 'Generation', v: String(pop.reduce((a, p) => Math.max(a, p.generation), 0)) },
        ].map(k => (
          <div key={k.l} style={{ border: `2px solid ${INK}`, background: PAPER, padding: '9px 14px', minWidth: 118 }}>
            <div style={{ fontSize: 10, color: MUTE, textTransform: 'uppercase', letterSpacing: '.06em' }}>{k.l}</div>
            <div style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{k.v}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>The gene pool</h2>
      <p style={{ fontSize: 12, color: MUTE, margin: '0 0 10px', maxWidth: 820 }}>
        Each allele&rsquo;s trial rate, pooled across every individual carrying it and shrunk toward the pool mean with a
        prior worth 40 exposures — so twelve people and one lucky sale cannot crown a gene.
      </p>
      {slots.map(slot => {
        const rows = alleles.filter(a => a.slot === slot)
        const best = Math.max(...rows.map(r => post.get(`${r.slot}:${r.allele}`)?.mean ?? 0))
        return (
          <div key={slot} style={{ border: `2px solid ${INK}`, background: PAPER, marginBottom: 10 }}>
            <div style={{ padding: '7px 12px', borderBottom: `1px solid ${HAIR}`, background: LATTE, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>{slot}</div>
            <div style={{ padding: '8px 12px 10px' }}>
              {rows.map(r => {
                const p = post.get(`${r.slot}:${r.allele}`)
                const mean = p?.mean ?? 0
                const leading = mean >= best - 1e-9 && rows.length > 1
                return (
                  <div key={r.allele} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 230, fontSize: 12.5, fontWeight: leading ? 700 : 400 }}>
                      {r.label}{r.is_baseline ? <span style={{ color: MUTE, fontWeight: 400 }}> · baseline</span> : null}
                    </div>
                    <div style={{ flex: 1, height: 16, background: '#F1ECE2', border: `1px solid ${HAIR}`, position: 'relative', minWidth: 120 }}>
                      <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, (mean / Math.max(0.0001, best)) * 100)}%`, background: leading ? GREEN : AMBER, opacity: leading ? 0.8 : 0.45 }} />
                    </div>
                    <div style={{ width: 62, textAlign: 'right', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: leading ? GREEN : INK }}>{(mean * 100).toFixed(1)}%</div>
                    <div style={{ width: 150, fontSize: 11, color: MUTE, textAlign: 'right' }}>{r.trials} trials · {r.exposures} seen · {r.clickers} clicked</div>
                    <div style={{ width: 56, textAlign: 'right' }}>
                      {r.is_baseline ? <span style={{ fontSize: 10, color: MUTE }}>control</span> : <AlleleToggle slot={r.slot} allele={r.allele} enabled={r.enabled} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '22px 0 8px' }}>The population</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Individual</th><th style={th}>Genome</th><th style={th}>Traffic</th><th style={th}>Seen</th><th style={th}>Clicked</th><th style={th}>Trials</th><th style={th}>Rate</th><th style={th}>Preview</th></tr></thead>
          <tbody>
            {pop.sort((a, b) => Number(b.weight) - Number(a.weight)).map(p => {
              const rate = p.exposures ? p.trials / p.exposures : 0
              const dead = !!p.retired_at
              return (
                <tr key={p.id} style={{ opacity: dead ? 0.45 : 1 }}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {p.id}{p.id === 'baseline' ? <span style={{ color: MUTE, fontWeight: 400 }}> · control</span> : null}
                    {dead ? <span style={{ color: RED, fontWeight: 400 }}> · retired</span> : null}
                    <div style={{ fontSize: 10.5, color: MUTE, fontWeight: 400 }}>gen {p.generation}{p.note ? ` · ${p.note}` : ''}</div>
                  </td>
                  <td style={{ ...td, fontSize: 11.5, color: MUTE }}>
                    {Object.entries(p.genome || {}).map(([k, v]) => `${k}=${v}`).join('  ')}
                  </td>
                  <td style={td}>{dead ? '—' : `${Math.round(Number(p.weight) * 100)}%`}</td>
                  <td style={td}>{p.exposures}</td>
                  <td style={td}>{p.clickers}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{p.trials}</td>
                  <td style={{ ...td, color: rate > baseRate ? GREEN : INK, fontWeight: 700 }}>{p.exposures ? `${(rate * 100).toFixed(1)}%` : '—'}</td>
                  <td style={td}>
                    <a href={`/result?name=Moshe%20Epstein&score=77&persona=maker&stage=S3_practitioner&id=03a3224c-d974-4ff9-971b-65481171f384&g=${p.id}#offer`} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: '#3B5C8F', marginRight: 8 }}>see it ↗</a>
                    {!dead && p.id !== 'baseline' && <RetireControl id={p.id} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '22px 0 8px' }}>Lineage</h2>
      {log.length === 0 ? (
        <p style={{ fontSize: 12.5, color: MUTE }}>
          No generation has been bred yet. Breeding needs 400 pool exposures and 12 pool trials, and never runs more
          than once a day — the cron reweights traffic every hour in the meantime.
        </p>
      ) : (
        <div style={{ border: `2px solid ${INK}`, background: PAPER }}>
          {log.map((l, i) => (
            <div key={i} style={{ padding: '9px 12px', borderBottom: i < log.length - 1 ? `1px solid ${HAIR}` : undefined, fontSize: 12.5 }}>
              <strong>{l.action === 'generation' ? `Generation ${l.generation}` : l.action}</strong>
              <span style={{ color: MUTE }}> · {new Date(l.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>
                {l.action === 'generation' ? <>born <strong style={{ color: GREEN }}>{String((l.detail as { born?: string }).born ?? '')}</strong></> : JSON.stringify(l.detail).slice(0, 160)}
                {(l.detail as { retired?: string }).retired ? <> · retired <strong style={{ color: RED }}>{String((l.detail as { retired?: string }).retired)}</strong></> : null}
                {' · '}{JSON.stringify((l.detail as { genome?: unknown }).genome ?? {})}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
