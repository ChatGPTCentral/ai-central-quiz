// AI Central brand palette — single source of truth for chart + UI colors.
export const PALETTE = {
  babyPowder:     '#FFFDFA',
  jetBlack:       '#333333',
  cosmicLatte:    '#FEF7E7',
  azul:           '#046BB1',
  persianRed:     '#BE3B3B',
  jasper:         '#BE593B',
  fulvous:        '#E48715',
  xanthous:       '#E7B02F',
  asparagus:      '#62A758',
  viridian:       '#2D8879',
  verdigris:      '#38A7AD',
  marianBlue:     '#3B4C99',
  rosePompadour:  '#E26F8E',
  battleshipGrey: '#9C9C9C',
} as const

// Ordered ramp for use across multi-segment charts (skips light backgrounds).
export const CHART_COLORS = [
  PALETTE.azul,
  PALETTE.fulvous,
  PALETTE.asparagus,
  PALETTE.marianBlue,
  PALETTE.persianRed,
  PALETTE.viridian,
  PALETTE.xanthous,
  PALETTE.rosePompadour,
  PALETTE.jasper,
  PALETTE.verdigris,
] as const

// Stable hash → palette color (for grouping by free-form strings like industries)
export function colorForLabel(label: string, ramp = CHART_COLORS): string {
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return ramp[h % ramp.length]
}
