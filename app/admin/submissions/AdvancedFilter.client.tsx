'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FILTERABLE_FIELDS, type FilterRule, type FilterGroup, type Op } from '@/lib/advanced-filter'

// Curated list of fields shown in the dropdown — order matters for UX.
const FIELD_ORDER: string[] = [
  'name', 'email', 'jobTitle', 'jobTitleStandardized', 'seniority', 'jobFunction', 'department',
  'companyName', 'companySize', 'companyIndustry', 'companyDomain',
  'country', 'region', 'city',
  'archetype', 'score', 'ageBracket', 'ageAiEstimate', 'sexAiEstimate',
  'aiLevel', 'workArea', 'mainGoal', 'aiTools', 'jobLevel',
  'source', 'utmSource',
  'subscriptionTier', 'beehiivStatus', 'lifetimeValueUsd', 'stripeCustomerId',
  'enrichmentStatus', 'enrichedAt', 'linkedinUrl', 'photoUrl',
]

const OPS_FOR_TYPE: Record<string, Op[]> = {
  text:      ['contains', 'eq', 'neq', 'starts_with', 'ends_with', 'not_contains', 'empty', 'not_empty', 'in', 'not_in'],
  number:    ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'empty', 'not_empty'],
  enum:      ['eq', 'neq', 'in', 'not_in', 'empty', 'not_empty'],
  boolean:   ['eq', 'neq'],
  timestamp: ['gt', 'gte', 'lt', 'lte', 'between', 'empty', 'not_empty'],
}
const OP_LABEL: Record<Op, string> = {
  eq: 'is', neq: 'is not',
  contains: 'contains', not_contains: "doesn't contain", starts_with: 'starts with', ends_with: 'ends with',
  empty: 'is empty', not_empty: 'is not empty',
  gt: '>', gte: '>=', lt: '<', lte: '<=', between: 'between',
  in: 'is any of', not_in: 'is none of',
}

const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  FIELD_ORDER.map(f => [f, f.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace(/\bAi\b/, 'AI').replace(/\bUtm\b/, 'UTM').replace(/\bId\b/, 'ID').replace(/\bUsd\b/, 'USD').replace(/\bUrl\b/, 'URL')])
)

// ── Suggested filters ────────────────────────────────────────────
// Pre-canned filter specs that surface in the "Suggested" tab.
// Order = priority. Add new ones over time.
const SUGGESTED: { name: string; emoji: string; description: string; spec: FilterGroup }[] = [
  {
    name: 'High-value customers', emoji: '💎',
    description: 'Lifetime $ paid ≥ $100',
    spec: { combinator: 'and', rules: [{ field: 'lifetimeValueUsd', op: 'gte', value: 100 }] },
  },
  {
    name: 'Active paying subscribers', emoji: '🔥',
    description: 'Beehiiv active + LTV > 0',
    spec: { combinator: 'and', rules: [
      { field: 'beehiivStatus', op: 'eq', value: 'active' },
      { field: 'lifetimeValueUsd', op: 'gt', value: 0 },
    ] },
  },
  {
    name: 'Stripe-only (no quiz)', emoji: '💳',
    description: 'Customers who paid but never took the quiz',
    spec: { combinator: 'and', rules: [{ field: 'source', op: 'eq', value: 'stripe' }] },
  },
  {
    name: 'Founders + C-Suite', emoji: '👑',
    description: 'Decision-makers',
    spec: { combinator: 'and', rules: [{ field: 'seniority', op: 'in', value: ['Founder', 'C-Suite'] }] },
  },
  {
    name: 'Churned (unsubscribed)', emoji: '👋',
    description: 'Beehiiv unsubscribed',
    spec: { combinator: 'and', rules: [{ field: 'beehiivStatus', op: 'eq', value: 'unsubscribed' }] },
  },
  {
    name: 'Missing LinkedIn', emoji: '🔗',
    description: 'No LinkedIn URL yet',
    spec: { combinator: 'and', rules: [{ field: 'linkedinUrl', op: 'empty' }] },
  },
  {
    name: 'United States cohort', emoji: '🇺🇸',
    description: 'Country is US',
    spec: { combinator: 'and', rules: [{ field: 'country', op: 'eq', value: 'United States' }] },
  },
]

