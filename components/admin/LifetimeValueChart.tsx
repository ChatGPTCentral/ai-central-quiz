'use client'

import { useMemo } from 'react'
import { PALETTE } from '@/lib/palette'

interface Props {
  /** Lifetime value in USD per row. Falsy values (null / 0) are paying-customer drops. */
  values: (number | null | undefined)[]
  title?: string
}

/**
 * Stripped-down revenue summary — just the two numbers that matter at a glance.
 * Total $ paid across the filtered cohort + the count of paying customers.
 */
export default function LifetimeValueChart({ values, title = 'Lifetime value' }: Props) {
  const { paying, total } = useMemo(() => {
    const paying = values.filter((v): v is number => typeof v === 'number' && v > 0)
    const total = paying.reduce((a, b) => a + b, 0)
    return { paying, total }
  }, [values])

  return (
    <section className="bg-white border border-[#E8E4DF] rounded-xl overflow-hidden">
      <header className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-black text-[#333333] tracking-tight">{title}</h3>
        <p className="text-[11px] text-[#9C9C9C] mt-0.5">Cumulative paid revenue across the filtered cohort</p>
      </header>
      <div className="grid grid-cols-2 gap-3 px-5 pb-5">
        <Metric label="Total revenue" value={`$${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} accent={PALETTE.asparagus} />
        <Metric label="Paying customers" value={paying.length.toLocaleString()} accent={PALETTE.azul} />
      </div>
    </section>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-[#E8E4DF] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-[#9C9C9C]">{label}</div>
      <div className="text-2xl font-black tabular-nums mt-1" style={{ color: accent }}>{value}</div>
    </div>
  )
}
