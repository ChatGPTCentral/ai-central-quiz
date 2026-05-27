'use client'

import { useMemo } from 'react'
import { PALETTE } from '@/lib/palette'

interface Props {
  /** Lifetime value in USD per row. Falsy values (null / 0) are paying-customer drops. */
  values: (number | null | undefined)[]
  title?: string
  /** LTV distribution by bucket (low / medium / high). Auto-computed from values. */
}

const LTV_BUCKETS: { label: string; min: number; max: number; color: string }[] = [
  { label: '$1-50',     min: 0.01,    max: 50,       color: '#62A758' },
  { label: '$50-100',   min: 50.01,   max: 100,      color: '#2D8879' },
  { label: '$100-500',  min: 100.01,  max: 500,      color: '#046BB1' },
  { label: '$500-2k',   min: 500.01,  max: 2000,     color: '#3B4C99' },
  { label: '$2k+',      min: 2000.01, max: Infinity, color: '#BE3B3B' },
]

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
  const { paying, total, avg, median, max, buckets } = useMemo(() => {
    const paying = values.filter((v): v is number => typeof v === 'number' && v > 0).sort((a, b) => a - b)
    const total = paying.reduce((a, b) => a + b, 0)
    const avg = paying.length > 0 ? total / paying.length : 0
    const median = paying.length > 0 ? paying[Math.floor(paying.length / 2)] : 0
    const max = paying.length > 0 ? paying[paying.length - 1] : 0

    // Bucket distribution (replaces the per-price breakdown that exposed every
    // unique amount as a row — too noisy when there are 50+ price points).
    const buckets = LTV_BUCKETS.map(b => {
      const count = paying.filter(v => v >= b.min && v <= b.max).length
      const sum   = paying.filter(v => v >= b.min && v <= b.max).reduce((a, b) => a + b, 0)
      return { ...b, count, sum }
    })
    return { paying, total, avg, median, max, buckets }
  }, [values])

  const maxBucketCount = Math.max(...buckets.map(b => b.count), 1)

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <header className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-black text-[#333333] tracking-tight">{title}</h3>
        <p className="text-[11px] text-[#9C9C9C] mt-0.5">N = {paying.length} paying customer{paying.length === 1 ? '' : 's'}</p>
      </header>

      {/* Top metrics strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-5 pb-3">
        <Metric label="Total revenue" value={`$${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} accent={PALETTE.asparagus} />
        <Metric label="Customers"     value={paying.length.toLocaleString()} accent={PALETTE.azul} />
        <Metric label="Avg"            value={`$${avg.toFixed(2)}`} accent={PALETTE.fulvous} />
        <Metric label="Median"         value={`$${median.toFixed(2)}`} accent={PALETTE.viridian} />
        <Metric label="Max"            value={`$${max.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} accent={PALETTE.persianRed} />
      </div>

      {/* Bucket distribution */}
      <div className="border-t border-[#E8E4DF] px-5 pt-3 pb-5">
        {paying.length === 0 ? (
          <p className="text-xs text-[#9C9C9C] py-4 text-center">No paying customers yet</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {buckets.map(b => {
              const width = (b.count / maxBucketCount) * 100
              const pct = paying.length > 0 ? (b.count / paying.length) * 100 : 0
              return (
                <div key={b.label} className="flex items-center gap-3 text-[12px]">
                  <div className="w-20 shrink-0 tabular-nums font-bold text-[#333333]">{b.label}</div>
                  <div className="flex-1 relative h-5 bg-[#F5F5F5] rounded">
                    <div className="absolute inset-y-0 left-0 rounded transition-all duration-500" style={{ width: `${width}%`, backgroundColor: b.color }} />
                  </div>
                  <div className="w-16 shrink-0 text-right tabular-nums text-[#9C9C9C]">{b.count} ppl</div>
                  <div className="w-20 shrink-0 text-right tabular-nums text-[#333333] font-semibold">${b.sum.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  <div className="w-14 shrink-0 text-right tabular-nums text-[#9C9C9C]">{pct.toFixed(0)}%</div>
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
