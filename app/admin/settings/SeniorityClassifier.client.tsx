'use client'

import { useEffect, useState, useMemo } from 'react'

interface TitleRow {
  title: string
  count: number
  seniority: string
  standardized: string | null
}

interface Override {
  id: string
  category: string
  raw_value: string
  mapped_to: string
  notes?: string | null
}

const SENIORITY_OPTIONS = [
  'Founder', 'C-Suite', 'VP/Director', 'Manager', 'Individual contributor', 'Student or intern', 'Other',
]

export default function SeniorityClassifier() {
  const [rows, setRows] = useState<TitleRow[]>([])
  const [overrides, setOverrides] = useState<Override[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function loadAll() {
    setLoading(true)
    const [titlesRes, ovRes] = await Promise.all([
      fetch('/api/admin/settings/title-summary'),
      fetch('/api/admin/settings/classifications?category=seniority'),
    ])
    const titles = await titlesRes.json()
    const ov = await ovRes.json()
    setRows(titles.items || [])
    setOverrides(ov.items || [])
    setLoading(false)
  }
  useEffect(() => { loadAll() }, [])

  // Lookup: raw_value (lowercased title) → override
  const overrideByKey = useMemo(() => {
    const m = new Map<string, Override>()
    for (const o of overrides) m.set(o.raw_value.toLowerCase(), o)
    return m
  }, [overrides])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r => r.title.toLowerCase().includes(q) || r.seniority.toLowerCase().includes(q))
  }, [rows, search])

  async function saveOverride(title: string, mapped_to: string) {
    setBusy(true); setMsg('')
    try {
      const res = await fetch('/api/admin/settings/classifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'seniority', raw_value: title, mapped_to }),
      })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || 'failed'); return }
      await loadAll()
      setMsg(`✓ saved "${title}" → ${mapped_to}`)
    } finally {
      setBusy(false)
    }
  }

  async function clearOverride(id: string) {
    setBusy(true); setMsg('')
    try {
      const res = await fetch(`/api/admin/settings/classifications/${id}`, { method: 'DELETE' })
      if (!res.ok) { setMsg('delete failed'); return }
      await loadAll()
    } finally {
      setBusy(false)
    }
  }

  async function reapply() {
    if (!confirm('Re-run classification on every row using the current overrides? This may take ~60-90 seconds.')) return
    setBusy(true); setMsg('Re-applying...')
    try {
      const res = await fetch('/api/admin/settings/classifications/reapply', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || 'failed'); return }
      setMsg(`✓ scanned ${data.scanned} · ${data.seniorityUpdated} seniority + ${data.titleUpdated} title updates`)
      await loadAll()
    } finally {
      setBusy(false)
    }
  }

  const customCount = overrides.length

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
      <header className="px-5 py-4 border-b border-[#E8E4DF] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-black text-[#333333]">Role → Seniority classification</h2>
          <p className="text-[11px] text-[#9C9C9C] mt-0.5">
            {rows.length} unique titles · {customCount} custom override{customCount === 1 ? '' : 's'} · defaults from SENIORITY_BANK
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title or seniority"
            className="px-3 py-1.5 text-[12px] border border-[#E8E4DF] rounded outline-none focus:border-[#046BB1] w-64"
          />
          <button
            onClick={reapply}
            disabled={busy}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded bg-[#333333] text-[#FFFDFA] hover:opacity-90 disabled:opacity-40"
            title="Re-classify every submission with the current rules"
          >
            ↻ Reapply to all rows
          </button>
        </div>
      </header>

      {msg && <div className="px-5 py-2 text-[11px] text-[#062B0A] bg-[#62A758]/15 border-b border-[#E8E4DF]">{msg}</div>}

      {loading ? (
        <p className="p-6 text-sm text-[#9C9C9C]">Loading...</p>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-[#FFFDFA] border-b border-[#E8E4DF]">
              <tr>
                <th className="text-left px-4 py-2 font-bold uppercase tracking-wider text-[10px] text-[#9C9C9C]">Raw job title</th>
                <th className="text-right px-4 py-2 font-bold uppercase tracking-wider text-[10px] text-[#9C9C9C]">Rows</th>
                <th className="text-left px-4 py-2 font-bold uppercase tracking-wider text-[10px] text-[#9C9C9C]">Resolves to</th>
                <th className="text-left px-4 py-2 font-bold uppercase tracking-wider text-[10px] text-[#9C9C9C]">Override</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const o = overrideByKey.get(r.title.toLowerCase())
                return (
                  <tr key={r.title} className="border-b border-[#F5F5F5] hover:bg-[#FFFDFA]">
                    <td className="px-4 py-2 font-medium text-[#333333] truncate max-w-md" title={r.title}>{r.title}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-[#9C9C9C]">{r.count}</td>
                    <td className="px-4 py-2">
                      <SeniorityChip value={r.seniority} isOverride={!!o} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={o?.mapped_to || ''}
                          disabled={busy}
                          onChange={e => {
                            const v = e.target.value
                            if (v) saveOverride(r.title, v)
                          }}
                          className="text-[11px] border border-[#E8E4DF] rounded px-2 py-1 outline-none focus:border-[#046BB1] bg-white"
                        >
                          <option value="">— Use default —</option>
                          {SENIORITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {o && (
                          <button
                            onClick={() => clearOverride(o.id)}
                            className="text-[10px] text-[#BE3B3B] hover:underline"
                            title="Remove this override"
                          >
                            clear
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-[#9C9C9C]">No matches.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SeniorityChip({ value, isOverride }: { value: string; isOverride: boolean }) {
  const colors: Record<string, string> = {
    'Founder':                'bg-[#BE3B3B]/15 text-[#8A1F1F] border-[#BE3B3B]/40',
    'C-Suite':                'bg-[#3B4C99]/15 text-[#3B4C99] border-[#3B4C99]/40',
    'VP/Director':            'bg-[#046BB1]/15 text-[#046BB1] border-[#046BB1]/40',
    'Manager':                'bg-[#E48715]/15 text-[#9A4F00] border-[#E48715]/40',
    'Individual contributor': 'bg-[#62A758]/15 text-[#2D6A26] border-[#62A758]/40',
    'Student or intern':      'bg-[#E26F8E]/15 text-[#8A1F4F] border-[#E26F8E]/40',
    'Other':                  'bg-[#F5F5F5] text-[#9C9C9C] border-[#E8E4DF]',
  }
  const cls = colors[value] || colors['Other']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
      {value}{isOverride && ' ✎'}
    </span>
  )
}
