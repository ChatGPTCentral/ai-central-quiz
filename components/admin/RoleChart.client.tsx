'use client'

import { useState, useMemo } from 'react'
import HorizontalBarChart from './HorizontalBarChart'
import { PALETTE } from '@/lib/palette'

interface Person {
  jobTitle?: string
  jobTitleStandardized?: string
  jobLevel?: string
  seniority?: string
}

interface Props {
  rows: Person[]
}

type Group = 'title' | 'seniority'

const SENIORITY_ORDER = [
  'Founder', 'C-Suite', 'VP/Director', 'Manager', 'Individual contributor', 'Student or intern', 'Other',
]

export default function RoleChart({ rows }: Props) {
  const [group, setGroup] = useState<Group>('title')

  const { data, subtitle } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) {
      let key: string | undefined
      if (group === 'seniority') {
        key = r.seniority?.trim()
      } else {
        key = (r.jobTitleStandardized || r.jobTitle || r.jobLevel || '').trim()
      }
      if (!key) continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const data = Array.from(counts.entries()).map(([label, value]) => ({ label, value }))
    return { data, subtitle: `N = ${data.reduce((a, b) => a + b.value, 0).toLocaleString()}` }
  }, [rows, group])

  const toggle = (
    <div className="flex bg-[#F5F5F5] rounded-md p-0.5">
      {(['title', 'seniority'] as const).map(g => (
        <button
          key={g}
          onClick={() => setGroup(g)}
          className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${
            group === g ? 'bg-white text-[#333333] shadow-sm' : 'text-[#9C9C9C] hover:text-[#333333]'
          }`}
        >
          {g === 'title' ? 'Title' : 'Seniority'}
        </button>
      ))}
    </div>
  )

  return (
    <HorizontalBarChart
      title="Role"
      subtitle={subtitle}
      data={data}
      maxRows={group === 'seniority' ? 7 : 8}
      uniformColor={PALETTE.azul}
      expandable={group === 'title'}
      orderedLabels={group === 'seniority' ? SENIORITY_ORDER : undefined}
      rightAction={toggle}
    />
  )
}
