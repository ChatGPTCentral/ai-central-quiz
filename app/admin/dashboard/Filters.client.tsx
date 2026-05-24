'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

interface FacetGroup {
  key: string
  label: string
  values: { value: string; count: number }[]
}

export default function Filters({
  facets,
  workAreas,
}: {
  facets: FacetGroup[]
  workAreas: string[]
}) {
  const router = useRouter()
  const sp = useSearchParams()

  const params = useMemo(() => {
    const o: Record<string, string> = {}
    sp.forEach((v, k) => { o[k] = v })
    return o
  }, [sp])

  const apply = useCallback((next: Record<string, string | undefined>) => {
    const merged = { ...params, ...next }
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== '') usp.set(k, v)
    }
    router.push(`/admin/dashboard?${usp.toString()}`)
  }, [params, router])

  const toggle = (key: string, value: string) => {
    const current = (params[key] || '').split(',').filter(Boolean)
    const has = current.includes(value)
    const next = has ? current.filter(v => v !== value) : [...current, value]
    apply({ [key]: next.length ? next.join(',') : undefined })
  }

  const isActive = (key: string, value: string) =>
    (params[key] || '').split(',').filter(Boolean).includes(value)

  const clearAll = () => router.push('/admin/dashboard')

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-2">Search</label>
        <input
          type="text"
          defaultValue={params.q || ''}
          placeholder="name, email, company…"
          onKeyDown={e => {
            if (e.key === 'Enter') apply({ q: (e.target as HTMLInputElement).value || undefined })
          }}
          className="w-full px-3 py-2 border border-[#E0E0E0] rounded-lg text-sm outline-none focus:border-black"
        />
      </div>

      {/* Score range */}
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-2">Score</label>
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} max={100} defaultValue={params.scoreMin || ''}
            placeholder="Min"
            onBlur={e => apply({ scoreMin: e.target.value || undefined })}
            className="w-20 px-2 py-1.5 border border-[#E0E0E0] rounded-md text-sm outline-none focus:border-black"
          />
          <span className="text-xs text-gray-400">–</span>
          <input
            type="number" min={0} max={100} defaultValue={params.scoreMax || ''}
            placeholder="Max"
            onBlur={e => apply({ scoreMax: e.target.value || undefined })}
            className="w-20 px-2 py-1.5 border border-[#E0E0E0] rounded-md text-sm outline-none focus:border-black"
          />
        </div>
      </div>

      {/* Boolean toggles */}
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-2">Has enrichment</label>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox" checked={params.hasLinkedin === '1'}
              onChange={e => apply({ hasLinkedin: e.target.checked ? '1' : undefined })}
              className="w-4 h-4 accent-black"
            />
            LinkedIn URL
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox" checked={params.hasPhoto === '1'}
              onChange={e => apply({ hasPhoto: e.target.checked ? '1' : undefined })}
              className="w-4 h-4 accent-black"
            />
            Photo
          </label>
        </div>
      </div>

      {/* Work area substring */}
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-2">Work area contains</label>
        <select
          defaultValue={params.workArea || ''}
          onChange={e => apply({ workArea: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-[#E0E0E0] rounded-lg text-sm outline-none focus:border-black bg-white"
        >
          <option value="">Any</option>
          {workAreas.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </div>

      {/* Facet groups */}
      {facets.map(g => (
        <div key={g.key}>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-2">{g.label}</label>
          <div className="flex flex-col gap-1 max-h-48 overflow-auto pr-1">
            {g.values.length === 0 && <span className="text-xs text-gray-300">No data</span>}
            {g.values.map(v => (
              <button
                key={v.value}
                onClick={() => toggle(g.key, v.value)}
                className={`flex items-center justify-between text-left px-2 py-1 rounded-md text-xs transition-colors ${
                  isActive(g.key, v.value) ? 'bg-black text-white' : 'hover:bg-gray-100 text-gray-800'
                }`}
              >
                <span className="truncate">{v.value}</span>
                <span className={`tabular-nums ml-2 ${isActive(g.key, v.value) ? 'text-gray-300' : 'text-gray-400'}`}>
                  {v.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={clearAll}
        className="text-xs text-gray-400 hover:text-black text-left transition-colors"
      >
        Clear all filters
      </button>
    </div>
  )
}
