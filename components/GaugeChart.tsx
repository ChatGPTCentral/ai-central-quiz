interface GaugeChartProps {
  value: number // 0–100
  label?: string
}

// Semicircular gauge chart, SVG-only
export default function GaugeChart({ value, label }: GaugeChartProps) {
  const pct = Math.max(0, Math.min(100, value))
  // Semi-circle: 180° arc. Total arc length ≈ π * radius
  const radius = 120
  const stroke = 22
  const cx = 150
  const cy = 150
  const circumference = Math.PI * radius // half circumference
  const dashOffset = circumference * (1 - pct / 100)

  // Needle position
  const angle = (pct / 100) * 180 - 180 // -180° (left) to 0° (right)
  const rad = (angle * Math.PI) / 180
  const needleLength = radius - stroke / 2 - 6
  const needleX = cx + needleLength * Math.cos(rad)
  const needleY = cy + needleLength * Math.sin(rad)

  return (
    <div className="relative w-full max-w-[300px] mx-auto">
      <svg viewBox="0 0 300 175" className="w-full">
        {/* Track */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="#EBEBEB"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="black"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={needleX} y2={needleY}
          stroke="black" strokeWidth="3" strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="6" fill="black" />
        {/* Score label */}
        <text x={cx} y={cy - 30} textAnchor="middle" fontSize="44" fontWeight="900" fill="black" fontFamily="Inter, sans-serif">
          {pct}%
        </text>
      </svg>
      {label && (
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 inline-flex items-center gap-1.5 px-3 py-1 bg-black text-white text-[11px] font-bold rounded-full whitespace-nowrap">
          {label}
        </div>
      )}
      <div className="flex items-center justify-between mt-4 px-2 text-[11px] text-gray-400 font-medium">
        <span>Just Starting</span>
        <span>Power User</span>
      </div>
    </div>
  )
}
