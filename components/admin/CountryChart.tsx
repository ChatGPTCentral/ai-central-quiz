'use client'

import { useState, useMemo } from 'react'
import HorizontalBarChart from './HorizontalBarChart'
import { PALETTE } from '@/lib/palette'
import { countryFlag } from '@/lib/country-flags'

// Canonical list of US states + territories. Anything else appearing in `region`
// for a US-tagged row is treated as misparsed data (e.g. "England", "Lagos")
// and excluded from the US-state chart instead of corrupting the picture.
const US_STATES = new Set([
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware',
  'Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky',
  'Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri',
  'Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
  'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming',
  'District of Columbia','Puerto Rico','Guam','U.S. Virgin Islands',
])

interface RowSlim {
  country?: string | null
  region?: string | null
  continent?: string | null
}

interface Props {
  rows: RowSlim[]
  subtitle?: string
}

type Group = 'continent' | 'country' | 'us_state'

export default function CountryChart({ rows, subtitle }: Props) {
  const [group, setGroup] = useState<Group>('country')
  const [expanded, setExpanded] = useState(false)

  const data = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) {
      let key: string | undefined
      if (group === 'continent') {
        if (!r.continent) continue       // drop unclassified — was creating noisy "Unknown" bucket
        key = r.continent.trim()
      } else if (group === 'country') {
        if (!r.country) continue         // same — only chart rows with a real country
        key = r.country.trim()
      } else {
        // US state — only for US rows AND only those whose region looks like a real US state.
        const c = (r.country || '').toLowerCase()
        const isUS = c === 'united states' || c === 'usa' || c === 'us'
        if (!isUS) continue
        if (!r.region) continue          // skip "Unknown US" — meaningless bucket
        // Filter out non-US region values that got into US rows by Apify/Apollo
        // misparses (e.g. region='England' on a US-tagged row).
        if (!US_STATES.has(r.region.trim())) continue
        key = r.region.trim()
      }
      if (!key) continue
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return Array.from(counts.entries()).map(([label, value]) => {
      const prefix = group === 'country' ? countryFlag(label) : ''
      return { label: prefix ? `${prefix} ${label}` : label, value }
    })
  }, [rows, group])

  const segments: { key: Group; label: string }[] = [
    { key: 'continent', label: 'Continent' },
    { key: 'country', label: 'Country' },
    { key: 'us_state', label: 'US State' },
  ]

  const groupToggle = (
    <div className="flex bg-[#F5F5F5] rounded-md p-0.5">
      {segments.map(s => (
        <button
          key={s.key}
          onClick={() => setGroup(s.key)}
          className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-colors ${
            group === s.key ? 'bg-white text-[#333333] shadow-sm' : 'text-[#9C9C9C] hover:text-[#333333]'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <div className="relative">
        <HorizontalBarChart
          title="Geographic distribution"
          subtitle={subtitle ?? (group === 'us_state' ? 'US states only' : group === 'continent' ? 'Top continents' : 'Top 7 + Others')}
          data={data}
          maxRows={group === 'continent' ? 7 : 7}
          groupRest
          uniformColor={PALETTE.viridian}
          rightAction={
            <div className="flex items-center gap-2">
              {groupToggle}
              <button
                onClick={() => setExpanded(true)}
                className="text-[10px] font-bold uppercase tracking-wider text-[#046BB1] hover:underline"
              >
                Expand
              </button>
            </div>
          }
        />
      </div>

      {expanded && (
        <FullScreenCountry
          group={group}
          data={data}
          groupToggle={groupToggle}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  )
}

function FullScreenCountry({
  group, data, groupToggle, onClose,
}: {
  group: Group
  data: { label: string; value: number }[]
  groupToggle: React.ReactNode
  onClose: () => void
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((a, b) => a + b.value, 0)
  const max = sorted[0]?.value || 1

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-5xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DF]">
          <div>
            <h2 className="text-lg font-black text-[#333333]">Geographic distribution</h2>
            <p className="text-xs text-[#9C9C9C]">
              {sorted.length} {group === 'continent' ? 'continents' : group === 'country' ? 'countries' : 'US states'} · {total.toLocaleString()} records
            </p>
          </div>
          <div className="flex items-center gap-3">
            {groupToggle}
            <button onClick={onClose} className="text-[#9C9C9C] hover:text-[#333333] text-2xl leading-none">×</button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col gap-2">
            {sorted.map((r) => {
              const pct = total > 0 ? (r.value / total) * 100 : 0
              const width = (r.value / max) * 100
              return (
                <div key={r.label} className="flex items-center gap-3 text-[12px] py-1.5 border-b border-[#F5F5F5]">
                  <div className="flex-1 truncate font-medium text-[#333333]">{r.label}</div>
                  <div className="w-32 h-2 bg-[#F5F5F5] rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: `${width}%`, backgroundColor: PALETTE.viridian }} />
                  </div>
                  <div className="w-10 text-right tabular-nums font-semibold text-[#333333]">{r.value}</div>
                  <div className="w-14 text-right tabular-nums text-[#9C9C9C]">{pct.toFixed(1)}%</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
