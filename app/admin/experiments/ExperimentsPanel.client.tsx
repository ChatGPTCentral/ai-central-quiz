'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EXPERIMENT_SLOTS } from '@/lib/experiment-slots'
import { STAGES, PERSONAS } from '@/lib/segmentation-v2'

// ── Types mirrored from the API payloads ────────────────────────────
interface Variant {
  key: string
  name?: string
  weight: number
  approved?: boolean
  overrides: Record<string, string>
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExperimentRow = any
interface VariantResult {
  key: string
  exposures: number
  clickers: number
  netNewPaid: number
  clickRate: number
  rate: number
  probBest: number
  expectedLoss: number
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  draft: { bg: '#F5F5F5', fg: '#9C9C9C' },
  running: { bg: '#E8F5E9', fg: '#2E7D32' },
  paused: { bg: '#FFF3E0', fg: '#E65100' },
  ended: { bg: '#ECEFF1', fg: '#546E7A' },
  killed: { bg: '#FDECEA', fg: '#B3261E' },
}

interface FormState {
  key: string
  name: string
  hypothesis: string
  primaryMetric: 'checkout_click' | 'net_new_paid'
  banditEnabled: boolean
  minExposuresPerVariant: number
  stages: string[]
  personas: string[]
  utmSources: string
  variants: Variant[]
}

const EMPTY_FORM: FormState = {
  key: '',
  name: '',
  hypothesis: '',
  primaryMetric: 'checkout_click',
  banditEnabled: false,
  minExposuresPerVariant: 200,
  stages: [],
  personas: [],
  utmSources: '',
  variants: [
    { key: 'control', name: 'Control', weight: 0.5, approved: true, overrides: {} },
    { key: 'v1', name: 'Variant 1', weight: 0.5, approved: true, overrides: {} },
  ],
}

export default function ExperimentsPanel({
  initialExperiments,
  initialResults,
}: {
  initialExperiments: ExperimentRow[]
  initialResults: Record<string, VariantResult[]>
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [editing, setEditing] = useState<FormState | null>(null)
  const [isNew, setIsNew] = useState(true)

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text })
    window.setTimeout(() => setMsg(null), 5000)
  }

  async function act(key: string, action: string, variantKey?: string) {
    if ((action === 'kill' || action === 'end') && !confirm(`${action.toUpperCase()} experiment "${key}"?\n\nkill = immediate stop, visitors get control within ~30s.`)) return
    setBusy(`${key}:${action}`)
    try {
      const res = await fetch('/api/admin/experiments/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, action, variantKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      flash('ok', data.result ? `${action}: ${data.result.action} — ${data.result.reason}` : `${action} ✓`)
      router.refresh()
    } catch (e) {
      flash('err', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  function editExisting(row: ExperimentRow) {
    const t = row.targeting || {}
    setIsNew(false)
    setEditing({
      key: row.key,
      name: row.name || '',
      hypothesis: row.hypothesis || '',
      primaryMetric: row.primary_metric === 'net_new_paid' ? 'net_new_paid' : 'checkout_click',
      banditEnabled: !!row.bandit_enabled,
      minExposuresPerVariant: row.min_exposures_per_variant ?? 200,
      stages: Array.isArray(t.stages) ? t.stages : [],
      personas: Array.isArray(t.personas) ? t.personas : [],
      utmSources: Array.isArray(t.utmSources) ? t.utmSources.join(', ') : '',
      variants: Array.isArray(row.variants) ? row.variants.map((v: Variant) => ({ ...v, overrides: { ...(v.overrides || {}) } })) : [],
    })
  }

  async function save() {
    if (!editing) return
    setBusy('save')
    try {
      const payload = {
        key: editing.key,
        name: editing.name,
        hypothesis: editing.hypothesis,
        primaryMetric: editing.primaryMetric,
        banditEnabled: editing.banditEnabled,
        minExposuresPerVariant: editing.minExposuresPerVariant,
        targeting: {
          stages: editing.stages,
          personas: editing.personas,
          utmSources: editing.utmSources.split(',').map(s => s.trim()).filter(Boolean),
        },
        variants: editing.variants,
      }
      const res = await fetch('/api/admin/experiments', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      flash('ok', isNew ? 'Experiment created as draft' : 'Saved')
      setEditing(null)
      router.refresh()
    } catch (e) {
      flash('err', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  // ── Variant editor helpers ──
  const setVariant = (i: number, patch: Partial<Variant>) => {
    if (!editing) return
    const variants = [...editing.variants]
    variants[i] = { ...variants[i], ...patch }
    setEditing({ ...editing, variants })
  }
  const setOverride = (i: number, slot: string, value: string) => {
    if (!editing) return
    const variants = [...editing.variants]
    const ov = { ...variants[i].overrides }
    if (value === '__remove__') delete ov[slot]
    else ov[slot] = value
    variants[i] = { ...variants[i], overrides: ov }
    setEditing({ ...editing, variants })
  }

  return (
    <div>
      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${msg.kind === 'ok' ? 'bg-[#E8F5E9] text-[#2E7D32]' : 'bg-[#FDECEA] text-[#B3261E]'}`}>
          {msg.text}
        </div>
      )}

      <div className="mb-6">
        <button
          onClick={() => { setIsNew(true); setEditing({ ...EMPTY_FORM, variants: EMPTY_FORM.variants.map(v => ({ ...v, overrides: {} })) }) }}
          className="rounded-lg bg-[#333333] px-5 py-2 text-sm font-bold text-[#FFFDFA] hover:opacity-90"
        >
          + New experiment
        </button>
      </div>

      {/* ── Editor ── */}
      {editing && (
        <section className="mb-8 rounded-xl border-2 border-[#333333] bg-white p-6">
          <h2 className="text-lg font-black text-[#333333] mb-4">{isNew ? 'New experiment' : `Edit: ${editing.key}`}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <label className="text-sm">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#9C9C9C] mb-1">Key (immutable)</span>
              <input value={editing.key} disabled={!isNew} onChange={e => setEditing({ ...editing, key: e.target.value })}
                placeholder="hero_cta_v1" className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 disabled:bg-[#F5F5F5]" />
            </label>
            <label className="text-sm">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#9C9C9C] mb-1">Name</span>
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                placeholder="Hero CTA wording" className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2" />
            </label>
          </div>
          <label className="block text-sm mb-4">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[#9C9C9C] mb-1">Hypothesis</span>
            <input value={editing.hypothesis} onChange={e => setEditing({ ...editing, hypothesis: e.target.value })}
              placeholder="A benefit-led CTA beats the generic one because…" className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2" />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <label className="text-sm">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#9C9C9C] mb-1">Primary metric</span>
              <select value={editing.primaryMetric} onChange={e => setEditing({ ...editing, primaryMetric: e.target.value as FormState['primaryMetric'] })}
                className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 bg-white">
                <option value="checkout_click">Checkout click rate (fast)</option>
                <option value="net_new_paid">Net-new paid (ground truth, slow)</option>
              </select>
            </label>
            <label className="text-sm flex items-end gap-2 pb-2">
              <input type="checkbox" checked={editing.banditEnabled} onChange={e => setEditing({ ...editing, banditEnabled: e.target.checked })} />
              <span>Bandit auto-allocation</span>
            </label>
            <label className="text-sm">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#9C9C9C] mb-1">Min exposures / variant</span>
              <input type="number" value={editing.minExposuresPerVariant}
                onChange={e => setEditing({ ...editing, minExposuresPerVariant: parseInt(e.target.value || '200', 10) })}
                className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2" />
            </label>
          </div>

          {/* Targeting */}
          <div className="mb-5 rounded-lg bg-[#FAF7F1] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#9C9C9C] mb-2">Targeting (empty = everyone)</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {STAGES.filter(s => s.key !== 'unknown').map(s => (
                <button key={s.key} type="button"
                  onClick={() => setEditing({ ...editing, stages: editing.stages.includes(s.key) ? editing.stages.filter(x => x !== s.key) : [...editing.stages, s.key] })}
                  className={`rounded-full px-3 py-1 text-[12px] font-bold border ${editing.stages.includes(s.key) ? 'bg-[#333333] text-white border-[#333333]' : 'bg-white text-[#9C9C9C] border-[#E8E4DF]'}`}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {PERSONAS.filter(p => p.key !== 'unknown').map(p => (
                <button key={p.key} type="button"
                  onClick={() => setEditing({ ...editing, personas: editing.personas.includes(p.key) ? editing.personas.filter(x => x !== p.key) : [...editing.personas, p.key] })}
                  className={`rounded-full px-3 py-1 text-[12px] font-bold border ${editing.personas.includes(p.key) ? 'bg-[#046BB1] text-white border-[#046BB1]' : 'bg-white text-[#9C9C9C] border-[#E8E4DF]'}`}>
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
            <input value={editing.utmSources} onChange={e => setEditing({ ...editing, utmSources: e.target.value })}
              placeholder="utm sources, comma-separated (e.g. linkedin, homepage_slider)" className="w-full rounded-lg border border-[#E8E4DF] px-3 py-2 text-sm" />
          </div>

          {/* Variants */}
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#9C9C9C] mb-2">Variants</p>
          {editing.variants.map((v, i) => (
            <div key={i} className="mb-3 rounded-lg border border-[#E8E4DF] p-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <input value={v.key} disabled={v.key === 'control' && !isNew}
                  onChange={e => setVariant(i, { key: e.target.value })}
                  placeholder="variant key" className="w-32 rounded-lg border border-[#E8E4DF] px-2 py-1.5 text-sm font-mono disabled:bg-[#F5F5F5]" />
                <input value={v.name || ''} onChange={e => setVariant(i, { name: e.target.value })}
                  placeholder="label" className="w-44 rounded-lg border border-[#E8E4DF] px-2 py-1.5 text-sm" />
                <label className="text-sm flex items-center gap-1.5">
                  weight
                  <input type="number" step="0.05" min="0" max="1" value={v.weight}
                    onChange={e => setVariant(i, { weight: parseFloat(e.target.value || '0') })}
                    className="w-20 rounded-lg border border-[#E8E4DF] px-2 py-1.5 text-sm" />
                </label>
                <label className="text-sm flex items-center gap-1.5">
                  <input type="checkbox" checked={v.approved !== false} onChange={e => setVariant(i, { approved: e.target.checked })} />
                  approved
                </label>
                {v.key !== 'control' && (
                  <button type="button" onClick={() => setEditing({ ...editing, variants: editing.variants.filter((_, j) => j !== i) })}
                    className="ml-auto text-[12px] text-[#B3261E] underline">remove</button>
                )}
              </div>
              {v.key !== 'control' && (
                <>
                  {Object.entries(v.overrides).map(([slot, value]) => (
                    <div key={slot} className="flex items-start gap-2 mb-2">
                      <span className="mt-2 w-44 shrink-0 font-mono text-[11px] text-[#333333]">{slot}</span>
                      <textarea value={value} onChange={e => setOverride(i, slot, e.target.value)} rows={2}
                        className="flex-1 rounded-lg border border-[#E8E4DF] px-2 py-1.5 text-sm" />
                      <button type="button" onClick={() => setOverride(i, slot, '__remove__')} className="mt-2 text-[12px] text-[#B3261E] underline">×</button>
                    </div>
                  ))}
                  <select
                    value=""
                    onChange={e => { if (e.target.value) setOverride(i, e.target.value, EXPERIMENT_SLOTS[e.target.value]?.hint || '') }}
                    className="rounded-lg border border-[#E8E4DF] px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="">+ add override slot…</option>
                    {Object.entries(EXPERIMENT_SLOTS).filter(([k]) => !(k in v.overrides)).map(([k, s]) => (
                      <option key={k} value={k}>{s.label}</option>
                    ))}
                  </select>
                </>
              )}
              {v.key === 'control' && <p className="text-[12px] text-[#9C9C9C]">Control renders the live page unchanged.</p>}
            </div>
          ))}
          <button type="button"
            onClick={() => setEditing({ ...editing, variants: [...editing.variants, { key: `v${editing.variants.length}`, name: '', weight: 0, approved: false, overrides: {} }] })}
            className="mb-4 text-sm font-bold text-[#046BB1] underline">+ add variant</button>

          <div className="flex gap-3">
            <button onClick={save} disabled={busy === 'save'}
              className="rounded-lg bg-[#333333] px-6 py-2.5 text-sm font-bold text-[#FFFDFA] disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : isNew ? 'Create draft' : 'Save changes'}
            </button>
            <button onClick={() => setEditing(null)} className="rounded-lg border border-[#E8E4DF] px-5 py-2.5 text-sm font-bold text-[#9C9C9C]">Cancel</button>
          </div>
          <p className="mt-3 text-[11px] text-[#9C9C9C]">
            Copy may use {'{firstName}'} and {'{persona}'} tokens; the hero headline also supports {'{aheadPct}'}. New variants start unapproved with weight 0 — approve to give them traffic.
          </p>
        </section>
      )}

      {/* ── List ── */}
      {initialExperiments.length === 0 && !editing && (
        <p className="text-sm text-[#9C9C9C]">No experiments yet. Start with an A/A test (two variants, zero overrides) to validate the plumbing.</p>
      )}
      {initialExperiments.map(row => {
        const st = STATUS_STYLE[row.status] || STATUS_STYLE.draft
        const res = initialResults[row.key]
        return (
          <section key={row.key} className="mb-5 rounded-xl border border-[#E8E4DF] bg-white p-6">
            <div className="flex flex-wrap items-center gap-3 mb-1.5">
              <h3 className="text-base font-black text-[#333333]">{row.name}</h3>
              <span className="rounded-full px-3 py-0.5 text-[11px] font-bold" style={{ backgroundColor: st.bg, color: st.fg }}>{row.status}</span>
              <span className="font-mono text-[11px] text-[#9C9C9C]">{row.key}</span>
              <span className="text-[11px] text-[#9C9C9C]">metric: {row.primary_metric}</span>
              {row.bandit_enabled && <span className="text-[11px] font-bold text-[#046BB1]">bandit on</span>}
              <div className="ml-auto flex gap-2">
                {(row.status === 'draft' || row.status === 'paused') && (
                  <button onClick={() => act(row.key, 'start')} disabled={!!busy} className="rounded-lg bg-[#2E7D32] px-3.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">Start</button>
                )}
                {row.status === 'running' && (
                  <>
                    <button onClick={() => act(row.key, 'run_bandit')} disabled={!!busy} className="rounded-lg border border-[#046BB1] px-3.5 py-1.5 text-[12px] font-bold text-[#046BB1] disabled:opacity-50">Run bandit now</button>
                    <button onClick={() => act(row.key, 'pause')} disabled={!!busy} className="rounded-lg border border-[#E65100] px-3.5 py-1.5 text-[12px] font-bold text-[#E65100] disabled:opacity-50">Pause</button>
                    <button onClick={() => act(row.key, 'end')} disabled={!!busy} className="rounded-lg border border-[#546E7A] px-3.5 py-1.5 text-[12px] font-bold text-[#546E7A] disabled:opacity-50">End</button>
                    <button onClick={() => act(row.key, 'kill')} disabled={!!busy} className="rounded-lg bg-[#B3261E] px-3.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">Kill</button>
                  </>
                )}
                {(row.status === 'draft' || row.status === 'paused') && (
                  <button onClick={() => editExisting(row)} disabled={!!busy} className="rounded-lg border border-[#E8E4DF] px-3.5 py-1.5 text-[12px] font-bold text-[#333333] disabled:opacity-50">Edit</button>
                )}
              </div>
            </div>
            {row.hypothesis && <p className="text-[13px] text-[#555] mb-3">Hypothesis: {row.hypothesis}</p>}

            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[#E8E4DF] text-[10px] uppercase tracking-wider text-[#9C9C9C]">
                  <th className="text-left py-1.5">Variant</th>
                  <th className="text-right py-1.5">Weight</th>
                  <th className="text-right py-1.5">Exposures</th>
                  <th className="text-right py-1.5">Click rate</th>
                  <th className="text-right py-1.5">Net-new paid</th>
                  <th className="text-right py-1.5">P(best)</th>
                  <th className="text-left py-1.5 pl-4">What&rsquo;s different</th>
                </tr>
              </thead>
              <tbody>
                {(row.variants as Variant[]).map(v => {
                  const r = res?.find(x => x.key === v.key)
                  return (
                    <tr key={v.key} className="border-b border-[#F5F5F5]">
                      <td className="py-1.5">
                        <span className="font-semibold text-[#333333]">{v.name || v.key}</span>
                        <span className="ml-2 font-mono text-[10.5px] text-[#9C9C9C]">{v.key}</span>
                        {v.approved === false && <span className="ml-2 text-[10px] font-bold text-[#E65100]">UNAPPROVED <button onClick={() => act(row.key, 'approve_variant', v.key)} className="underline">approve</button></span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{Math.round(v.weight * 100)}%</td>
                      <td className="py-1.5 text-right tabular-nums">{r?.exposures ?? '—'}</td>
                      <td className="py-1.5 text-right tabular-nums">{r ? `${(r.clickRate * 100).toFixed(1)}%` : '—'}</td>
                      <td className="py-1.5 text-right tabular-nums">{r?.netNewPaid ?? '—'}</td>
                      <td className="py-1.5 text-right tabular-nums font-bold" style={{ color: r && r.probBest >= 0.95 ? '#2E7D32' : '#333333' }}>
                        {r ? `${(r.probBest * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="py-1.5 pl-4 text-[11px] text-[#9C9C9C]">
                        {v.key === 'control'
                          ? 'the page as-is'
                          : Object.keys(v.overrides || {}).length > 0
                            ? Object.keys(v.overrides).join(', ')
                            : (v.name || 'structural variant') + ' (in code)'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {res && <p className="mt-2 text-[11px] text-[#9C9C9C]">Decision rule: call the winner at P(best) ≥ 95%. Weights only shift after every approved variant reaches {row.min_exposures_per_variant} exposures; control never drops below 10%.</p>}
          </section>
        )
      })}
    </div>
  )
}