// ── localStorage keys ────────────────────────────────────────────
const SAVED_KEY = 'admin_saved_filters_v1'
const RECENT_KEY = 'admin_recent_filters_v1'
const RECENT_LIMIT = 10

interface SavedFilter { name: string; spec: FilterGroup }
interface RecentFilter { spec: FilterGroup; at: number }

function loadSaved(): SavedFilter[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') } catch { return [] }
}
function loadRecent(): RecentFilter[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function persistSaved(s: SavedFilter[]) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(s)) } catch { /* noop */ } }
function persistRecent(r: RecentFilter[]) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)) } catch { /* noop */ } }

// ── Component ────────────────────────────────────────────────────

export default function AdvancedFilter() {
  const router = useRouter()
  const sp = useSearchParams()
  const [group, setGroup] = useState<FilterGroup>(() => decodeFromSearch(sp.get('spec')))
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'builder' | 'saved' | 'suggested' | 'recent'>('builder')
  const [saved, setSaved] = useState<SavedFilter[]>([])
  const [recent, setRecent] = useState<RecentFilter[]>([])

  useEffect(() => { setSaved(loadSaved()); setRecent(loadRecent()) }, [])
  useEffect(() => { setGroup(decodeFromSearch(sp.get('spec'))) }, [sp])

  function applySpec(spec: FilterGroup) {
    const u = new URLSearchParams(sp.toString())
    if (spec.rules.length === 0) u.delete('spec')
    else u.set('spec', encodeURIComponent(JSON.stringify(spec)))
    u.delete('offset')
    router.push(`?${u.toString()}`)
    setOpen(false)

    // Track in recents (skip empty)
    if (spec.rules.length > 0) {
      const next = [{ spec, at: Date.now() }, ...recent.filter(r => JSON.stringify(r.spec) !== JSON.stringify(spec))].slice(0, RECENT_LIMIT)
      setRecent(next); persistRecent(next)
    }
  }

  function clearAll() {
    setGroup({ combinator: 'and', rules: [] })
    const u = new URLSearchParams(sp.toString())
    u.delete('spec'); u.delete('offset')
    router.push(`?${u.toString()}`)
    setOpen(false)
  }

  function saveCurrent() {
    if (group.rules.length === 0) return
    const name = prompt('Name this filter:')?.trim()
    if (!name) return
    const next = [{ name, spec: group }, ...saved.filter(s => s.name !== name)]
    setSaved(next); persistSaved(next)
  }
  function deleteSaved(name: string) {
    const next = saved.filter(s => s.name !== name)
    setSaved(next); persistSaved(next)
  }

  const summary = useMemo(() => describeGroup(group), [group])
  const hasFilters = group.rules.length > 0

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOpen(o => !o)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider border transition-colors ${
            hasFilters ? 'bg-[#046BB1] text-white border-[#046BB1]' : 'bg-white text-[#333333] border-[#E8E4DF] hover:bg-[#FEF7E7]'
          }`}
        >
          ⚙ Filters
          {hasFilters && <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[#046BB1] text-[10px] font-black">{countRules(group)}</span>}
        </button>
        {hasFilters && (
          <>
            <span className="text-[11px] text-[#9C9C9C] truncate max-w-2xl" title={summary}>{summary}</span>
            <button onClick={saveCurrent} className="text-[10px] font-bold uppercase tracking-wider text-[#046BB1] hover:underline">Save</button>
            <button onClick={clearAll} className="text-[10px] font-bold uppercase tracking-wider text-[#BE3B3B] hover:underline">Clear</button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-3 bg-white border border-[#E8E4DF] rounded-xl shadow-lg overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-[#E8E4DF] bg-[#FFFDFA]">
            {([
              { k: 'builder',   label: '⚙ Builder' },
              { k: 'saved',     label: `★ Saved${saved.length ? ` (${saved.length})` : ''}` },
              { k: 'suggested', label: '✨ Suggested' },
              { k: 'recent',    label: `↻ Recent${recent.length ? ` (${recent.length})` : ''}` },
            ] as const).map(t => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  tab === t.k ? 'bg-white text-[#333333] border-b-2 border-[#046BB1]' : 'text-[#9C9C9C] hover:text-[#333333]'
                }`}
              >
                {t.label}
              </button>
            ))}
            <button onClick={() => setOpen(false)} className="ml-auto px-4 text-[#9C9C9C] hover:text-[#333333]">×</button>
          </div>

          {/* Tab content */}
          <div className="p-4">
            {tab === 'builder' && (
              <>
                <FilterGroupEditor group={group} onChange={setGroup} root />
                <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-[#E8E4DF]">
                  {hasFilters && (
                    <button onClick={saveCurrent} className="text-[11px] font-bold uppercase tracking-wider text-[#046BB1] hover:underline px-2">★ Save filter</button>
                  )}
                  <button onClick={() => setOpen(false)} className="text-[11px] font-medium text-[#9C9C9C] px-3 py-1.5 hover:text-[#333333]">Close</button>
                  <button onClick={() => applySpec(group)} className="px-4 py-1.5 rounded-md bg-[#333333] text-[#FFFDFA] text-[11px] font-bold uppercase tracking-wider hover:opacity-90">Apply filter</button>
                </div>
              </>
            )}
            {tab === 'saved' && (
              <SavedList items={saved} onApply={s => applySpec(s.spec)} onDelete={s => deleteSaved(s.name)} />
            )}
            {tab === 'suggested' && (
              <SuggestedList items={SUGGESTED} onApply={s => applySpec(s.spec)} />
            )}
            {tab === 'recent' && (
              <RecentList items={recent} onApply={s => applySpec(s.spec)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────

function SavedList({ items, onApply, onDelete }: { items: SavedFilter[]; onApply: (s: SavedFilter) => void; onDelete: (s: SavedFilter) => void }) {
  if (items.length === 0) {
    return <p className="text-[12px] text-[#9C9C9C] py-6 text-center">No saved filters yet. Build a filter in the Builder tab and click ★ Save.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map(s => (
        <div key={s.name} className="flex items-center gap-3 p-2 rounded border border-[#E8E4DF] hover:bg-[#FFFDFA]">
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-bold text-[#333333]">{s.name}</div>
            <div className="text-[10px] text-[#9C9C9C] truncate">{describeGroup(s.spec)}</div>
          </div>
          <button onClick={() => onApply(s)} className="text-[10px] font-bold uppercase tracking-wider text-[#046BB1] hover:underline">Apply</button>
          <button onClick={() => onDelete(s)} className="text-[10px] text-[#BE3B3B] hover:underline">Delete</button>
        </div>
      ))}
    </div>
  )
}

function SuggestedList({ items, onApply }: { items: { name: string; emoji: string; description: string; spec: FilterGroup }[]; onApply: (s: { spec: FilterGroup }) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {items.map(s => (
        <button
          key={s.name}
          onClick={() => onApply(s)}
          className="text-left p-3 rounded border border-[#E8E4DF] hover:border-[#046BB1] hover:bg-[#FEF7E7] transition-colors"
        >
          <div className="text-[12px] font-bold text-[#333333]">{s.emoji} {s.name}</div>
          <div className="text-[10px] text-[#9C9C9C] mt-0.5">{s.description}</div>
        </button>
      ))}
    </div>
  )
}

function RecentList({ items, onApply }: { items: RecentFilter[]; onApply: (s: { spec: FilterGroup }) => void }) {
  if (items.length === 0) {
    return <p className="text-[12px] text-[#9C9C9C] py-6 text-center">No recent filters yet. Apply a filter and it'll show up here.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((r, i) => (
        <button
          key={i}
          onClick={() => onApply(r)}
          className="text-left flex items-center gap-3 p-2 rounded border border-[#E8E4DF] hover:bg-[#FEF7E7]"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-[#333333] truncate">{describeGroup(r.spec)}</div>
            <div className="text-[10px] text-[#9C9C9C]">{new Date(r.at).toLocaleString()}</div>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#046BB1]">Apply</span>
        </button>
      ))}
    </div>
  )
}

// ── Rule + Group editors ─────────────────────────────────────────

function FilterGroupEditor({ group, onChange, root }: { group: FilterGroup; onChange: (g: FilterGroup) => void; root?: boolean }) {
  function addRule() {
    onChange({ ...group, rules: [...group.rules, defaultRule()] })
  }
  function addGroup() {
    onChange({ ...group, rules: [...group.rules, { combinator: 'and', rules: [defaultRule()] }] })
  }
  function updateRule(i: number, r: FilterRule | FilterGroup) {
    const rules = [...group.rules]; rules[i] = r
    onChange({ ...group, rules })
  }
  function removeRule(i: number) {
    const rules = group.rules.filter((_, j) => j !== i)
    onChange({ ...group, rules })
  }

  return (
    <div className={`rounded-lg ${root ? '' : 'border border-[#E8E4DF] bg-[#FFFDFA] p-2'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#9C9C9C]">Combinator</span>
        <div className="flex bg-[#F5F5F5] rounded-md p-0.5">
          {(['and', 'or'] as const).map(c => (
            <button key={c} onClick={() => onChange({ ...group, combinator: c })}
              className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${
                group.combinator === c ? 'bg-white text-[#333333] shadow-sm' : 'text-[#9C9C9C]'
              }`}>{c}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {group.rules.map((r, i) => 'combinator' in r ? (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1"><FilterGroupEditor group={r} onChange={(g) => updateRule(i, g)} /></div>
            <button onClick={() => removeRule(i)} className="text-[#BE3B3B] hover:bg-[#FEE3E3] rounded h-6 w-6 text-base leading-none shrink-0" title="Remove group">×</button>
          </div>
        ) : (
          <RuleEditor key={i} rule={r} onChange={(nr) => updateRule(i, nr)} onRemove={() => removeRule(i)} />
        ))}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button onClick={addRule} className="text-[10px] font-bold uppercase tracking-wider text-[#046BB1] hover:underline">+ Add rule</button>
        <button onClick={addGroup} className="text-[10px] font-bold uppercase tracking-wider text-[#9C9C9C] hover:text-[#333333]">+ Add nested group</button>
      </div>
    </div>
  )
}

function RuleEditor({ rule, onChange, onRemove }: { rule: FilterRule; onChange: (r: FilterRule) => void; onRemove: () => void }) {
  const meta = FILTERABLE_FIELDS[rule.field]
  const ops: Op[] = meta ? OPS_FOR_TYPE[meta.type] || OPS_FOR_TYPE.text : OPS_FOR_TYPE.text
  const needsValue = rule.op !== 'empty' && rule.op !== 'not_empty'
  const isEnum = meta?.type === 'enum'
  const isMulti = rule.op === 'in' || rule.op === 'not_in'
  const isBetween = rule.op === 'between'
  const isNumeric = meta?.type === 'number'

  function changeField(nextField: string) {
    const nextMeta = FILTERABLE_FIELDS[nextField]
    const nextOps = nextMeta ? OPS_FOR_TYPE[nextMeta.type] || OPS_FOR_TYPE.text : OPS_FOR_TYPE.text
    const opStillValid = nextOps.includes(rule.op)
    onChange({
      field: nextField,
      op: opStillValid ? rule.op : nextOps[0],
      value: opStillValid ? rule.value : undefined,
    })
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select value={rule.field} onChange={e => changeField(e.target.value)}
        className="text-[11px] border border-[#E8E4DF] rounded px-2 py-1 outline-none focus:border-[#046BB1] bg-white min-w-[140px]">
        {FIELD_ORDER.map(f => <option key={f} value={f}>{FIELD_LABEL[f] || f}</option>)}
      </select>
      <select value={rule.op} onChange={e => onChange({ ...rule, op: e.target.value as Op, value: undefined })}
        className="text-[11px] border border-[#E8E4DF] rounded px-2 py-1 outline-none focus:border-[#046BB1] bg-white">
        {ops.map(o => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
      </select>
      {needsValue && !isBetween && (
        isEnum && !isMulti ? (
          <select value={(rule.value as string) || ''} onChange={e => onChange({ ...rule, value: e.target.value })}
            className="text-[11px] border border-[#E8E4DF] rounded px-2 py-1 outline-none focus:border-[#046BB1] bg-white">
            <option value="">—</option>
            {meta?.enum?.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        ) : (
          <input
            type={isNumeric && !isMulti ? 'number' : 'text'}
            step={isNumeric ? '0.01' : undefined}
            inputMode={isNumeric ? 'decimal' : undefined}
            value={Array.isArray(rule.value) ? (rule.value as string[]).join(', ') : String(rule.value ?? '')}
            onChange={e => {
              const raw = e.target.value
              const v = isMulti
                ? raw.split(',').map(s => s.trim()).filter(Boolean).map(s => isNumeric ? Number(s) : s)
                : (isNumeric && raw !== '' ? Number(raw) : raw)
              onChange({ ...rule, value: v as FilterRule['value'] })
            }}
            placeholder={isMulti ? 'comma-separated' : isNumeric ? '0.00' : 'value'}
            className="text-[11px] border border-[#E8E4DF] rounded px-2 py-1 outline-none focus:border-[#046BB1] w-40"
          />
        )
      )}
      {needsValue && isBetween && (() => {
        const v = Array.isArray(rule.value) ? rule.value as [string | number, string | number] : ['', '']
        const parse = (s: string) => (isNumeric && s !== '' ? Number(s) : s)
        return (
          <>
            <input
              type={isNumeric ? 'number' : 'text'} step={isNumeric ? '0.01' : undefined}
              value={String(v[0] ?? '')}
              onChange={e => onChange({ ...rule, value: [parse(e.target.value), v[1]] as FilterRule['value'] })}
              placeholder="min"
              className="text-[11px] border border-[#E8E4DF] rounded px-2 py-1 outline-none focus:border-[#046BB1] w-24"
            />
            <span className="text-[10px] text-[#9C9C9C]">and</span>
            <input
              type={isNumeric ? 'number' : 'text'} step={isNumeric ? '0.01' : undefined}
              value={String(v[1] ?? '')}
              onChange={e => onChange({ ...rule, value: [v[0], parse(e.target.value)] as FilterRule['value'] })}
              placeholder="max"
              className="text-[11px] border border-[#E8E4DF] rounded px-2 py-1 outline-none focus:border-[#046BB1] w-24"
            />
          </>
        )
      })()}
      <button onClick={onRemove} className="text-[#BE3B3B] hover:bg-[#FEE3E3] rounded h-6 w-6 text-base leading-none shrink-0" title="Remove rule">×</button>
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────

function defaultRule(): FilterRule {
  return { field: 'name', op: 'contains', value: '' }
}

function decodeFromSearch(s: string | null): FilterGroup {
  if (!s) return { combinator: 'and', rules: [] }
  try {
    const obj = JSON.parse(decodeURIComponent(s))
    if (obj && Array.isArray(obj.rules)) return obj
  } catch { /* noop */ }
  return { combinator: 'and', rules: [] }
}

function describeGroup(g: FilterGroup): string {
  const parts: string[] = []
  for (const r of g.rules) {
    if ('combinator' in r) parts.push(`(${describeGroup(r)})`)
    else {
      const fl = FIELD_LABEL[r.field] || r.field
      const val = r.op === 'empty' || r.op === 'not_empty' ? '' : ` ${Array.isArray(r.value) ? r.value.join(',') : r.value ?? ''}`
      parts.push(`${fl} ${OP_LABEL[r.op]}${val}`)
    }
  }
  return parts.join(` ${g.combinator.toUpperCase()} `)
}

function countRules(g: FilterGroup): number {
  let n = 0
  for (const r of g.rules) n += 'combinator' in r ? countRules(r) : 1
  return n
}
