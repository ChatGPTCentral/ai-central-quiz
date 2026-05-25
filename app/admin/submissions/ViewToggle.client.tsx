'use client'

import { useEffect, useState } from 'react'
import type { StoredSubmission } from '@/lib/kv'
import PeopleTable from '../dashboard/PeopleTable.client'
import MasonryView from './MasonryView.client'

const STORAGE_KEY = 'admin_submissions_view'

export default function ViewToggle({ items }: { items: StoredSubmission[] }) {
  const [view, setView] = useState<'table' | 'cards'>('table')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'table' || saved === 'cards') setView(saved)
    } catch { /* noop */ }
  }, [])

  const setAndPersist = (v: 'table' | 'cards') => {
    setView(v)
    try { localStorage.setItem(STORAGE_KEY, v) } catch { /* noop */ }
  }

  return (
    <>
      {/* Toggle bar */}
      <div className="flex items-center justify-end mb-3">
        <div className="inline-flex rounded-md border border-[#E8E4DF] bg-white p-0.5">
          <button
            onClick={() => setAndPersist('table')}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded transition-colors ${
              view === 'table' ? 'bg-[#333333] text-[#FFFDFA]' : 'text-[#9C9C9C] hover:text-[#333333]'
            }`}
          >
            ☰ Table
          </button>
          <button
            onClick={() => setAndPersist('cards')}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded transition-colors ${
              view === 'cards' ? 'bg-[#333333] text-[#FFFDFA]' : 'text-[#9C9C9C] hover:text-[#333333]'
            }`}
          >
            ◫ Cards
          </button>
        </div>
      </div>

      {view === 'table' ? (
        <div className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
          <PeopleTable items={items} />
        </div>
      ) : (
        <MasonryView items={items} />
      )}
    </>
  )
}
