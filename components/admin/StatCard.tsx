import { PALETTE } from '@/lib/palette'

interface Props {
  label: string
  value: number | string
  accent?: keyof typeof PALETTE
  hint?: string
}

export default function StatCard({ label, value, accent = 'azul', hint }: Props) {
  return (
    <div className="bg-white border border-[#E8E4DF] rounded-xl p-5 relative overflow-hidden">
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: PALETTE[accent] }}
      />
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#9C9C9C] mb-2">{label}</p>
      <p className="text-3xl font-black text-[#333333] tabular-nums leading-none">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {hint && <p className="text-[11px] text-[#9C9C9C] mt-2">{hint}</p>}
    </div>
  )
}
