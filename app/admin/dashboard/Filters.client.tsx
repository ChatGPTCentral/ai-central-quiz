'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface FacetGroup {
  key: string
  label: string
  values: { value: string; count: number }[]
}

interface Preset {
  name: string
  qs: string
}

const PRESETS_STORAGE_KEY = 'admin_filter_presets_v1'

export default function Filters({
  facets,
  workAreas,
}: {
  facets: FacetGroup[]
  workAreas: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()      // route-aware: works on /admin/dashboard, /admin/submissions, /admin/lab
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
    router.push(`${pathname}?${usp.toString()}`)
  }, [params, router, pathname])

  // Debounced search — real-time-ish (200ms) so the URL doesn't update on every keystroke
  const [searchDraft, setSearchDraft] = useState(params.q || '')
  useEffect(() => { setSearchDraft(params.q || '') }, [params.q])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSearchChange = (v: string) => {
    setSearchDraft(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => apply({ q: v || undefined }), 200)
  }

  const toggle = (key: string, value: string) => {
    const current = (params[key] || '').split(',').filter(Boolean)
    const has = current.includes(value)
    const next = has ? current.filter(v => v !== value) : [...current, value]
    apply({ [key]: next.length ? next.join(',') : undefined })
  }

  const isActive = (key: string, value: string) =>
    (params[key] || '').split(',').filter(Boolean).includes(value)

  const clearAll = () => router.push(pathname)

  // ── Filter presets — saved in localStorage per current pathname ──
  const [presets, setPresets] = useState<Preset[]>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${PRESETS_STORAGE_KEY}:${pathname}`)
      if (raw) setPresets(JSON.parse(raw))
    } catch { /* noop */ }
  }, [pathname])

  const savePresets = (next: Preset[]) => {
    setPresets(next)
    try { localStorage.setItem(`${PRESETS_STORAGE_KEY}:${pathname}`, JSON.stringify(next)) } catch { /* noop */ }
  }

  const currentQs = useMemo(() => {
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) usp.set(k, v)
    return usp.toString()
  }, [params])

  const saveCurrentAsPreset = () => {
    if (!currentQs) { alert('No active filters to save.'); return }
    const name = prompt('Preset name:')?.trim()
    if (!name) return
    const next = [...presets.filter(p => p.name !== name), { name, qs: currentQs }]
    savePresets(next)
  }
  const applyPreset = (p: Preset) => router.push(`${pathname}?${p.qs}`)
  const deletePreset = (name: string) => savePresets(presets.filter(p => p.name !== name))

  // Active-filter count badge
  const activeCount = Object.keys(params).filter(k => k !== 'offset' && params[k]).length

  return (
    <div className="flex flex-col gap-5">
      {/* Saved presets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Saved filters</span>
          {activeCount > 0 && (
            <button
              onClick={saveCurrentAsPreset}
              className="text-[10px] text-[#046BB1] font-bold uppercase tracking-wider hover:underline"
            >+ Save current</button>
          )}
        </div>
        {presets.length === 0 ? (
          <p className="text-[11px] text-gray-400">No saved filters yet. Apply filters then click &quot;Save current&quot;.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {presets.map(p => (
              <div key={p.name} className="flex items-center gap-1.5 text-xs group">
                <button
                  onClick={() => applyPreset(p)}
                  className="flex-1 text-left px-2 py-1.5 rounded-md bg-white border border-[#E8E4DF] text-[#333333] hover:bg-[#FEF7E7] truncate"
                  title={p.qs}
                >{p.name}</button>
                <button
                  onClick={() => deletePreset(p.name)}
                  title="Delete preset"
                  className="text-[#9C9C9C] hover:text-[#BE3B3B] text-base leading-none px-1 opacity-0 group-hover:opacity-100"
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div>
        <label className="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-2">Search</label>
        <input
          type="text"
          value={searchDraft}
          placeholder="name, email, company…"
          onChange={e => onSearchChange(e.target.value)}
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

      {activeCount > 0 && (
        <button
          onClick={clearAll}
          className="text-xs text-gray-400 hover:text-black text-left transition-colors"
        >
          Clear all filters ({activeCount})
        </button>
      )}
    </div>
  )
}
