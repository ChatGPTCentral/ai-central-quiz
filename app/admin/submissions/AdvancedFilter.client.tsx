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

interface Props {
  storageKey?: string
}

export default function AdvancedFilter({ storageKey = 'submissions' }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const [group, setGroup] = useState<FilterGroup>(() => decodeFromSearch(sp.get('spec')))
  const [open, setOpen] = useState(false)

  // Apply: push to URL
  function apply() {
    const u = new URLSearchParams(sp.toString())
    if (group.rules.length === 0) u.delete('spec')
    else u.set('spec', encodeURIComponent(JSON.stringify(group)))
    u.delete('offset')
    router.push(`?${u.toString()}`)
    setOpen(false)
  }
  function clearAll() {
    setGroup({ combinator: 'and', rules: [] })
    const u = new URLSearchParams(sp.toString())
    u.delete('spec'); u.delete('offset')
    router.push(`?${u.toString()}`)
    setOpen(false)
  }

  // Sync state when URL changes externally
  useEffect(() => { setGroup(decodeFromSearch(sp.get('spec'))) }, [sp])

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
          ⚙ Advanced filter
          {hasFilters && <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[#046BB1] text-[10px] font-black">{countRules(group)}</span>}
        </button>
        {hasFilters && (
          <>
            <span className="text-[11px] text-[#9C9C9C]">{summary}</span>
            <button onClick={clearAll} className="text-[10px] font-bold uppercase tracking-wider text-[#BE3B3B] hover:underline">Clear</button>
          </>
        )}
        <span className="text-[9px] text-[#9C9C9C] ml-auto">stack: {storageKey}</span>
      </div>

      {open && (
        <div className="mt-3 bg-white border border-[#E8E4DF] rounded-xl shadow-lg p-4">
          <FilterGroupEditor group={group} onChange={setGroup} root />
          <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-[#E8E4DF]">
            <button onClick={() => setOpen(false)} className="text-[11px] font-medium text-[#9C9C9C] px-3 py-1.5 hover:text-[#333333]">Close</button>
            <button onClick={apply} className="px-4 py-1.5 rounded-md bg-[#333333] text-[#FFFDFA] text-[11px] font-bold uppercase tracking-wider hover:opacity-90">Apply filter</button>
          </div>
        </div>
      )}
    </div>
  )
}

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

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select value={rule.field} onChange={e => onChange({ ...rule, field: e.target.value })}
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
            value={Array.isArray(rule.value) ? (rule.value as string[]).join(', ') : String(rule.value ?? '')}
            onChange={e => onChange({ ...rule, value: isMulti ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : e.target.value })}
            placeholder={isMulti ? 'comma-separated' : meta?.type === 'number' ? 'number' : 'value'}
            className="text-[11px] border border-[#E8E4DF] rounded px-2 py-1 outline-none focus:border-[#046BB1] w-40"
          />
        )
      )}
      {needsValue && isBetween && (() => {
        const v = Array.isArray(rule.value) ? rule.value as [string, string] : ['', '']
        return (
          <>
            <input value={v[0] ?? ''} onChange={e => onChange({ ...rule, value: [e.target.value, v[1]] })} placeholder="min" className="text-[11px] border border-[#E8E4DF] rounded px-2 py-1 outline-none focus:border-[#046BB1] w-24" />
            <span className="text-[10px] text-[#9C9C9C]">and</span>
            <input value={v[1] ?? ''} onChange={e => onChange({ ...rule, value: [v[0], e.target.value] })} placeholder="max" className="text-[11px] border border-[#E8E4DF] rounded px-2 py-1 outline-none focus:border-[#046BB1] w-24" />
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
