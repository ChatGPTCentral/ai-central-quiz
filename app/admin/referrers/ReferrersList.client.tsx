'use client'

// Expandable referrer rows: the referrer (face, LinkedIn, score) on the row,
// a dropdown revealing the actual people they brought in, each with their own
// face, LinkedIn, score and paid flag — "who brought who" in one glance.

import { useState } from 'react'
import Avatar from '@/components/admin/Avatar.client'
import type { DetailedReferrer, ReferredPerson } from '@/lib/referrer'

const BORDER = '#E8E4DF'
const MUTE = '#9C9C9C'

function LinkedinLink({ url, size = 13 }: { url: string | null; size?: number }) {
  if (!url) return <span style={{ fontSize: size - 2, color: '#D8D2C8' }}>no li</span>
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={url}
      className="inline-flex items-center justify-center rounded hover:opacity-70"
      style={{ width: size + 7, height: size + 7, background: '#0A66C2', color: '#FFF', fontSize: size - 3, fontWeight: 800 }}
    >in</a>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span style={{ fontSize: 11, color: '#D8D2C8' }}>—</span>
  return (
    <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 800, color: '#E48715' }}>
      {score}<span style={{ fontSize: 9.5, fontWeight: 600, color: MUTE }}>/100</span>
    </span>
  )
}

function ReferredRow({ p }: { p: ReferredPerson }) {
  return (
    <a
      href={`/admin/submissions/${p.id}`}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-[#FAF7F1]"
    >
      <span style={{ color: '#C4BDB2', fontSize: 12 }}>↳</span>
      <Avatar name={p.name} email={p.email} photoUrl={p.photoUrl} size={24} />
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A' }}>
          {p.name || '(no name)'}
          {p.paid && <span className="ml-2 text-[9.5px] font-black" style={{ color: '#2E7D32' }}>PAID</span>}
        </span>
        <span className="block truncate" style={{ fontSize: 11, color: MUTE }}>{p.email}</span>
      </span>
      <span className="shrink-0 tabular-nums" style={{ fontSize: 10.5, color: MUTE }}>
        {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
      </span>
      <span className="shrink-0 w-12 text-right"><ScoreBadge score={p.score} /></span>
      <span className="shrink-0"><LinkedinLink url={p.linkedinUrl} size={11} /></span>
    </a>
  )
}

export default function ReferrersList({ referrers }: { referrers: DetailedReferrer[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setOpen(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  if (referrers.length === 0) {
    return (
      <div className="bg-white border rounded-xl p-8 text-center" style={{ borderColor: BORDER }}>
        <p className="text-sm" style={{ color: MUTE }}>No pass_share referrals yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-xl overflow-hidden" style={{ borderColor: BORDER }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4" style={{ height: 34, borderBottom: `1px solid ${BORDER}`, background: '#FFFDFA' }}>
        <span style={{ width: 22 }} />
        <span className="flex-1" style={{ fontSize: 11.5, fontWeight: 600, color: '#7d7d7d' }}>Referrer</span>
        <span className="w-12 text-right" style={{ fontSize: 11.5, fontWeight: 600, color: '#7d7d7d' }}>Score</span>
        <span className="w-8 text-center" style={{ fontSize: 11.5, fontWeight: 600, color: '#7d7d7d' }}>Li</span>
        <span className="w-16 text-right" style={{ fontSize: 11.5, fontWeight: 600, color: '#7d7d7d' }}>Referred</span>
        <span className="w-14 text-right" style={{ fontSize: 11.5, fontWeight: 600, color: '#7d7d7d' }}>Paid</span>
        <span style={{ width: 26 }} />
      </div>

      {referrers.map((r, i) => {
        const expanded = open.has(r.id)
        return (
          <div key={r.id} style={{ borderBottom: i < referrers.length - 1 ? `1px solid #F5F2EC` : 'none' }}>
            {/* Referrer row (click anywhere to expand) */}
            <button
              onClick={() => toggle(r.id)}
              className="w-full flex items-center gap-3 px-4 text-left hover:bg-[#FAF7F1] transition-colors"
              style={{ height: 52, background: expanded ? '#FAF7F1' : undefined }}
              aria-expanded={expanded}
            >
              <span className="tabular-nums" style={{ width: 22, fontSize: 12, color: MUTE }}>{i + 1}</span>
              <Avatar name={r.name} email={r.email} photoUrl={r.photoUrl} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1A1A' }}>
                  <a
                    href={`/admin/submissions/${r.id}`}
                    onClick={e => e.stopPropagation()}
                    className="hover:underline"
                  >{r.name || r.email || '(no name)'}</a>
                  {r.isCustomer && <span className="ml-2 text-[9.5px] font-black" style={{ color: '#2E7D32' }}>CUSTOMER</span>}
                </span>
                {r.email && r.name && <span className="block truncate" style={{ fontSize: 11, color: MUTE }}>{r.email}</span>}
              </span>
              <span className="w-12 text-right shrink-0"><ScoreBadge score={r.score} /></span>
              <span className="w-8 text-center shrink-0"><LinkedinLink url={r.linkedinUrl} /></span>
              <span className="w-16 text-right shrink-0 tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: '#333333' }}>{r.referred}</span>
              <span className="w-14 text-right shrink-0 tabular-nums" style={{ fontSize: 13, fontWeight: r.referredPaid > 0 ? 800 : 400, color: r.referredPaid > 0 ? '#2E7D32' : '#C4BDB2' }}>{r.referredPaid || '—'}</span>
              <span
                className="shrink-0 inline-flex items-center justify-center transition-transform"
                style={{ width: 26, color: MUTE, transform: expanded ? 'rotate(180deg)' : undefined }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </button>

            {/* Who they brought in */}
            {expanded && (
              <div className="px-4 pb-3 pt-1" style={{ background: '#FCFAF6' }}>
                <div className="pl-8">
                  {r.people.length === 0
                    ? <p style={{ fontSize: 12, color: MUTE, padding: '6px 0' }}>No records resolved.</p>
                    : r.people.map(p => <ReferredRow key={p.id} p={p} />)}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
