'use client'

import { useMemo } from 'react'
import { PALETTE } from '@/lib/palette'

interface Props {
  /** Lifetime value in USD per row. Falsy values (null / 0) are paying-customer drops. */
  values: (number | null | undefined)[]
  title?: string
}

/**
 * Per-customer LTV view — replaces the bucketed histogram with the actual
 * unique price points. Designed for a small paying-customer cohort (10s–100s);
 * if the unique amounts grow past a comfortable list, the rows scroll inside
 * the card.
 *
 * Top strip = total + customer count + average. Body = sorted unique amounts
 * with a horizontal bar sized by share of revenue.
 */
export default function LifetimeValueChart({ values, title = 'Lifetime value' }: Props) {
  const { paying, total, avg, unique } = useMemo(() => {
    const paying = values.filter((v): v is number => typeof v === 'number' && v > 0)
    const total = paying.reduce((a, b) => a + b, 0)
    const avg = paying.length > 0 ? total / paying.length : 0

    // Group by exact amount (rounded to cents)
    const m = new Map<number, number>()
    for (const v of paying) {
      const cents = Math.round(v * 100)
      m.set(cents, (m.get(cents) || 0) + 1)
    }
    const unique = Array.from(m.entries())
      .map(([cents, count]) => ({ amount: cents / 100, count, revenue: (cents / 100) * count }))
      .sort((a, b) => b.amount - a.amount)
    return { paying, total, avg, unique }
  }, [values])

  const maxRevenue = Math.max(...unique.map(u => u.revenue), 1)

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <header className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-black text-[#333333] tracking-tight">{title}</h3>
        <p className="text-[11px] text-[#9C9C9C] mt-0.5">N = {paying.length} paying customer{paying.length === 1 ? '' : 's'}</p>
      </header>

      {/* Top metrics strip */}
      <div className="grid grid-cols-3 gap-2 px-5 pb-3">
        <Metric label="Total" value={`$${total.toFixed(2)}`} accent={PALETTE.asparagus} />
        <Metric label="Customers" value={paying.length.toLocaleString()} accent={PALETTE.azul} />
        <Metric label="Avg" value={`$${avg.toFixed(2)}`} accent={PALETTE.fulvous} />
      </div>

      {/* Per-amount breakdown */}
      <div className="border-t border-[#E8E4DF] px-5 pt-3 pb-5 flex-1 overflow-auto max-h-[320px]">
        {unique.length === 0 ? (
          <p className="text-xs text-[#9C9C9C] py-4 text-center">No paying customers yet</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {unique.map(u => {
              const width = (u.revenue / maxRevenue) * 100
              const pct = total > 0 ? (u.revenue / total) * 100 : 0
              return (
                <div key={u.amount} className="flex items-center gap-3 text-[12px]">
                  <div className="w-20 shrink-0 tabular-nums font-bold text-[#333333]">${u.amount.toFixed(2)}</div>
                  <div className="flex-1 relative h-5 bg-[#F5F5F5] rounded">
                    <div
                      className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                      style={{ width: `${width}%`, backgroundColor: PALETTE.asparagus }}
                    />
                  </div>
                  <div className="w-16 shrink-0 text-right tabular-nums text-[#9C9C9C]">
                    × {u.count}
                  </div>
                  <div className="w-14 shrink-0 text-right tabular-nums text-[#333333] font-semibold">
                    {pct.toFixed(1)}%
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-[#E8E4DF] px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider font-bold text-[#9C9C9C]">{label}</div>
      <div className="text-base font-black tabular-nums" style={{ color: accent }}>{value}</div>
    </div>
  )
}
