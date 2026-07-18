'use client'

// Real tabs for the person dossier. The server page composes every pane as
// JSX (so all sections stay server-rendered, with their InlineField /
// RawDataSection / DeleteButton client islands intact) and this thin client
// shell only decides which pane is visible. Active tab = black plate sitting
// on the 2px jet rule, meta line right-aligned.

import { useState, type ReactNode } from 'react'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'survey', label: 'Survey' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'enrichment', label: 'Enrichment' },
  { key: 'rawdata', label: 'Raw data' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface Props {
  overview: ReactNode
  survey: ReactNode
  revenue: ReactNode
  enrichment: ReactNode
  rawdata: ReactNode
  /** Right-aligned meta on the strip, e.g. "submitted Jul 5, 2026 · id AC-1A2B". */
  meta: string
}

export default function DossierTabs({ overview, survey, revenue, enrichment, rawdata, meta }: Props) {
  const [active, setActive] = useState<TabKey>('overview')
  const panes: Record<TabKey, ReactNode> = { overview, survey, revenue, enrichment, rawdata }

  return (
    <div className="min-w-0">
      <div className="flex items-center" style={{ borderBottom: '2px solid #333333' }}>
        {TABS.map(t => {
          const isActive = t.key === active
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              aria-pressed={isActive}
              style={{
                padding: '9px 18px',
                fontSize: 12.5,
                fontWeight: 700,
                background: isActive ? '#333333' : 'transparent',
                color: isActive ? '#FFFDFA' : '#6B6B6B',
              }}
              className={isActive ? undefined : 'hover:text-[#1A1A1A]'}
            >
              {t.label}
            </button>
          )
        })}
        <span className="ml-auto truncate" style={{ fontSize: 10.5, color: '#9C9C9C', paddingLeft: 14 }}>
          {meta}
        </span>
      </div>
      <div style={{ paddingTop: 20 }}>{panes[active]}</div>
    </div>
  )
}
