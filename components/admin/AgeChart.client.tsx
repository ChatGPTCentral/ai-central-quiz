'use client'

import { useState, useMemo } from 'react'
import VerticalBarChart from './VerticalBarChart'
import { PALETTE } from '@/lib/palette'

interface Person {
  ageBracket?: string
  ageAiEstimate?: string
}

interface Props {
  rows: Person[]
}

type Group = 'brackets' | 'generations'

const BRACKET_ORDER = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+']

// 18-25 → Young · 26-35 → Mid · 36-45/46-55/56-65 → Senior · 65+ → Late
const GENERATION_ORDER = ['Young', 'Mid', 'Senior', 'Late']
const BRACKET_TO_GEN: Record<string, string> = {
  '18-25': 'Young',
  '26-35': 'Mid',
  '36-45': 'Senior',
  '46-55': 'Senior',
  '56-65': 'Senior',
  '65+':   'Late',
}

export default function AgeChart({ rows }: Props) {
  const [group, setGroup] = useState<Group>('brackets')

  const { data, subtitle } = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) {
      // Merge: self-reported wins, fall back to AI estimate, drop "uncertain"
      let bucket = r.ageBracket || r.ageAiEstimate
      if (!bucket || bucket.toLowerCase() === 'uncertain') continue
      bucket = bucket.trim()
      const key = group === 'generations' ? (BRACKET_TO_GEN[bucket] || 'Late') : bucket
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    const data = Array.from(counts.entries()).map(([label, value]) => ({ label, value }))
    return { data, subtitle: `N = ${data.reduce((a, b) => a + b.value, 0).toLocaleString()}` }
  }, [rows, group])

  const toggle = (
    <div className="flex bg-[#F5F5F5] rounded-md p-0.5">
      {(['brackets', 'generations'] as const).map(g => (
        <button
          key={g}
          onClick={() => setGroup(g)}
          className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${
            group === g ? 'bg-white text-[#333333] shadow-sm' : 'text-[#9C9C9C] hover:text-[#333333]'
          }`}
        >
          {g === 'brackets' ? 'Brackets' : 'Generations'}
        </button>
      ))}
    </div>
  )

  return (
    <VerticalBarChart
      title="Age"
      subtitle={subtitle}
      data={data}
      orderedLabels={group === 'generations' ? GENERATION_ORDER : BRACKET_ORDER}
      uniformColor={PALETTE.marianBlue}
      showCurves={group === 'brackets'}     // density curve only makes sense on the ordinal-bracket view
      rightAction={toggle}
    />
  )
}
