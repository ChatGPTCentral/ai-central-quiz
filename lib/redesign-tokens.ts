// Shared palette for the result_page_v4 'redesign' arm only. Deliberately
// separate from the page-level INK/RICH/CREAM/FULVOUS tokens in
// app/result/page.tsx: those back every OTHER arm (control included), and a
// shared token file would have meant editing this palette risked recoloring
// control too. Font stays Inter (next/font, already loaded site-wide in
// app/layout.tsx) rather than adding a second webfont: /result is already
// the slowest page on the site (LCP ~5.1s p75, see the preconnect comments
// in page.tsx), and a new Google Font for one experiment arm would make
// that worse for no proven reason yet.

export const NAVY = '#1D3557'
export const NAVY_SOFT = '#3C5B87'
export const RD_BODY = '#52698C'
export const RD_MUTE = '#8A9BB5'
export const RD_CREAM = '#FEF7E7'
export const RD_PAPER = '#FFFDFA'
export const RD_FULVOUS = '#E48715'
export const RD_FULVOUS_DEEP = '#C4700D'
export const RD_GOLD = '#FFDB73'
export const RD_GREEN = '#2D6A26'
export const RD_GREEN_BG = '#E4F2E2'
export const RD_LINE = '#E7ECF3'
export const RD_RADIUS = 16
export const RED_URGENT = '#C81E3A'
